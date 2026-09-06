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
  assert.match(serviceWorker, /folha-rural-shell-v42-folha-rural-1\.4\.54/);
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
  assert.match(currency, /const controlled = value !== undefined/);
  assert.match(currency, /controlled \? String\(value \|\| ""\) : internal/);
  for (const file of ["worker-hr-tabs.tsx", "launches-module.tsx", "unions-module.tsx", "registrations-module.tsx", "inventory-module.tsx"]) {
    const source = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.match(source, /CurrencyInput/);
  }
});

test("links registered crops to agricultural movements", async () => {
  const inventory = await readFile(new URL("../app/inventory-module.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8");
  assert.match(inventory, /section === "crops"/);
  assert.match(inventory, /<select name="crop">/);
  assert.match(route, /CULTURA::/);
  assert.match(route, /crop: b\.crop \|\| null/);
});

test("saves salary through the main worker action", async () => {
  const data = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const tabs = await readFile(new URL("../app/worker-hr-tabs.tsx", import.meta.url), "utf8");
  assert.match(data, /salaryRef\.current\?\.saveSalary\(\)/);
  assert.match(tabs, /useImperativeHandle\(ref/);
  assert.match(tabs, /saveSalary/);
});

test("allows father and mother dependents without CPF", async () => {
  const data = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  const cloud = await readFile(new URL("../app/api/data/cloud.ts", import.meta.url), "utf8");
  assert.match(data, /CPF \(opcional para pai ou mãe\)/);
  for (const source of [route, cloud]) {
    assert.match(source, /\["father", "mother"\]\.includes/);
    assert.match(source, /LEGACY-DEP:PARENT:/);
    assert.match(source, /!parentWithoutCpf && !isValidCpf/);
  }
});

test("uses a registered mother dependent to clear the worker mother-name issue", async () => {
  const route = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  const cloud = await readFile(new URL("../app/api/data/cloud.ts", import.meta.url), "utf8");
  for (const source of [route, cloud]) {
    assert.match(source, /motherByPerson/);
    assert.match(source, /motherName: contract\.motherName \|\| motherByPerson\.get/);
  }
  const badge = await readFile(new URL("../app/version-badge.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(badge, /terra-version-badge/);
  assert.doesNotMatch(badge, /content:\s*"v\d/);
  assert.match(page, /terra-version-badge">v\{SYSTEM_VERSION\}/);
});

test("keeps worker saves, termination dates and review alerts synchronized", async () => {
  const data = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const review = await readFile(new URL("../app/worker-review.ts", import.meta.url), "utf8");
  assert.match(data, /const profileSaved = await request\("PUT"/);
  assert.match(data, /terminationDate: r\.terminationDate \|\| ""/);
  assert.match(data, /Data atual sugerida para o desligamento/);
  assert.match(data, /activeWorkerNeedsReview/);
  assert.match(review, /return !terminated && workerNeedsReview/);
});

test("shows registration issues only for active workers on the dashboard", async () => {
  const dashboard = await readFile(new URL("../app/production-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /activeWorkerNeedsReview/);
  assert.match(dashboard, /reviewRows = rows\.filter\(\(r\) => activeWorkerNeedsReview\(r\)\)/);
  assert.doesNotMatch(dashboard, /workerNeedsReview\(r\)/);
});

test("shows the install option only on the authentication screen", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const auth = await readFile(new URL("../app/auth-screen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /AppInstallation/);
  assert.match(auth, /import AppInstallation/);
  assert.match(auth, /<AppInstallation \/>/);
});

test("supports registered employment links and multiple descriptions per CBO", async () => {
  const data = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const registrations = await readFile(new URL("../app/registrations-module.tsx", import.meta.url), "utf8");
  const database = await readFile(new URL("../db/index.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/hr/route.ts", import.meta.url), "utf8");
  assert.match(data, /EmploymentLinkField/);
  assert.match(registrations, /saveLink/);
  assert.match(database, /job_functions_tenant_cbo_description_idx/);
  assert.match(route, /A função está vinculada a colaborador e não pode ser excluída/);
});

test("edits clones and deletes existing daily and monthly entries", async () => {
  const module = await readFile(new URL("../app/launches-module.tsx", import.meta.url), "utf8");
  const localApi = await readFile(new URL("../app/api/launches/route.ts", import.meta.url), "utf8");
  const cloudApi = await readFile(new URL("../app/api/launches/cloud.ts", import.meta.url), "utf8");
  assert.match(module, /APONTAMENTOS REALIZADOS/);
  assert.match(module, /Editar/);
  assert.match(module, /Clonar/);
  assert.match(module, /Excluir/);
  assert.match(module, /entryMode/);
  assert.match(localApi, /action==="updateEntry"/);
  assert.match(cloudApi, /body\.action==="updateEntry"/);
  assert.match(localApi, /clonedFromId: null/);
  assert.match(cloudApi, /cloned_from_id:null/);
  assert.match(cloudApi, /apontamentos clonados foram preservados/i);
});

test("allows only administrators to delete launch entries by month or selected days", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const module = await readFile(new URL("../app/launches-module.tsx", import.meta.url), "utf8");
  const localApi = await readFile(new URL("../app/api/launches/route.ts", import.meta.url), "utf8");
  const cloudApi = await readFile(new URL("../app/api/launches/cloud.ts", import.meta.url), "utf8");
  assert.match(page, /isAdmin=\{localUser\.role === "admin"\}/);
  assert.match(module, /ÁREA EXCLUSIVA DO ADMINISTRADOR/);
  assert.match(module, /Excluir todos os apontamentos deste mês/);
  assert.match(module, /window\.confirm\(`ATENÇÃO:/);
  assert.match(module, /action: "deletePeriod"/);
  assert.match(localApi, /requireLocalAdmin/);
  assert.match(localApi, /action === "deletePeriod"/);
  assert.match(cloudApi, /requireCloudAdmin/);
  assert.match(cloudApi, /body\.action === "deletePeriod"/);
});

test("restricts worker deletion to the authorized administrator and requires two confirmations", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const module = await readFile(new URL("../app/data-module.tsx", import.meta.url), "utf8");
  const localApi = await readFile(new URL("../app/api/data/route.ts", import.meta.url), "utf8");
  const cloudApi = await readFile(new URL("../app/api/data/cloud.ts", import.meta.url), "utf8");
  assert.match(page, /jedsonpc@hotmail\.com/);
  assert.match(module, /deleteWorker/);
  assert.equal((module.match(/window\.confirm\(/g) || []).length >= 2, true);
  assert.match(localApi, /requireAuthorizedLocalAdmin/);
  assert.match(localApi, /DELETE FROM daily_entries/);
  assert.match(cloudApi, /user\.email !== "jedsonpc@hotmail\.com"/);
  assert.match(cloudApi, /"daily_entries"/);
});

test("uses three automatic daily-rate rows for monthly workers", async () => {
  const module = await readFile(new URL("../app/launches-module.tsx", import.meta.url), "utf8");
  const localApi = await readFile(new URL("../app/api/launches/route.ts", import.meta.url), "utf8");
  const cloudApi = await readFile(new URL("../app/api/launches/cloud.ts", import.meta.url), "utf8");
  assert.match(module, /entryMode==="monthly"\?3:1/);
  assert.match(module, /dailyRateCents\|\|Math\.round\(c\.baseSalaryCents\/30\)/);
  assert.match(module, /INSALUBR\|PERICULOS\|GRATIFICA/);
  assert.match(module, /formulaFactor/);
  assert.match(module, /disabled=\{entryMode==="monthly"\}/);
  assert.match(localApi, /baseSalaryCents/);
  assert.match(localApi, /dailyRateCents/);
  assert.match(localApi, /salary_history/);
  assert.match(cloudApi, /salary_history/);
  assert.match(cloudApi, /latestSalary/);
});

test("uses package version in the system version card", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import packageInfo from "\.\.\/package\.json"/);
  assert.match(page, /SYSTEM_VERSION = packageInfo\.version/);
  assert.doesNotMatch(page, /SYSTEM_VERSION = "1\.4\.17"/);
});

test("clones day entries by merging with the selected destination", async () => {
  const localApi = await readFile(new URL("../app/api/launches/route.ts", import.meta.url), "utf8");
  const cloudApi = await readFile(new URL("../app/api/launches/cloud.ts", import.meta.url), "utf8");
  assert.match(localApi, /onConflictDoUpdate/);
  assert.match(localApi, /clonados ou atualizados no dia de destino/);
  assert.match(cloudApi, /resolution=merge-duplicates/);
  assert.match(cloudApi, /O dia de origem não possui lançamentos salvos/);
  const module = await readFile(new URL("../app/launches-module.tsx", import.meta.url), "utf8");
  assert.match(module, /Clonar apontamentos deste dia/);
  assert.match(module, /Dia de destino/);
  assert.doesNotMatch(module, /setShowClone/);
});

test("calculates editable DSR entries on Sundays and holidays", async () => {
  const module = await readFile(new URL("../app/launches-module.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/launches.css", import.meta.url), "utf8");
  assert.match(module, /Calcular e lançar DSR no dia selecionado/);
  assert.match(module, /Gerar feriado\(s\) e depois DSR/);
  assert.match(module, /weekHolidays/);
  assert.match(module, /holidayServiceId/);
  assert.match(module, /Buscar por código, serviço ou fórmula/);
  assert.match(module, /Todos os serviços cadastrados/);
  assert.match(module, /selectableHolidayServices/);
  assert.match(module, /setHoliday\(\{date,name:holiday\.name\}\)/);
  assert.match(module, /item\?\.affectsDsr/);
  assert.match(module, /<CurrencyInput/);
  assert.match(styles, /\.batch-table\{width:100%;min-width:0;table-layout:fixed\}/);
  assert.match(styles, /overflow-x:visible/);
  assert.match(module, /recalculateAppliedDsr/);
  assert.match(module, /DSR recalculado automaticamente/);
  assert.match(module, /automaticDsr:true/);
});

test("does not leave monthly tax preview frozen", async () => {
  const module = await readFile(new URL("../app/closing-module.tsx", import.meta.url), "utf8");
  const supabase = await readFile(new URL("../db/supabase.ts", import.meta.url), "utf8");
  const cloud = await readFile(new URL("../app/api/closing/cloud.ts", import.meta.url), "utf8");
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
  const reports = await readFile(new URL("../app/reports-module.tsx", import.meta.url), "utf8");
  const localClosing = await readFile(new URL("../app/api/closing/route.ts", import.meta.url), "utf8");
  const cloudClosing = await readFile(new URL("../app/api/closing/cloud.ts", import.meta.url), "utf8");
  assert.match(reports, /visibleReportEntries/);
  assert.match(reports, /CONTRIBUI\.\*SINDICAL\|SINDICATO/);
  assert.match(reports, /entry\.amountCents !== 0/);
  assert.match(reports, /const reportEntries = visibleReportEntries/);
  assert.match(localClosing, /amount<=0/);
  assert.match(cloudClosing, /amount>0/);
});

test("uses legacy service 600 for payroll INSS", async () => {
  const localClosing = await readFile(new URL("../app/api/closing/route.ts", import.meta.url), "utf8");
  const cloudClosing = await readFile(new URL("../app/api/closing/cloud.ts", import.meta.url), "utf8");
  assert.match(localClosing, /sourceId===600/);
  assert.match(localClosing, /item\.kind==="inss"&&!special\?600/);
  assert.match(cloudClosing, /Number\(s\.legacy_id\)===600/);
  assert.match(cloudClosing, /item\.kind==="inss"&&!special\?600/);
  assert.match(localClosing, /const periodLabel=/);
  assert.match(localClosing, /delete\(dailyEntries\)/);
  assert.match(cloudClosing, /daily_entries\?.*notes=eq\.\$\{encodeURIComponent\(note\)\}/);
});

test("allows service codes to be edited and advances vacation periods", async () => {
  const servicesModule = await readFile(new URL("../app/services-module.tsx", import.meta.url), "utf8");
  const servicesRoute = await readFile(new URL("../app/api/services/route.ts", import.meta.url), "utf8");
  const workerTabs = await readFile(new URL("../app/worker-hr-tabs.tsx", import.meta.url), "utf8");
  assert.match(servicesModule, /value=\{form\.sourceId/);
  assert.doesNotMatch(servicesModule, /edit\?\.sourceId \|\| "Automático"\} readOnly/);
  assert.match(servicesRoute, /legacy_id:105/);
  assert.match(servicesRoute, /já está sendo usado por outro serviço/);
  assert.match(workerTabs, /setVac\(emptyVacation\);await load\(\)/);
  assert.match(workerTabs, /latest\?\.accrual_end\?addDays\(latest\.accrual_end,1\)/);
});

test("generates vacation, thirteenth and production-average events", async () => {
  const servicesModule = await readFile(new URL("../app/services-module.tsx", import.meta.url), "utf8");
  const servicesRoute = await readFile(new URL("../app/api/services/route.ts", import.meta.url), "utf8");
  const closingModule = await readFile(new URL("../app/closing-module.tsx", import.meta.url), "utf8");
  const localClosing = await readFile(new URL("../app/api/closing/route.ts", import.meta.url), "utf8");
  const cloudClosing = await readFile(new URL("../app/api/closing/cloud.ts", import.meta.url), "utf8");
  assert.match(servicesModule, /INSS sobre férias/);
  assert.match(servicesModule, /IRPF sobre férias/);
  assert.match(servicesRoute, /\[INSS_FERIAS\]/);
  assert.match(closingModule, /Gerar Tributos Férias/);
  assert.match(closingModule, /Gerar Tributos 13º Salário/);
  for (const source of [localClosing, cloudClosing]) {
    assert.match(source, /sourceId:120|legacy_id:120/);
    assert.match(source, /productionAverageTotal/);
    assert.match(source, /productionAverageDays/);
    assert.match(source, /Math\.max\(0,productionAverageTotal\/dailyRateCents-30\)/);
    assert.match(source, /INSS sobre \$\{special\}/);
  }
});
