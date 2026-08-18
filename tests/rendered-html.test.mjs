import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the installable app metadata and update worker", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  const serviceWorker = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );

  assert.equal(manifest.name, "Folha Rural");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.match(serviceWorker, /SKIP_WAITING/);
  assert.match(serviceWorker, /folha-rural-shell-v22-cartao-ponto-legibilidade/);
  assert.match(serviceWorker, /skipWaiting/);
});

test("sends Access history separately from registry data", async () => {
  const importer = await readFile(
    new URL("../app/access-importer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(importer, /historyEntries: entries = \[\], \.\.\.registryData/);
  assert.match(importer, /body: JSON\.stringify\(registryData\)/);
  assert.doesNotMatch(importer, /body: JSON\.stringify\(data\)/);
});

test("keeps the edited service nature when saving", async () => {
  const services = await readFile(
    new URL("../app/services-module.tsx", import.meta.url),
    "utf8",
  );

  assert.match(services, /service\.entryType \?\? service\.nature/);
  assert.match(services, /entryType: nature, nature/);
  assert.match(services, /setForm\(\{ \.\.\.form, entryType: nature, nature \}\)/);

  const route = await readFile(
    new URL("../app/api/services/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /normalizeNature\(b\.entryType \?\? b\.nature\)/);
  assert.match(route, /normalizeNature\(body\.entryType \?\? body\.nature\)/);
});
