import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [exportPath, projectUrl, serviceKey, organizationId] =
  process.argv.slice(2);
if (![exportPath, projectUrl, serviceKey, organizationId].every(Boolean)) {
  console.error(
    "Uso: node scripts/import-supabase-homologation.mjs export.json URL SERVICE_KEY ORGANIZATION_ID",
  );
  process.exit(2);
}

const payload = JSON.parse(readFileSync(exportPath, "utf8"));
if (payload.format !== "folha-rural-d1-export-v1")
  throw new Error("Formato de exportação inválido.");

const baseUrl = projectUrl.replace(/\/$/, "");
const tables = payload.tables;
const uuid = (scope, legacyId) => {
  const hash = createHash("sha1")
    .update(`folha-rural:${scope}:${legacyId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const date = (value) => (value ? String(value).slice(0, 10) : null);
const timestamp = (value) => (value ? new Date(value).toISOString() : null);
const boolean = (value) => Boolean(Number(value));
const json = (value, fallback = {}) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value || fallback;
  } catch {
    return fallback;
  }
};

async function upsert(table, rows, batchSize = 500) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const response = await fetch(
      `${baseUrl}/rest/v1/${table}?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
    );
    if (!response.ok) {
      throw new Error(
        `${table} (${start}-${start + batch.length}): ${await response.text()}`,
      );
    }
    process.stdout.write(
      `\r${table}: ${Math.min(start + batch.length, rows.length)}/${rows.length}`,
    );
  }
  process.stdout.write("\n");
}

const companyId = (sourceId) => uuid("company", sourceId);
const personId = (id) => uuid("person", id);
const contractId = (id) => uuid("contract", id);
const serviceId = (id) => uuid("service", id);
const unionId = (id) => uuid("union", id);
const functionId = (id) => uuid("function", id);

await upsert(
  "organizations",
  [{ id: organizationId, name: "Folha Rural Homologação" }],
  1,
);
await upsert(
  "companies",
  (tables.companies || []).map((row) => ({
    id: companyId(row.source_id),
    organization_id: organizationId,
    legacy_id: row.source_id,
    name: row.name,
    document: row.document,
    city: row.city,
    state: row.state,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "people",
  (tables.people || []).map((row) => ({
    id: personId(row.id),
    organization_id: organizationId,
    person_key: row.person_key,
    full_name: row.name,
    cpf: row.cpf,
    pis: row.pis,
    birth_date: date(row.birth_date),
    needs_review: boolean(row.needs_review),
    identity_number: row.identity_number,
    identity_issuer: row.identity_issuer,
    identity_state: row.identity_state,
    identity_issue_date: date(row.identity_issue_date),
    ctps_number: row.ctps_number,
    ctps_series: row.ctps_series,
    ctps_state: row.ctps_state,
    ctps_issue_date: date(row.ctps_issue_date),
    voter_title_number: row.voter_title_number,
    voter_zone: row.voter_zone,
    voter_section: row.voter_section,
    cnh_number: row.cnh_number,
    cnh_category: row.cnh_category,
    cnh_expiration_date: date(row.cnh_expiration_date),
    cnh_first_issue_date: date(row.cnh_first_issue_date),
    military_certificate: row.military_certificate,
    phone: row.phone,
    mother_name: row.mother_name,
    birth_state: row.birth_state,
    birth_city: row.birth_city,
    photo_data_url: row.photo_data_url,
    email: row.email,
    sex: row.sex,
    education: row.education,
    marital_status: row.marital_status,
    race_color: row.race_color,
    address: row.address,
    address_number: row.address_number,
    district: row.district,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "unions",
  (tables.unions || []).map((row) => ({
    id: unionId(row.id),
    organization_id: organizationId,
    code: row.code,
    cnpj: row.cnpj,
    description: row.description,
    legal_name: row.legal_name,
    trade_name: row.trade_name,
    registration_status: row.registration_status,
    email: row.email,
    phone: row.phone,
    postal_code: row.postal_code,
    address: row.address,
    address_number: row.address_number,
    address_complement: row.address_complement,
    district: row.district,
    city: row.city,
    state: row.state,
    cnpj_checked_at: timestamp(row.cnpj_checked_at),
    contribution_cents: row.contribution_cents || 0,
    active: boolean(row.active),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "employment_contracts",
  (tables.employment_contracts || []).map((row) => ({
    id: contractId(row.id),
    organization_id: organizationId,
    company_id: companyId(row.company_source_id),
    person_id: personId(row.person_id),
    registration_number: row.registration_number,
    legacy_registration: row.source_registration,
    legacy_code: row.legacy_code,
    admission_date: date(row.admission_date),
    termination_date: date(row.termination_date),
    role_name: row.role,
    season_legacy_id: row.season_source_id,
    status: row.status === "active" ? "active" : "terminated",
    cbo_code: row.cbo_code,
    weekly_hours: row.weekly_hours || 44,
    employment_link_code: row.employment_link_code,
    employment_link_description: row.employment_link_description,
    contract_term: row.contract_term || "indefinite",
    payment_type: row.payment_type || "production",
    union_member: boolean(row.union_member),
    union_discount_cents: row.union_discount_cents || 0,
    union_id: row.union_id ? unionId(row.union_id) : null,
    union_discount_frequency: row.union_discount_frequency || "monthly",
    family_dependents: row.family_dependents || 0,
    irrf_dependents: row.irrf_dependents || 0,
    employment_condition: row.employment_condition || "first_job",
    contract_type: row.contract_type || "harvest",
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "services",
  (tables.services || []).map((row) => ({
    id: serviceId(row.id),
    organization_id: organizationId,
    legacy_id: row.source_id,
    description: row.description,
    fgts_incidence: boolean(row.fgts),
    inss_incidence: boolean(row.inss),
    group_legacy_id: row.group_source_id,
    unit_legacy_id: row.unit_source_id,
  })),
);
await upsert(
  "legacy_contract_map",
  (tables.legacy_contract_map || []).map((row) => ({
    id: uuid("legacy_contract_map", row.id),
    organization_id: organizationId,
    company_id: companyId(row.company_source_id),
    legacy_registration: row.source_registration,
    contract_id: contractId(row.contract_id),
    target_code: row.target_code,
  })),
);
await upsert(
  "job_functions",
  (tables.job_functions || []).map((row) => ({
    id: functionId(row.id),
    organization_id: organizationId,
    cbo_code: row.cbo_code,
    official_description: row.official_description,
    local_description: row.local_description,
    active: boolean(row.active),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "cost_centers",
  (tables.cost_centers || []).map((row) => ({
    id: uuid("cost_center", row.id),
    organization_id: organizationId,
    description: row.description,
    active: boolean(row.active),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "dependents",
  (tables.dependents || []).map((row) => ({
    id: uuid("dependent", row.id),
    organization_id: organizationId,
    person_id: personId(row.person_id),
    dependent_type: row.dependent_type,
    name: row.name,
    cpf: row.cpf,
    birth_date: date(row.birth_date),
    disabled: boolean(row.disabled),
    birth_certificate: row.birth_certificate,
    vaccination_proof: boolean(row.vaccination_proof),
    school_proof: boolean(row.school_proof),
    salary_family_eligible: boolean(row.salary_family_eligible),
    irrf_dependent: boolean(row.irrf_dependent),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "union_contribution_rates",
  (tables.union_contribution_rates || []).map((row) => ({
    id: uuid("union_rate", row.id),
    organization_id: organizationId,
    union_id: unionId(row.union_id),
    effective_from: date(row.effective_from),
    contribution_cents: row.contribution_cents || 0,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "import_runs",
  (tables.import_runs || []).map((row) => ({
    id: uuid("import_run", row.id),
    organization_id: organizationId,
    file_name: row.file_name,
    companies_count: row.companies_count || 0,
    workers_count: row.workers_count || 0,
    services_count: row.services_count || 0,
    status: row.status || "completed",
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "holidays",
  (tables.holidays || []).map((row) => ({
    id: uuid("holiday", row.id),
    organization_id: organizationId,
    company_id: companyId(row.company_source_id),
    holiday_date: date(row.holiday_date),
    name: row.name,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "daily_entries",
  (tables.daily_entries || []).map((row) => ({
    id: uuid("daily_entry", row.id),
    organization_id: organizationId,
    company_id: companyId(row.company_source_id),
    entry_date: date(row.entry_date),
    contract_id: contractId(row.contract_id),
    service_id: serviceId(row.service_id),
    quantity: row.quantity,
    unit_price_cents: row.unit_price_cents,
    amount_cents: row.amount_cents,
    discount_cents: row.discount_cents || 0,
    source_sequence: row.source_sequence,
    notes: row.notes,
    cloned_from_id: row.cloned_from_id
      ? uuid("daily_entry", row.cloned_from_id)
      : null,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "worker_payroll_profiles",
  (tables.worker_payroll_profiles || []).map((row) => ({
    id: uuid("payroll_profile", row.id),
    organization_id: organizationId,
    contract_id: contractId(row.contract_id),
    salary_type: row.salary_type,
    base_salary_cents: row.base_salary_cents,
    daily_rate_cents: row.daily_rate_cents,
    advance_rate_basis_points: row.advance_rate_basis_points,
    updated_at: timestamp(row.updated_at),
  })),
);
await upsert(
  "salary_history",
  (tables.salary_history || []).map((row) => ({
    id: uuid("salary_history", row.id),
    organization_id: organizationId,
    contract_id: contractId(row.contract_id),
    effective_date: date(row.effective_date),
    salary_cents: row.salary_cents,
    reason: row.reason,
    source: row.source,
    adjustment_batch_id: row.adjustment_batch_id
      ? uuid("salary_adjustment", row.adjustment_batch_id)
      : null,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "vacation_periods",
  (tables.vacation_periods || []).map((row) => ({
    id: uuid("vacation", row.id),
    organization_id: organizationId,
    contract_id: contractId(row.contract_id),
    accrual_start: date(row.accrual_start),
    accrual_end: date(row.accrual_end),
    concession_deadline: date(row.concession_deadline),
    scheduled_start: date(row.scheduled_start),
    scheduled_end: date(row.scheduled_end),
    days: row.days,
    sold_days: row.sold_days,
    payment_date: date(row.payment_date),
    status: row.status,
    notes: row.notes,
    settled_at: timestamp(row.settled_at),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "salary_references",
  (tables.salary_references || []).map((row) => ({
    id: uuid("salary_reference", row.id),
    organization_id: organizationId,
    reference_type: row.reference_type,
    effective_date: date(row.effective_date),
    value_cents: row.value_cents,
    notes: row.notes,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "salary_adjustment_batches",
  (tables.salary_adjustment_batches || []).map((row) => ({
    id: uuid("salary_adjustment", row.id),
    organization_id: organizationId,
    effective_date: date(row.effective_date),
    mode: row.mode,
    value: row.value,
    reason: row.reason,
    function_ids: json(row.function_ids_json, []).map(functionId),
    status: row.status,
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "payroll_closings",
  (tables.payroll_closings || []).map((row) => ({
    id: uuid("payroll_closing", row.id),
    organization_id: organizationId,
    company_id: companyId(row.company_source_id),
    competence: row.competence,
    period_type: row.period_type,
    status: row.status,
    totals: json(row.totals_json),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "safety_items",
  (tables.safety_items || []).map((row) => ({
    id: uuid("safety_item", row.id),
    organization_id: organizationId,
    item_type: row.item_type,
    description: row.description,
    supplier: row.supplier,
    ca: row.ca,
    active: boolean(row.active),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "item_issues",
  (tables.item_issues || []).map((row) => ({
    id: uuid("item_issue", row.id),
    organization_id: organizationId,
    item_id: uuid("safety_item", row.item_id),
    contract_id: contractId(row.contract_id),
    issue_date: date(row.issue_date),
    quantity: row.quantity,
    return_due_date: date(row.return_due_date),
    returned_at: timestamp(row.returned_at),
    condition_notes: row.condition_notes,
    employee_acknowledged: boolean(row.employee_acknowledged),
    created_at: timestamp(row.created_at),
  })),
);
await upsert(
  "tax_brackets",
  (tables.tax_brackets || []).map((row) => ({
    id: uuid("tax_bracket", row.id),
    organization_id: organizationId,
    tax_type: row.tax_type,
    effective_from: date(row.effective_from),
    effective_to: date(row.effective_to),
    lower_cents: row.lower_cents,
    upper_cents: row.upper_cents,
    rate_basis_points: row.rate_basis_points,
    deduction_cents: row.deduction_cents || 0,
    source_name: row.source_name,
    source_url: row.source_url,
    official_updated_at: timestamp(row.official_updated_at),
    created_at: timestamp(row.created_at),
  })),
);

console.log("Importação de homologação concluída.");
