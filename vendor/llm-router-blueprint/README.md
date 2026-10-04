# llm-router-blueprint

Provider-agnostic LLM routing with **Model×Key quota arbitrage**, persistent quota state, and a provider-chain-first orchestrator. Zero runtime dependencies. Ported from a production system that keeps a chatty LLM app alive on free-tier quotas alone.

## The concept: why Model×Key arbitrage

Free-tier quotas differ massively per model, and every API key is its own project with its own quota. A naive setup — one model, one key — is either good and empty after ~N requests per day, or generous but weak. This package attacks the problem on two axes at once:

- **Model chain**: an ordered list `[primary, ...fallbacks]`. The primary is the best model; fallbacks are weaker but carry their own quotas.
- **Key pool**: several API keys, each backed by its own project and therefore its own per-model quota.

Locks are booked per **Model×Key pair**, and the cascade is **model-major**: for each model, every free key is tried before the cascade advances to the next model. Round-robin key selection spreads load across projects so consecutive calls don't grill the same key first every time.

The router never sees an SDK. You inject `exec(model, apiKey)` and the router supplies the failover discipline; error semantics come from a structured classifier, so any provider whose errors carry a status code (or a recognizable message) works.

## The decision chain

```
callLLM(prompt)
  └─ 1. Provider chain (OpenAI-compatible endpoints, e.g. tunnel → local LLM)
  │      probe GET {base}/v1/models (3 s, Bearer auth)
  │      → streaming chat call → optional content validation
  │      → first hit wins; all fail → step 2
  └─ 2. Key-pool router
         chain = resolveModelChain(config, { backgroundFirst, overrideModel })
         keys  = resolveApiKeys(dbKey, envList, envSingle)
         per model (in chain order), per key (round-robin):
           exec(model, key) → success | classified failover | throw
```

## Error classes and their consequences

`classifyError` (src/errors.ts) prefers structured fields (`error.status`, `error.code`, `error.response.status`, Google-style `error.error.{code,status}`) and falls back to message-string matching only when no structure is present. Five disjoint classes:

| Class | Trigger | Consequence |
|---|---|---|
| `quota` / `rpm` | 429 / `RESOURCE_EXHAUSTED` without a per-day hint | 60 s cooldown on the Model×Key pair |
| `quota` / `rpd` | 429 with "per-day"/"daily" in the message | pair locked until midnight **Pacific Time** (provider daily quotas reset at PT midnight) |
| `invalid-model` | 404 / `NOT_FOUND` | model is dead for **all keys**, skipped for the process lifetime |
| `invalid-key` | 401/403 / `API_KEY_INVALID` / `PERMISSION_DENIED` | key is dead **across all models**, next key is tried |
| `transient` | 5xx / `UNAVAILABLE` / abort / network failure | one retry (15 s) **only on the last candidate**, then a 30 s model-wide lock — overload is shared provider-side capacity, so the next key of the same model would hit the same wall |
| `content` | `ContentRejectedError` — the caller's `validate` hook rejected the answer | **no lock at all**: the pair is struck from this one call's candidates and tried again on the next call. The answer was wrong for this prompt, which says nothing about the pair's quota |

Anything else is **thrown immediately** — a real defect must never masquerade as rate limiting. A 429 without a per-day hint is conservatively treated as per-minute: waiting a minute is cheap, burning a day is not.

Total exhaustion (nothing free when a call starts): the router waits only on the **earliest expiring short lock** (at most `rpmCooldownMs`) or on an in-flight pair being released by a parallel call — never on day locks. Otherwise it throws a descriptive error.

## Structured calls: `system`, `schema`, `validate`

`callLLM(prompt, config)` carries three options for calls whose answer must have a shape:

```ts
await orch.callLLM(taskPrompt, {
  system: systemPrompt,        // kept out of the user turn
  schema: responseJsonSchema,  // passed through verbatim
  validate: (text) => parse(text) !== null,
});
```

- **`system`** reaches the executor as `request.system` instead of being prepended to the prompt, so it can be mapped to the provider's own slot (Gemini `systemInstruction`, a `system` message on the OpenAI-compatible chain). Two reasons: instructions bind more firmly from the instruction role, and untrusted input stays out of it.
- **`schema`** is passed through untyped (`unknown`) — the shape belongs to the provider, and this blueprint carries no SDK. The Gemini executor maps it to `responseJsonSchema`; the OpenAI-compatible chain only switches on JSON mode (`response_format: {type: 'json_object'}`), because per-provider `json_schema` support is too uneven to send blind down a chain whose point is that any endpoint can stand in.
- **`validate`** now governs **both** transports. A rejected answer is not a provider failure, but it is not usable either, so it fails over: next provider in the chain, next Model×Key pair in the router. A weaker fallback model that cannot hold the contract yields instead of surfacing garbage. When the last candidate is rejected too, the call throws `ContentRejectedError`. Validation runs **after** the MAX_TOKENS retry, so a truncated answer gets its doubled budget on the same pair before the candidate is written off.

## Foreground / background strategy

`resolveModelChain(config, { backgroundFirst: true })` reverses the fallback list and appends the primary last: background traffic (summaries, extraction, ambient tasks) starts at the quota-richest end, keeping the primary model's narrow daily budget reserved for foreground calls. `overrideModel` (an explicit per-call model choice) replaces only the primary and keeps the fallbacks as a safety net.

## Concurrency and persistence

- **Mutex**: candidate selection, cursor advance and every state mutation run under a single promise-chain mutex. A picked pair is claimed as in-flight and is invisible to parallel callers until released — two concurrent calls never execute on the same pair at the same time; the second waits for the release or takes the next candidate.
- **`StateStore`**: the router loads its state at start and saves after every mutation. `InMemoryStore` (default) reproduces the original in-process behavior. `JsonFileStore(path)` persists `quotaState`, `deadKeys` and `deadModels` with atomic writes (tmp file + rename) and tolerant reads (missing/corrupt file → empty state) — RPD exhaustion survives a restart instead of being re-discovered at the price of one burned request per pair.

## Configuration surface

```ts
createKeyPoolRouter({
  retryAfterMs,        // wait before the single retry on the last chain link — default 15_000
  rpmCooldownMs,       // pair lock after an RPM 429 — default 60_000
  transientCooldownMs, // model-wide lock after a transient error — default 30_000
  stateStore,          // InMemoryStore (default) | JsonFileStore(path) | your own
  now, sleep, log,     // injectable for tests / logging
})

createLLMOrchestrator({
  providers,           // OpenAI-compatible chain, tried first
  getModelChainConfig, // live getter: { primary, fallbacks }
  apiKeys,             // array or live getter of sources (multi-key strings allowed)
  defaultModel,
  createClient,        // (apiKey) => client — cached per key
  exec,                // (client, { model, prompt, temperature, maxTokens, system?, schema? }) => { text, finishReason }
  router, routerOptions,
  tokenBudgets,        // defaults: micro 512, structured 1024, chat 2048, retryCap 4096
  fetch, log,
})
```

## Tuning constants, and why

| Constant | Default | Reason |
|---|---|---|
| `PROBE_TIMEOUT_MS` | 3 s | a dead endpoint must fall out fast; the probe carries the Bearer token because auth-protected servers answer 401 otherwise and would be misread as "down" |
| `TTFB_TIMEOUT_MS` + `PER_TOKEN_TIMEOUT_MS` | 180 s + 150 ms/token | slow local hardware (e.g. ~11–20 tok/s) makes any fixed cap abort every long answer; the budget scales with the requested output tokens |
| `retryAfterMs` | 15 s | burst buffer for simultaneous foreground + background traffic on the last available pair |
| `rpmCooldownMs` | 60 s | per-minute quota windows are one minute long |
| `transientCooldownMs` | 30 s | overload is more volatile than quota — shorter than the RPM lock |
| `TOKEN_BUDGETS.retryCap` | 4096 | the MAX_TOKENS retry doubles the start budget (floor 1024) up to this ceiling |

The MAX_TOKENS retry is a **safety net, not a strategy**: if it fires in normal operation, every call costs two model requests. Length limits belong in the prompt, not in the token cap — a higher `maxOutputTokens` costs nothing while answers stay short.

## Usage

### Gemini via `@google/genai` (SDK stays in your app)

```ts
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  JsonFileStore,
  createLLMOrchestrator,
} from 'llm-router-blueprint';

const orchestrator = createLLMOrchestrator<GoogleGenAI>({
  // Key resolution: onboarding/db key first, then env single, then env list.
  // Each source may itself carry several keys (comma/semicolon/whitespace).
  apiKeys: () => [
    db.get('geminiApiKey'),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEYS, // "key1,key2,key3"
  ],
  getModelChainConfig: () => ({
    primary: 'gemini-3.5-flash',
    fallbacks: ['gemini-3.5-flash-lite'],
  }),
  createClient: (apiKey) => new GoogleGenAI({ apiKey }), // cached per key
  exec: async (ai, req) => {
    const response = await ai.models.generateContent({
      model: req.model,
      contents: req.prompt,
      config: {
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        // Thinking tokens share the output budget on Gemini 3.x — pin a low
        // thinkingLevel for chat/high-throughput. Model-dependent: 2.5
        // models only understand thinkingBudget (0 = off), older ones none.
        ...(req.model.startsWith('gemini-3')
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : req.model.startsWith('gemini-2.5')
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : {}),
      },
    });
    return {
      text: response.text ?? '',
      finishReason: response.candidates?.[0]?.finishReason, // 'MAX_TOKENS' triggers the retry
    };
  },
  // Quota state survives restarts:
  routerOptions: { stateStore: new JsonFileStore('./router-state.json'), log: console.warn },
});

const { text, provider } = await orchestrator.callLLMWithMeta('Summarize …', {
  maxTokens: 512,           // omit → TOKEN_BUDGETS.micro
  // model: 'gemini-3.5-flash',  // explicit choice: overrides primary, keeps fallbacks
});
// No explicit model → backgroundFirst: chain starts at the fallbacks.
```

### OpenAI-compatible chain (tunnel → local LLM)

```ts
import { createLLMOrchestrator } from 'llm-router-blueprint';

const orchestrator = createLLMOrchestrator({
  providers: [
    { name: 'ngrok', url: process.env.NGROK_LLM_URL!, apiKey: process.env.NGROK_LLM_KEY!, model: 'qwen3' },
    { name: 'local', url: process.env.LOCAL_LLM_URL!, apiKey: process.env.LOCAL_LLM_KEY!, model: 'qwen3' },
  ],
  apiKeys: [process.env.GEMINI_API_KEYS],
  getModelChainConfig: () => ({ primary: 'gemini-3.5-flash' }),
  createClient: (key) => new MyGeminiClient(key),
  exec: myGeminiExec,
});

await orchestrator.callLLM('prompt', {
  validate: (text) => text.length > 20, // rejected answer = transport failure → next provider
});
```

### Direct router use

```ts
import { createKeyPoolRouter, resolveApiKeys, resolveModelChain } from 'llm-router-blueprint';

const router = createKeyPoolRouter(); // one instance, reused — its memory accumulates
const chain = resolveModelChain({ primary: 'a', fallbacks: ['b', 'c'] }, { backgroundFirst: true });
const keys = resolveApiKeys(process.env.MY_KEYS);
const { result, model, apiKey } = await router.call(chain, keys, (m, k) => mySdkCall(m, k));
```

## Differences from a naive single-key setup

- One 429 no longer ends the request: the cascade has `models × keys` candidates, and RPM/RPD are handled differently (minute cooldown vs. day lock) instead of one blunt backoff.
- A dead key (401/403) or a renamed model (404) degrades the pool instead of breaking the app.
- Background traffic stops eating the primary model's daily budget.
- A 503 stops costing one failed request per key — the model-wide transient lock skips the whole model.
- Quota state survives restarts (with `JsonFileStore`), so a restarted process doesn't re-pay the discovery cost of every lock.
- Parallel calls can't stampede the same pair — the mutex serializes candidate selection.

## Known limitations

- **Reactive, not proactive quota learning**: the router discovers limits by hitting them (one failed request books the lock). It does not track per-pair request counters to preempt a 429.
- **Process-wide dead keys/models**: 401/403 and 404 markers have no expiry other than a restart (or deleting them from the state file) — a key that regains permission stays dead until then.
- **No cross-process coordination**: two processes sharing one `JsonFileStore` each hold their own in-memory copy; the file is a checkpoint, not a live shared lock. The in-flight mutex is per process.
- **PT day boundary**: the RPD reset follows `America/Los_Angeles`, matching Google's reset. Providers with a different reset zone need a different `pacificDateString` (currently not injectable).
- The retry-on-last-candidate and wait-on-short-lock behavior is bounded by wall-clock sleeps — callers with hard latency budgets should wrap calls in their own timeout.

## Development

```bash
npm install
npm run typecheck   # tsc over src + tests
npm test            # tsx --test, all tests network-free (injected exec/fetch/now/sleep)
npm run build       # tsc → dist/
```
