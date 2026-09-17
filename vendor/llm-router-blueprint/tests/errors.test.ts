import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../src/errors.js';
import { errorWith } from './helpers.js';

test('structured status 429 classifies as quota without any message text', () => {
  assert.deepEqual(classifyError(errorWith('', { status: 429 })), { class: 'quota', quota: 'rpm' });
});

test('structured google-style body: error.code numeric + error.status string', () => {
  const err = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_requests_per_model_per_day' } };
  assert.deepEqual(classifyError(err), { class: 'quota', quota: 'rpd' });
});

test('structured 404 without not-found text kills the model; axios-style response.status works', () => {
  assert.equal(classifyError(errorWith('', { status: 404 }))?.class, 'invalid-model');
  assert.equal(classifyError(errorWith('', { response: { status: 403 } }))?.class, 'invalid-key');
  assert.equal(classifyError(errorWith('', { status: 503 }))?.class, 'transient');
});

test('string fallback keeps working for unstructured errors', () => {
  assert.deepEqual(classifyError(new Error('429 You exceeded your current quota')), { class: 'quota', quota: 'rpm' });
  assert.deepEqual(classifyError(new Error('RESOURCE_EXHAUSTED: daily limit reached')), { class: 'quota', quota: 'rpd' });
  assert.equal(classifyError(new Error('404 models/x is not found for API version v1beta, or is not supported'))?.class, 'invalid-model');
  assert.equal(classifyError(new Error('API key not valid. Please pass a valid API key.'))?.class, 'invalid-key');
  assert.equal(classifyError(new Error('401 UNAUTHENTICATED'))?.class, 'invalid-key');
  assert.equal(classifyError(new Error('503 UNAVAILABLE: experiencing high demand'))?.class, 'transient');
  assert.equal(classifyError(new Error('500 INTERNAL'))?.class, 'transient');
});

test('abort and network failures are transient even without any status code', () => {
  assert.equal(classifyError(errorWith('The operation was aborted', { name: 'AbortError' }))?.class, 'transient');
  assert.equal(classifyError(new TypeError('fetch failed'))?.class, 'transient');
  assert.equal(classifyError(new Error('connect ETIMEDOUT'))?.class, 'transient');
});

test('429 without a per-day hint is conservatively rpm', () => {
  assert.equal(classifyError(new Error('429 too many requests'))?.quota, 'rpm');
  assert.equal(classifyError(new Error('429 quota exceeded (per-day)'))?.quota, 'rpd');
});

test('unknown errors return null (router must throw, never fail over)', () => {
  assert.equal(classifyError(new Error('400 invalid argument')), null);
  assert.equal(classifyError(errorWith('nope', { status: 400 })), null);
  assert.equal(classifyError(errorWith('billing hard limit', { status: 402 })), null);
  assert.equal(classifyError(undefined), null);
});

test('non-Error thrown values are classified via their string form', () => {
  assert.deepEqual(classifyError('429 RESOURCE_EXHAUSTED per-day quota'), { class: 'quota', quota: 'rpd' });
});

test('quota wins over transient-looking text in the same message', () => {
  assert.equal(classifyError(new Error('429 RESOURCE_EXHAUSTED, backend UNAVAILABLE'))?.class, 'quota');
});
