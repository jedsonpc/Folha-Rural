import { readFileSync } from "node:fs";

const [exportPath, projectUrl, serviceKey] = process.argv.slice(2);
if (![exportPath, projectUrl, serviceKey].every(Boolean)) {
  console.error(
    "Uso: node scripts/verify-supabase-import.mjs export.json URL SERVICE_KEY",
  );
  process.exit(2);
}

const source = JSON.parse(readFileSync(exportPath, "utf8"));
const tableMap = {
  companies: "companies",
  people: "people",
  employment_contracts: "employment_contracts",
  legacy_contract_map: "legacy_contract_map",
  services: "services",
  tax_brackets: "tax_brackets",
  import_runs: "import_runs",
  daily_entries: "daily_entries",
  holidays: "holidays",
  dependents: "dependents",
  unions: "unions",
  union_contribution_rates: "union_contribution_rates",
  job_functions: "job_functions",
  cost_centers: "cost_centers",
  worker_payroll_profiles: "worker_payroll_profiles",
  salary_history: "salary_history",
  vacation_periods: "vacation_periods",
  salary_references: "salary_references",
  salary_adjustment_batches: "salary_adjustment_batches",
  payroll_closings: "payroll_closings",
  safety_items: "safety_items",
  item_issues: "item_issues",
};

const results = [];
for (const [sourceTable, targetTable] of Object.entries(tableMap)) {
  const response = await fetch(
    `${projectUrl.replace(/\/$/, "")}/rest/v1/${targetTable}?select=id`,
    {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        prefer: "count=exact",
        range: "0-0",
      },
    },
  );
  if (!response.ok)
    throw new Error(`${targetTable}: ${await response.text()}`);
  const contentRange = response.headers.get("content-range") || "";
  const targetCount = Number(contentRange.split("/")[1] || 0);
  const sourceCount = Number(source.counts[sourceTable] || 0);
  results.push({
    table: targetTable,
    source: sourceCount,
    target: targetCount,
    ok: sourceCount === targetCount,
  });
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.ok)) process.exit(1);
