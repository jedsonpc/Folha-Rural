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

test("calculates the employee daily rate from the monthly salary", async () => {
  const tabs = await readFile(new URL("../app/worker-hr-tabs.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/hr/route.ts", import.meta.url), "utf8");
  assert.match(tabs, /Valor da diária \(R\$\)/);
  assert.match(tabs, /Cálculo automático: salário mensal ÷ 30/);
  assert.match(tabs, /Number\(salary\.baseSalary\)\/30/);
  assert.match(tabs, /readOnly/);
  assert.match(route, /Math\.round\(salary\/30\)/);
  assert.match(route, /Math\.round\(baseSalaryCents \/ 30\)/);
});

test("applies the statutory vacation entitlement bands", async () => {
  const tabs = await readFile(new URL("../app/worker-hr-tabs.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/hr/route.ts", import.meta.url), "utf8");
  for (const source of [tabs, route]) {
    assert.match(source, /absences\s*<=\s*5\)\s*return 30/);
    assert.match(source, /absences\s*<=\s*14\)\s*return 24/);
    assert.match(source, /absences\s*<=\s*23\)\s*return 18/);
    assert.match(source, /absences\s*<=\s*32\)\s*return 12/);
  }
  assert.match(tabs, /Limite do período concessivo/);
  assert.match(tabs, /Até 2 dias antes do início das férias/);
  assert.match(tabs, /Math\.floor\(days\/3\)/);
});

test("uses the Brazilian monetary input across financial registrations", async () => {
  const currency = await readFile(new URL("../app/currency-input.tsx", import.meta.url), "utf8");
  assert.match(currency, /minimumFractionDigits: 2/);
  assert.match(currency, /maximumFractionDigits: 2/);
  assert.match(currency, /currency-tight/);
  for (const file of ["worker-hr-tabs.tsx", "launches-module.tsx", "unions-module.tsx", "registrations-module.tsx", "inventory-module.tsx"]) {
    const source = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.match(source, /CurrencyInput/);
  }
});
