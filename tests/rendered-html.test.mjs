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
  assert.match(serviceWorker, /folha-rural-shell-v66-folha-rural-1\.4\.78/);
  assert.match(serviceWorker, /folha-rural-data-v1/);
  assert.match(serviceWorker, /Dados não baixados para uso offline/);
  assert.match(serviceWorker, /skipWaiting/);
});

test("does not require legacy PIS or identity fields for worker review", async () => {
  const review = await readFile(
    new URL("../app/worker-review.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(review, /require\("pis"/);
  assert.doesNotMatch(review, /require\("identityNumber"/);
  assert.doesNotMatch(review, /require\("identityIssuer"/);
  assert.match(review, /require\("cpf", "CPF"/);
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

test("filters Access imports before building the review report", async () => {
  const importer = await readFile(
    new URL("../app/access-importer.tsx", import.meta.url),
    "utf8",
  );
  const parser = await readFile(
    new URL("../app/access-browser-parser.ts", import.meta.url),
    "utf8",
  );
  assert.match(importer, /Novos colaboradores/);
  assert.match(importer, /Todos os lançamentos/);
  assert.match(importer, /Competência específica/);
  assert.match(importer, /Ano específico/);
  assert.match(importer, /Custos e estoque/);
  assert.match(importer, /Culturas/);
  assert.match(importer, /registros\s+validados;/);
  assert.match(importer, /incluídos ou atualizados/);
  assert.match(parser, /filter\.scope==="launches-month"/);
  assert.match(parser, /filter\.scope==="launches-year"/);
  assert.match(parser, /sequences\.has\(n\(r\.Sequencia\)\)/);
  assert.match(parser, /TB_Grupo_Insumos/);
  assert.match(parser, /TB_Atividades/);
});

test("includes imported Access entries and calculates DSR from weekly remuneration", async () => {
  const launches = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(launches, /sourceSequence\s*!=\s*null\)\s*continue/);
  assert.doesNotMatch(launches, /entry\.sourceSequence==null/);
  assert.match(
    launches,
    /eligible\s*=\s*!unjustified\s*&&\s*!lowDay\s*&&\s*total\s*>\s*0/,
  );
  assert.match(
    launches,
    /dsrMinimum = \(dailyRateCents: number\) => Math\.round\(dailyRateCents \/ 6\)/,
  );
  assert.match(
    launches,
    /admissionWeek\s*\?\s*calculated\s*:\s*Math\.max\(calculated, dsrMinimum\(dailyRateCents\)\)/,
  );
  assert.match(
    launches,
    /dsrAmount\(total, daily, admissionWeek\)/,
  );
  assert.match(launches, /dsrAmount\(w\.total, row\.daily, admissionWeek\) \* rests/);
  assert.match(
    launches,
    /calculated\s*=\s*eligible\s*\?\s*dsrAmount\(total, daily, admissionWeek\)\s*:\s*0/,
  );
  assert.match(launches, /!isSunday\(entry\.entryDate\)/);
  assert.match(
    launches,
    /isSunday\(e\.entryDate\)\s*\|\|\s*isDsrService\(service\)/,
  );
  assert.match(
    launches,
    /O DSR não pode ser inferior a 1\/6 da diária, exceto na semana de admissão/,
  );
});

test("preserves three decimal places in unit prices and calculates imported totals before DSR", async () => {
  const parser = await readFile(
    new URL("../app/access-browser-parser.ts", import.meta.url),
    "utf8",
  );
  const importer = await readFile(
    new URL("../app/api/import-history/route.ts", import.meta.url),
    "utf8",
  );
  const launches = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const cloud = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.equal(Math.round((200 * Math.round(0.274 * 1000)) / 10), 5480);
  assert.match(parser, /unitPriceMills=Math\.round\(unitPrice\*1000\)/);
  assert.match(
    importer,
    /unitPriceMills = Math\.round\(num\(row\.Preco\) \* 1000\)/,
  );
  assert.match(launches, /decimalPlaces=\{3\}/);
  assert.match(launches, /unitPriceMills \?\? entry\.unitPriceCents \* 10/);
  assert.match(
    cloud,
    /Math\.round\(\(Number\(row\.amount_cents\) \* 10\) \/ Number\(row\.quantity\)\)/,
  );
  assert.match(
    cloud,
    /amount_cents:\s*Math\.round\(\(quantity \* unitMills\) \/ 10\)/,
  );
});

test("uses the Brazilian civil date and the current release date", async () => {
  const dates = await readFile(
    new URL("../app/br-date.ts", import.meta.url),
    "utf8",
  );
  const launches = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dates, /timeZone: "America\/Fortaleza"/);
  assert.match(launches, /const iso = brazilToday/);
  assert.match(page, /LAST_UPDATE = "25\/09\/2026"/);
});

test("loads complete DSR weeks across month boundaries", async () => {
  const localApi = await readFile(
    new URL("../app/api/launches/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  const launches = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  for (const api of [localApi, cloudApi]) {
    assert.match(api, /const weeklyRange =/);
    assert.match(
      api,
      /range = reportOnly \? \{ start, end \} : weeklyRange\(start, end\)/,
    );
  }
  assert.match(
    cloudApi,
    /entry_date=gte\.\$\{range\.start\}&entry_date=lt\.\$\{range\.end\}/,
  );
  assert.match(launches, /if \(e\.entryDate\.startsWith\(month\)\)/);
});

test("keeps the edited service nature when saving", async () => {
  const services = await readFile(
    new URL("../app/services-module.tsx", import.meta.url),
    "utf8",
  );

  assert.match(services, /service\.entryType \?\? service\.nature/);
  assert.match(services, /entryType: nature, nature/);
  assert.match(
    services,
    /setForm\(\{ \.\.\.form, entryType: nature, nature \}\)/,
  );

  const route = await readFile(
    new URL("../app/api/services/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /normalizeNature\(b\.entryType \?\? b\.nature\)/);
  assert.match(route, /normalizeNature\(body\.entryType \?\? body\.nature\)/);
});

test("calculates the employee daily rate from the monthly salary", async () => {
  const tabs = await readFile(
    new URL("../app/worker-hr-tabs.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/hr/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(tabs, /Valor da diária \(R\$\)/);
  assert.match(tabs, /Cálculo automático: salário mensal ÷ 30/);
  assert.match(tabs, /Number\(salary\.baseSalary\)\/30/);
  assert.match(tabs, /readOnly/);
  assert.match(route, /Math\.round\(salary\/30\)/);
  assert.match(route, /Math\.round\(baseSalaryCents \/ 30\)/);
});

test("applies the statutory vacation entitlement bands", async () => {
  const tabs = await readFile(
    new URL("../app/worker-hr-tabs.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/hr/route.ts", import.meta.url),
    "utf8",
  );
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
  const currency = await readFile(
    new URL("../app/currency-input.tsx", import.meta.url),
    "utf8",
  );
  assert.match(currency, /decimalPlaces = 2/);
  assert.match(currency, /minimumFractionDigits: decimalPlaces/);
  assert.match(currency, /maximumFractionDigits: decimalPlaces/);
  assert.match(currency, /currency-tight/);
  assert.match(currency, /const controlled = value !== undefined/);
  assert.match(currency, /controlled \? String\(value \|\| ""\) : internal/);
  for (const file of [
    "worker-hr-tabs.tsx",
    "launches-module.tsx",
    "unions-module.tsx",
    "registrations-module.tsx",
    "inventory-module.tsx",
  ]) {
    const source = await readFile(
      new URL(`../app/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /CurrencyInput/);
  }
});

test("links registered crops to agricultural movements", async () => {
  const inventory = await readFile(
    new URL("../app/inventory-module.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/inventory/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(inventory, /section === "crops"/);
  assert.match(inventory, /<select name="crop">/);
  assert.match(route, /CULTURA::/);
  assert.match(route, /crop: b\.crop \|\| null/);
});

test("saves salary through the main worker action", async () => {
  const data = await readFile(
    new URL("../app/data-module.tsx", import.meta.url),
    "utf8",
  );
  const tabs = await readFile(
    new URL("../app/worker-hr-tabs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(data, /salaryRef\.current\?\.saveSalary\(\)/);
  assert.match(tabs, /useImperativeHandle\(ref/);
  assert.match(tabs, /saveSalary/);
});

test("allows father and mother dependents without CPF", async () => {
  const data = await readFile(
    new URL("../app/data-module.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/data/route.ts", import.meta.url),
    "utf8",
  );
  const cloud = await readFile(
    new URL("../app/api/data/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(data, /CPF \(opcional para pai ou mãe\)/);
  for (const source of [route, cloud]) {
    assert.match(source, /\["father", "mother"\]\.includes/);
    assert.match(source, /LEGACY-DEP:PARENT:/);
    assert.match(source, /!parentWithoutCpf && !isValidCpf/);
  }
});

test("uses a registered mother dependent to clear the worker mother-name issue", async () => {
  const route = await readFile(
    new URL("../app/api/data/route.ts", import.meta.url),
    "utf8",
  );
  const cloud = await readFile(
    new URL("../app/api/data/cloud.ts", import.meta.url),
    "utf8",
  );
  for (const source of [route, cloud]) {
    assert.match(source, /motherByPerson/);
    assert.match(
      source,
      /motherName: contract\.motherName \|\| motherByPerson\.get/,
    );
  }
  const badge = await readFile(
    new URL("../app/version-badge.css", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(badge, /terra-version-badge/);
  assert.doesNotMatch(badge, /content:\s*"v\d/);
  assert.match(page, /terra-version-badge">v\{SYSTEM_VERSION\}/);
});

test("keeps worker saves, termination dates and review alerts synchronized", async () => {
  const data = await readFile(
    new URL("../app/data-module.tsx", import.meta.url),
    "utf8",
  );
  const review = await readFile(
    new URL("../app/worker-review.ts", import.meta.url),
    "utf8",
  );
  assert.match(data, /const profileSaved = await request\("PUT"/);
  assert.match(data, /terminationDate: r\.terminationDate \|\| ""/);
  assert.match(data, /Data atual sugerida para o desligamento/);
  assert.match(data, /activeWorkerNeedsReview/);
  assert.match(review, /return !terminated && workerNeedsReview/);
});

test("shows registration issues only for active workers on the dashboard", async () => {
  const dashboard = await readFile(
    new URL("../app/production-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /activeWorkerNeedsReview/);
  assert.match(
    dashboard,
    /reviewRows = rows\.filter\(\(r\) => activeWorkerNeedsReview\(r\)\)/,
  );
  assert.doesNotMatch(dashboard, /workerNeedsReview\(r\)/);
});

test("shows offline download only after login in the supervision tab", async () => {
  const auth = await readFile(
    new URL("../app/auth-screen.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const installation = await readFile(
    new URL("../app/app-installation.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(auth, /AppInstallation|Baixar dados/);
  assert.match(page, /\["SP", "Supervisão"\]/);
  assert.match(page, /visible=\{active === "Supervisão"\}/);
  assert.match(
    page,
    /label !== "Supervisão" \|\| localUser\?\.role === "admin"/,
  );
  assert.match(installation, /Baixar dados e criar atalho offline/);
  assert.match(installation, /await installPrompt\.prompt\(\)/);
});

test("supports registered employment links and multiple descriptions per CBO", async () => {
  const data = await readFile(
    new URL("../app/data-module.tsx", import.meta.url),
    "utf8",
  );
  const registrations = await readFile(
    new URL("../app/registrations-module.tsx", import.meta.url),
    "utf8",
  );
  const database = await readFile(
    new URL("../db/index.ts", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/hr/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(data, /EmploymentLinkField/);
  assert.match(registrations, /saveLink/);
  assert.match(database, /job_functions_tenant_cbo_description_idx/);
  assert.match(
    route,
    /A função está vinculada a colaborador e não pode ser excluída/,
  );
});

test("edits clones and deletes existing daily and monthly entries", async () => {
  const module = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const localApi = await readFile(
    new URL("../app/api/launches/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(module, /APONTAMENTOS REALIZADOS/);
  assert.match(module, /Editar/);
  assert.match(module, /Clonar/);
  assert.match(module, /Excluir/);
  assert.match(module, /entryMode/);
  assert.match(
    module,
    /onClick=\{\(\)\s*=>\s*focusGridRow\(key,\s*c\.name\)\}/,
  );
  assert.match(module, /Editando apontamento de \$\{name\}/);
  assert.match(
    module,
    /document\.getElementById\(`service-\$\{key\}`\)\?\.focus/,
  );
  assert.match(module, /Math\.max\(\s*1,\s*modeDayEntries\.filter/);
  assert.match(module, /gridDirty\s*&&\s*\(\s*<button/);
  assert.match(localApi, /action\s*===\s*"updateEntry"/);
  assert.match(cloudApi, /body\.action\s*===\s*"updateEntry"/);
  assert.match(localApi, /clonedFromId: null/);
  assert.match(cloudApi, /cloned_from_id:\s*null/);
  assert.match(cloudApi, /apontamentos clonados foram preservados/i);
});

test("allows only administrators to delete launch entries by month or selected days", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const module = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const localApi = await readFile(
    new URL("../app/api/launches/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /isAdmin=\{localUser\.role === "admin"\}/);
  assert.match(module, /ÁREA EXCLUSIVA DO ADMINISTRADOR/);
  assert.match(module, /Excluir todos os apontamentos deste mês/);
  assert.match(module, /window\.confirm\(\s*`ATENÇÃO:/);
  assert.match(module, /action: "deletePeriod"/);
  assert.match(localApi, /requireLocalAdmin/);
  assert.match(localApi, /action === "deletePeriod"/);
  assert.match(cloudApi, /requireCloudAdmin/);
  assert.match(cloudApi, /body\.action === "deletePeriod"/);
});

test("restricts worker deletion to the authorized administrator and requires two confirmations", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const module = await readFile(
    new URL("../app/data-module.tsx", import.meta.url),
    "utf8",
  );
  const localApi = await readFile(
    new URL("../app/api/data/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/data/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(page, /jedsonpc@hotmail\.com/);
  assert.match(module, /deleteWorker/);
  assert.equal((module.match(/window\.confirm\(/g) || []).length >= 2, true);
  assert.match(localApi, /requireAuthorizedLocalAdmin/);
  assert.match(localApi, /DELETE FROM daily_entries/);
  assert.match(cloudApi, /user\.email !== "jedsonpc@hotmail\.com"/);
  assert.match(cloudApi, /"daily_entries"/);
});

test("uses three automatic daily-rate rows for monthly workers", async () => {
  const module = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const localApi = await readFile(
    new URL("../app/api/launches/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(module, /entryMode\s*===\s*"monthly"\s*\?\s*3\s*:/);
  assert.match(
    module,
    /dailyRateCents\s*\|\|\s*Math\.round\(c\.baseSalaryCents\s*\/\s*30\)/,
  );
  assert.match(module, /INSALUBR\|PERICULOS\|GRATIFICA/);
  assert.match(module, /formulaFactor/);
  assert.match(module, /disabled=\{entryMode\s*===\s*"monthly"\}/);
  assert.match(localApi, /baseSalaryCents/);
  assert.match(localApi, /dailyRateCents/);
  assert.match(localApi, /salary_history/);
  assert.match(cloudApi, /salary_history/);
  assert.match(cloudApi, /latestSalary/);
});

test("uses package version in the system version card", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /import packageInfo from "\.\.\/package\.json"/);
  assert.match(page, /SYSTEM_VERSION = packageInfo\.version/);
  assert.doesNotMatch(page, /SYSTEM_VERSION = "1\.4\.17"/);
});

test("protects worker cloning when a labor claim is registered", async () => {
  const module = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(module, /ATENÇÃO: Há registro de reclamação trabalhista/);
  assert.match(module, /SEGUNDA ADVERTÊNCIA/);
  assert.match(module, /Informações adicionais/);
  assert.match(schema, /laborClaimDate/);
  assert.match(schema, /laborClaimResult/);
});

test("registers EPI and tool issues for multiple workers and items", async () => {
  const module = await readFile(new URL("../app/registrations-module.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/hr/route.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/hr.css", import.meta.url), "utf8");
  assert.match(module, /Fornecimento em lote/);
  assert.match(module, /Filtrar por matrícula ou nome/);
  assert.match(module, /Imprimir/);
  assert.match(api, /action === "issueItems"/);
  assert.match(styles, /\.registrations-module>\.bulk-issue-card,\.registrations-module>\.issue-history\{grid-column:2;min-width:0\}/);
  assert.match(styles, /\.issue-main-fields\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(styles, /\.bulk-pickers\{display:grid;grid-template-columns:minmax\(0,1\.2fr\) minmax\(0,\.8fr\)/);
  assert.match(styles, /\.bulk-check-list b\{font-size:\.9rem;line-height:1\.28/);
});

test("supports a custom launch period in the summarized payroll", async () => {
  const reports = await readFile(new URL("../app/reports-module.tsx", import.meta.url), "utf8");
  assert.match(reports, /Apontamentos do período/);
  assert.match(reports, /Período personalizado/);
  assert.match(reports, /customRange/);
});

test("deletes a launch period in small Supabase batches", async () => {
  const cloud = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(cloud, /const batchSize = 5/);
  assert.match(cloud, /offset < rows\.length; offset \+= batchSize/);
  assert.match(cloud, /rows\.slice\(offset, offset \+ batchSize\)/);
  assert.match(cloud, /cloned_from_id=in\.\(\$\{idFilter\}\)/);
  assert.match(cloud, /affected: rows\.length/);
});

test("clones day entries by merging with the selected destination", async () => {
  const localApi = await readFile(
    new URL("../app/api/launches/route.ts", import.meta.url),
    "utf8",
  );
  const cloudApi = await readFile(
    new URL("../app/api/launches/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(localApi, /onConflictDoUpdate/);
  assert.match(localApi, /clonados ou atualizados no dia de destino/);
  assert.match(cloudApi, /resolution=merge-duplicates/);
  assert.match(cloudApi, /O dia de origem não possui lançamentos salvos/);
  const module = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(module, /Clonar apontamentos deste dia/);
  assert.match(module, /Dia de destino/);
  assert.doesNotMatch(module, /setShowClone/);
});

test("calculates editable DSR entries on Sundays and holidays", async () => {
  const module = await readFile(
    new URL("../app/launches-module.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../app/launches.css", import.meta.url),
    "utf8",
  );
  assert.match(module, /Calcular e lançar DSR no dia selecionado/);
  assert.match(module, /Gerar feriado\(s\) e depois DSR/);
  assert.match(module, /weekHolidays/);
  assert.match(module, /holidayServiceId/);
  assert.match(module, /Buscar por código, serviço ou fórmula/);
  assert.match(module, /Todos os serviços cadastrados/);
  assert.match(module, /selectableHolidayServices/);
  assert.match(
    module,
    /setHoliday\(\{\s*date,\s*name:\s*holiday\.name,?\s*\}\)/,
  );
  assert.match(module, /item\?\.affectsDsr/);
  assert.match(module, /<CurrencyInput/);
  assert.match(
    styles,
    /\.batch-table\{width:100%;min-width:0;table-layout:fixed\}/,
  );
  assert.match(styles, /overflow-x:visible/);
  assert.match(module, /recalculateAppliedDsr/);
  assert.match(module, /DSR recalculado automaticamente/);
  assert.match(module, /automaticDsr:\s*true/);
  assert.match(module, /Consultar lançamentos dia por dia/);
  assert.match(module, /Matrícula \{row\.registration\}/);
  assert.match(module, /row\.weeklyEntries\.length/);
  assert.match(module, /row\.nonComposingEntries\.length/);
  assert.match(module, /evento não configurado para composição/);
  assert.match(module, /Não compõe/);
  assert.match(module, /row\.displayDates\.map/);
  assert.match(module, /Feriado \(não exigido\)/);
  assert.match(module, /dia\(s\) com apontamento/);
  assert.match(module, /Remover feriado de/);
  assert.match(module, /Os apontamentos do dia serão preservados/);
  assert.match(module, /Selecionado/);
  assert.match(module, /Feriado cadastrado/);
  assert.match(module, /DSR = base ÷ 6/);
  assert.match(styles, /\.dsr-day-details/);
  assert.match(styles, /\.dsr-composition-alert/);
});

test("does not leave monthly tax preview frozen", async () => {
  const module = await readFile(
    new URL("../app/closing-module.tsx", import.meta.url),
    "utf8",
  );
  const supabase = await readFile(
    new URL("../db/supabase.ts", import.meta.url),
    "utf8",
  );
  const cloud = await readFile(
    new URL("../app/api/closing/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(module, /controller\.abort\(\), 45000/);
  assert.match(module, /Calculando prévia…/);
  assert.match(module, /window\.clearTimeout\(timeout\)/);
  assert.match(module, /cache: "no-store"/);
  assert.match(supabase, /AbortSignal\.timeout\(20000\)/);
  assert.match(supabase, /consulta ao banco demorou além do limite/i);
  assert.match(cloud, /entriesByContract/);
  assert.match(cloud, /monthlyByContract/);
  assert.match(cloud, /dependentsByPerson/);
  assert.match(cloud, /ratesByUnion/);
});

test("hides zero union contributions from every payroll report", async () => {
  const reports = await readFile(
    new URL("../app/reports-module.tsx", import.meta.url),
    "utf8",
  );
  const localClosing = await readFile(
    new URL("../app/api/closing/route.ts", import.meta.url),
    "utf8",
  );
  const cloudClosing = await readFile(
    new URL("../app/api/closing/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(reports, /visibleReportEntries/);
  assert.match(reports, /CONTRIBUI\.\*SINDICAL\|SINDICATO/);
  assert.match(reports, /entry\.amountCents !== 0/);
  assert.match(reports, /const reportEntries = visibleReportEntries/);
  assert.match(localClosing, /amount<=0/);
  assert.match(cloudClosing, /amount>0/);
});

test("orders receipt and detailed payroll events by nature and service code", async () => {
  const reports = await readFile(
    new URL("../app/reports-module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(reports, /const orderedEvents = \[\.\.\.grouped\]\.sort/);
  assert.match(reports, /const groupA = a\.gross > 0 \? 0 : 1/);
  assert.match(reports, /if \(groupA !== groupB\) return groupA - groupB/);
  assert.match(reports, /return codeA - codeB/);
  assert.match(reports, /<th>Cód\. \/ Evento<\/th>/);
  assert.match(reports, /service\.sourceId \?\? "—"/);
  assert.match(reports, /<EventTable entries=\{t\.es\} services=\{p\.services\} \/>/);
});

test("uses legacy service 600 for payroll INSS", async () => {
  const localClosing = await readFile(
    new URL("../app/api/closing/route.ts", import.meta.url),
    "utf8",
  );
  const cloudClosing = await readFile(
    new URL("../app/api/closing/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(localClosing, /sourceId===600/);
  assert.match(localClosing, /item\.kind==="inss"&&!special\?600/);
  assert.match(cloudClosing, /Number\(s\.legacy_id\)===600/);
  assert.match(cloudClosing, /item\.kind==="inss"&&!special\?600/);
  assert.match(localClosing, /const periodLabel=/);
  assert.match(localClosing, /delete\(dailyEntries\)/);
  assert.match(
    cloudClosing,
    /daily_entries\?.*notes=eq\.\$\{encodeURIComponent\(note\)\}/,
  );
});

test("compensates taxes already withheld in the first half of the month", async () => {
  const localClosing = await readFile(
    new URL("../app/api/closing/route.ts", import.meta.url),
    "utf8",
  );
  const cloudClosing = await readFile(
    new URL("../app/api/closing/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    localClosing,
    /priorInss = period === "balance" \? monthlyEntries\.filter\(e=>e\.contractId===c\.id.*isInssService/,
  );
  assert.match(
    localClosing,
    /priorIrrf = period === "balance" \? monthlyEntries\.filter\(e=>e\.contractId===c\.id/,
  );
  assert.match(
    cloudClosing,
    /priorInss = period === "balance" \? contractMonthlyEntries\.filter\(entry=>.*isInssService/,
  );
  assert.match(
    cloudClosing,
    /priorIrrf = period === "balance" \? contractMonthlyEntries\.filter/,
  );
  for (const source of [localClosing, cloudClosing]) {
    assert.match(source, /const isInssService/);
    assert.match(source, /I\\\.\?\\s\*N\\\.\?\\s\*S\\\.\?\\s\*S\\\.\?/);
  }
  const isInssService = (description) =>
    /(?:^|\b)I\.?\s*N\.?\s*S\.?\s*S\.?(?:\b|$)/i.test(description);
  assert.equal(isInssService("INSS"), true);
  assert.equal(isInssService("I.N.S.S."), true);
  assert.equal(isInssService("Desconto I. N. S. S."), true);
});

test("allows service codes to be edited and advances vacation periods", async () => {
  const servicesModule = await readFile(
    new URL("../app/services-module.tsx", import.meta.url),
    "utf8",
  );
  const servicesRoute = await readFile(
    new URL("../app/api/services/route.ts", import.meta.url),
    "utf8",
  );
  const workerTabs = await readFile(
    new URL("../app/worker-hr-tabs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(servicesModule, /value=\{form\.sourceId/);
  assert.doesNotMatch(
    servicesModule,
    /edit\?\.sourceId \|\| "Automático"\} readOnly/,
  );
  assert.match(servicesRoute, /legacy_id:105/);
  assert.match(servicesRoute, /já está sendo usado por outro serviço/);
  assert.match(workerTabs, /setVac\(emptyVacation\);await load\(\)/);
  assert.match(
    workerTabs,
    /latest\?\.accrual_end\?addDays\(latest\.accrual_end,1\)/,
  );
});

test("generates vacation, thirteenth and production-average events", async () => {
  const reportsModule = await readFile(
    new URL("../app/reports-module.tsx", import.meta.url),
    "utf8",
  );
  const servicesModule = await readFile(
    new URL("../app/services-module.tsx", import.meta.url),
    "utf8",
  );
  const servicesRoute = await readFile(
    new URL("../app/api/services/route.ts", import.meta.url),
    "utf8",
  );
  const closingModule = await readFile(
    new URL("../app/closing-module.tsx", import.meta.url),
    "utf8",
  );
  const localClosing = await readFile(
    new URL("../app/api/closing/route.ts", import.meta.url),
    "utf8",
  );
  const cloudClosing = await readFile(
    new URL("../app/api/closing/cloud.ts", import.meta.url),
    "utf8",
  );
  assert.match(servicesModule, /INSS sobre férias/);
  assert.match(servicesModule, /IRPF sobre férias/);
  assert.match(servicesRoute, /\[INSS_FERIAS\]/);
  assert.match(closingModule, /Gerar Tributos Férias/);
  assert.match(closingModule, /Gerar Tributos 13º Salário/);
  for (const source of [localClosing, cloudClosing]) {
    assert.match(source, /sourceId:120|legacy_id:120/);
    assert.match(source, /productionAverageTotal/);
    assert.match(source, /productionAverageDays/);
    assert.match(
      source,
      /Math\.max\(0,productionAverageTotal\/dailyRateCents-30\)/,
    );
    assert.match(source, /INSS sobre \$\{special\}/);
    assert.match(source, /Acumulador histórico - Média de produção em diárias/);
    assert.match(source, /if\(amount>0\)/);
  }
  assert.match(reportsModule, /service\?\.sourceId === 120/);
  assert.match(reportsModule, /entryType === "special"/);
});
