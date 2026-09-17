# llm-router-blueprint (vendored)

Vendored-Snapshot von `llm-router-blueprint` (Upstream:
`https://github.com/deusexlumen/llm-router-blueprint`, Commit `09922e2`,
MIT laut package.json).

**Grund:** Die Dependency lag als `file:../llm-router-blueprint` vor — ein
Pfad außerhalb dieses Repos. Jeder Clone oder CI-Lauf ohne das Sibling-Repo
brach bei `pnpm install`. Ein Registry-Paket existiert nicht (npm 404), und
das Upstream-Git-Repo enthält `dist/` nicht (gitignored), während die
package.json-Exports auf `./dist/index.js` zeigen — eine Git-Dependency
wäre nach frischem Checkout unbrauchbar gewesen.

**Vorgehen:** Vollständiger Snapshot (package.json, `dist/`, `src/`,
`tests/`, tsconfigs, README) aus dem funktionierenden Arbeitsverzeichnis
kopiert; `node_modules` wurde nicht übernommen. `package.json` des
Hauptprojekts zeigt auf `file:vendor/llm-router-blueprint`. Updates aus
dem Upstream werden per Snapshot-Ersetzung hierher übertragen.
