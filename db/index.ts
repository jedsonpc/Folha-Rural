import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let runtimeDb: D1Database | undefined;
let schemaReady: Promise<void> | undefined;

export function setRuntimeDatabase(db: D1Database) {
  runtimeDb = db;
}
export function getRuntimeDatabase() {
  if (!runtimeDb) throw new Error("Banco local indisponível.");
  return runtimeDb;
}

export function ensureDatabase() {
  if (!runtimeDb) throw new Error("Banco local indisponível.");
  if (!schemaReady) {
    const statements = [
      `CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, source_id INTEGER NOT NULL, name TEXT NOT NULL, document TEXT, city TEXT, state TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS companies_tenant_source_idx ON companies (tenant_id, source_id)`,
      `CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, person_key TEXT NOT NULL, name TEXT NOT NULL, cpf TEXT, pis TEXT, birth_date TEXT, needs_review INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS people_tenant_key_idx ON people (tenant_id, person_key)`,
      `CREATE TABLE IF NOT EXISTS employment_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, person_id INTEGER NOT NULL REFERENCES people(id), company_source_id INTEGER NOT NULL, source_registration INTEGER NOT NULL, registration_number INTEGER, mat_es TEXT, legacy_code TEXT, admission_date TEXT, termination_date TEXT, role TEXT, season_source_id INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS contracts_tenant_source_idx ON employment_contracts (tenant_id, company_source_id, source_registration)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS contracts_tenant_registration_idx ON employment_contracts (tenant_id, company_source_id, registration_number)`,
      `CREATE TABLE IF NOT EXISTS legacy_contract_map (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, company_source_id INTEGER NOT NULL, source_registration INTEGER NOT NULL, contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), target_code TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS legacy_map_source_idx ON legacy_contract_map (tenant_id, company_source_id, source_registration)`,
      `CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, source_id INTEGER NOT NULL, group_source_id INTEGER, description TEXT NOT NULL, unit_source_id INTEGER, fgts INTEGER NOT NULL DEFAULT 0, inss INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS services_tenant_source_idx ON services (tenant_id, source_id)`,
      `CREATE TABLE IF NOT EXISTS tax_brackets (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, tax_type TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, lower_cents INTEGER NOT NULL, upper_cents INTEGER, rate_basis_points INTEGER NOT NULL, deduction_cents INTEGER NOT NULL DEFAULT 0, source_name TEXT NOT NULL, source_url TEXT NOT NULL, official_updated_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS tax_brackets_unique_idx ON tax_brackets (tenant_id,tax_type,effective_from,lower_cents)`,
      `CREATE TABLE IF NOT EXISTS import_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, file_name TEXT NOT NULL, companies_count INTEGER NOT NULL DEFAULT 0, workers_count INTEGER NOT NULL DEFAULT 0, services_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'completed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS daily_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, company_source_id INTEGER NOT NULL, entry_date TEXT NOT NULL, contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), service_id INTEGER NOT NULL REFERENCES services(id), quantity TEXT NOT NULL, unit_price_cents INTEGER NOT NULL, amount_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, source_sequence INTEGER, notes TEXT, cloned_from_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS entries_unique_day_item_idx ON daily_entries (tenant_id, company_source_id, entry_date, contract_id, service_id)`,
      `CREATE TABLE IF NOT EXISTS holidays (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, company_source_id INTEGER NOT NULL, holiday_date TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS holidays_tenant_company_date_idx ON holidays (tenant_id, company_source_id, holiday_date)`,
      `CREATE TABLE IF NOT EXISTS payroll_closings (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, company_source_id INTEGER NOT NULL, competence TEXT NOT NULL, period_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'closed', totals_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS closing_unique_idx ON payroll_closings (tenant_id, company_source_id, competence, period_type)`,
      `CREATE TABLE IF NOT EXISTS dependents (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, person_id INTEGER NOT NULL REFERENCES people(id), dependent_type TEXT NOT NULL, name TEXT NOT NULL, cpf TEXT NOT NULL, birth_date TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, birth_certificate TEXT, vaccination_proof INTEGER NOT NULL DEFAULT 0, school_proof INTEGER NOT NULL DEFAULT 0, salary_family_eligible INTEGER NOT NULL DEFAULT 0, irrf_dependent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS dependents_tenant_cpf_idx ON dependents (tenant_id, cpf)`,
      `CREATE TABLE IF NOT EXISTS unions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, code TEXT NOT NULL, cnpj TEXT, description TEXT NOT NULL, legal_name TEXT, trade_name TEXT, registration_status TEXT, email TEXT, phone TEXT, postal_code TEXT, address TEXT, address_number TEXT, address_complement TEXT, district TEXT, city TEXT, state TEXT, cnpj_checked_at TEXT, contribution_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS unions_tenant_code_idx ON unions (tenant_id, code)`,
      `CREATE TABLE IF NOT EXISTS union_contribution_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, union_id INTEGER NOT NULL REFERENCES unions(id), effective_from TEXT NOT NULL, contribution_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS union_rates_tenant_union_date_idx ON union_contribution_rates (tenant_id, union_id, effective_from)`,
      `CREATE TABLE IF NOT EXISTS local_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, username TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, permissions_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS local_users_username_idx ON local_users (username)`,
      `CREATE TABLE IF NOT EXISTS local_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES local_users(id), token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS local_sessions_token_idx ON local_sessions (token_hash)`,
      `CREATE TABLE IF NOT EXISTS job_functions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, cbo_code TEXT NOT NULL, official_description TEXT NOT NULL, local_description TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS job_functions_tenant_cbo_idx ON job_functions (tenant_id, cbo_code)`,
      `CREATE TABLE IF NOT EXISTS cost_centers (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS worker_payroll_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), employment_link_code TEXT, employment_link_description TEXT, contract_term TEXT NOT NULL DEFAULT 'indefinite', salary_type TEXT NOT NULL DEFAULT 'monthly', base_salary_cents INTEGER NOT NULL DEFAULT 0, daily_rate_cents INTEGER, advance_rate_basis_points INTEGER NOT NULL DEFAULT 4000, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS worker_payroll_profiles_contract_idx ON worker_payroll_profiles (tenant_id, contract_id)`,
      `CREATE TABLE IF NOT EXISTS salary_history (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), effective_date TEXT NOT NULL, salary_cents INTEGER NOT NULL, reason TEXT, source TEXT NOT NULL DEFAULT 'individual', adjustment_batch_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS vacation_periods (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), accrual_start TEXT NOT NULL, accrual_end TEXT NOT NULL, concession_deadline TEXT NOT NULL, scheduled_start TEXT, scheduled_end TEXT, days INTEGER NOT NULL DEFAULT 30, sold_days INTEGER NOT NULL DEFAULT 0, payment_date TEXT, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, settled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS salary_references (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, reference_type TEXT NOT NULL, effective_date TEXT NOT NULL, value_cents INTEGER NOT NULL, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS salary_adjustment_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, effective_date TEXT NOT NULL, mode TEXT NOT NULL, value INTEGER NOT NULL, reason TEXT, function_ids_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preview', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS safety_items (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, item_type TEXT NOT NULL, description TEXT NOT NULL, supplier TEXT, ca TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS item_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES safety_items(id), contract_id INTEGER NOT NULL REFERENCES employment_contracts(id), issue_date TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT '1', return_due_date TEXT, returned_at TEXT, condition_notes TEXT, employee_acknowledged INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ];
    schemaReady = runtimeDb
      .batch(statements.map((statement) => runtimeDb!.prepare(statement)))
      .then(async () => {
        const companyInfo = await runtimeDb!
            .prepare("PRAGMA table_info(companies)")
            .all<{ name: string }>(),
          companyExisting = new Set(companyInfo.results.map((c) => c.name)),
          companyAdds: Record<string, string> = {
            document_type: "TEXT NOT NULL DEFAULT 'cnpj'",
            owner_cpf: "TEXT",
            cei: "TEXT",
            legal_name: "TEXT",
            trade_name: "TEXT",
            registration_status: "TEXT",
            email: "TEXT",
            phone: "TEXT",
            postal_code: "TEXT",
            address: "TEXT",
            address_number: "TEXT",
            address_complement: "TEXT",
            district: "TEXT",
            checked_at: "TEXT",
            active: "INTEGER NOT NULL DEFAULT 1",
          },
          companyMissing = Object.entries(companyAdds).filter(
            ([name]) => !companyExisting.has(name),
          );
        if (companyMissing.length)
          await runtimeDb!.batch(
            companyMissing.map(([name, type]) =>
              runtimeDb!.prepare(
                `ALTER TABLE companies ADD COLUMN ${name} ${type}`,
              ),
            ),
          );
        await runtimeDb!
          .prepare(
            "CREATE UNIQUE INDEX IF NOT EXISTS companies_tenant_document_idx ON companies (tenant_id, document)",
          )
          .run();
        const result = await runtimeDb!
          .prepare("PRAGMA table_info(people)")
          .all<{ name: string }>();
        const existing = new Set(result.results.map((column) => column.name));
        const additions: Record<string, string> = {
          identity_number: "TEXT",
          identity_issuer: "TEXT",
          identity_state: "TEXT",
          identity_issue_date: "TEXT",
          ctps_number: "TEXT",
          ctps_series: "TEXT",
          ctps_state: "TEXT",
          ctps_issue_date: "TEXT",
          voter_title_number: "TEXT",
          voter_zone: "TEXT",
          voter_section: "TEXT",
          cnh_number: "TEXT",
          cnh_category: "TEXT",
          cnh_expiration_date: "TEXT",
          cnh_first_issue_date: "TEXT",
          military_certificate: "TEXT",
          phone: "TEXT",
          mother_name: "TEXT",
          birth_state: "TEXT",
          birth_city: "TEXT",
          photo_data_url: "TEXT",
          email: "TEXT",
          sex: "TEXT",
          education: "TEXT",
          marital_status: "TEXT",
          race_color: "TEXT",
          address: "TEXT",
          address_number: "TEXT",
          district: "TEXT",
          city: "TEXT",
          state: "TEXT",
          postal_code: "TEXT",
        };
        const missing = Object.entries(additions).filter(
          ([name]) => !existing.has(name),
        );
        if (missing.length)
          await runtimeDb!.batch(
            missing.map(([name, type]) =>
              runtimeDb!.prepare(
                `ALTER TABLE people ADD COLUMN ${name} ${type}`,
              ),
            ),
          );
        await runtimeDb!
          .prepare(
            `UPDATE people
             SET ctps_series = CASE
                   WHEN (ctps_series IS NULL OR trim(ctps_series) = '')
                     THEN trim(substr(ctps_number, instr(ctps_number, '/') + 1))
                   ELSE ctps_series
                 END,
                 ctps_number = trim(substr(ctps_number, 1, instr(ctps_number, '/') - 1))
             WHERE instr(ctps_number, '/') > 0`,
          )
          .run();
        const serviceInfo = await runtimeDb!
            .prepare("PRAGMA table_info(services)")
            .all<{ name: string }>(),
          serviceExisting = new Set(serviceInfo.results.map((c) => c.name));
        const serviceAdds: Record<string, string> = {
          fgts_13: "INTEGER NOT NULL DEFAULT 0",
          inss_13: "INTEGER NOT NULL DEFAULT 0",
          irrf: "INTEGER NOT NULL DEFAULT 0",
          rais: "INTEGER NOT NULL DEFAULT 0",
          formula_code: "TEXT",
          entry_type: "TEXT NOT NULL DEFAULT 'earning'",
          group_name: "TEXT",
          unit_name: "TEXT",
          affects_dsr: "INTEGER NOT NULL DEFAULT 0",
          composes_production_average: "INTEGER NOT NULL DEFAULT 0",
          active: "INTEGER NOT NULL DEFAULT 1",
        };
        const serviceMissing = Object.entries(serviceAdds).filter(
          ([n]) => !serviceExisting.has(n),
        );
        if (serviceMissing.length)
          await runtimeDb!.batch(
            serviceMissing.map(([n, t]) =>
              runtimeDb!.prepare(`ALTER TABLE services ADD COLUMN ${n} ${t}`),
            ),
          );
        await runtimeDb!
          .prepare(
            `UPDATE services
             SET entry_type = CASE
               WHEN lower(trim(entry_type)) IN ('deduction','desconto','discount','d','2') THEN 'deduction'
               WHEN lower(trim(entry_type)) IN ('special','especial','e','3') THEN 'special'
               ELSE 'earning'
             END`,
          )
          .run();
        const entryInfo = await runtimeDb!
            .prepare("PRAGMA table_info(daily_entries)")
            .all<{ name: string }>(),
          entryExisting = new Set(entryInfo.results.map((c) => c.name));
        const entryAdds: Record<string, string> = {
          discount_cents: "INTEGER NOT NULL DEFAULT 0",
          source_sequence: "INTEGER",
        };
        const entryMissing = Object.entries(entryAdds).filter(
          ([n]) => !entryExisting.has(n),
        );
        if (entryMissing.length)
          await runtimeDb!.batch(
            entryMissing.map(([n, t]) =>
              runtimeDb!.prepare(
                `ALTER TABLE daily_entries ADD COLUMN ${n} ${t}`,
              ),
            ),
          );
        const contractInfo = await runtimeDb!
            .prepare("PRAGMA table_info(employment_contracts)")
            .all<{ name: string }>(),
          contractExisting = new Set(contractInfo.results.map((c) => c.name));
        const contractAdds: Record<string, string> = {
          mat_es: "TEXT",
          payment_type: "TEXT NOT NULL DEFAULT 'production'",
          union_member: "INTEGER NOT NULL DEFAULT 0",
          union_discount_cents: "INTEGER NOT NULL DEFAULT 0",
          union_id: "INTEGER",
          union_discount_frequency: "TEXT NOT NULL DEFAULT 'monthly'",
          employment_condition: "TEXT NOT NULL DEFAULT 'first_job'",
          contract_type: "TEXT NOT NULL DEFAULT 'harvest'",
          cbo_code: "TEXT",
          weekly_hours: "INTEGER NOT NULL DEFAULT 44",
          employment_link_code: "TEXT",
          employment_link_description: "TEXT",
          contract_term: "TEXT NOT NULL DEFAULT 'indefinite'",
          family_dependents: "INTEGER NOT NULL DEFAULT 0",
          irrf_dependents: "INTEGER NOT NULL DEFAULT 0",
        };
        const contractMissing = Object.entries(contractAdds).filter(
          ([n]) => !contractExisting.has(n),
        );
        if (contractMissing.length)
          await runtimeDb!.batch(
            contractMissing.map(([n, t]) =>
              runtimeDb!.prepare(
                `ALTER TABLE employment_contracts ADD COLUMN ${n} ${t}`,
              ),
            ),
          );
        await runtimeDb!
          .prepare(
            `UPDATE employment_contracts
             SET mat_es = printf('%05d', registration_number)
             WHERE registration_number IS NOT NULL
               AND (mat_es IS NULL OR trim(mat_es) = '')`,
          )
          .run();
        await runtimeDb!
          .prepare(
            "CREATE UNIQUE INDEX IF NOT EXISTS contracts_tenant_mat_es_idx ON employment_contracts (tenant_id, company_source_id, mat_es)",
          )
          .run();
        const unionInfo = await runtimeDb!
            .prepare("PRAGMA table_info(unions)")
            .all<{ name: string }>(),
          unionExisting = new Set(unionInfo.results.map((c) => c.name)),
          unionAdds: Record<string, string> = {
            cnpj: "TEXT",
            legal_name: "TEXT",
            trade_name: "TEXT",
            registration_status: "TEXT",
            email: "TEXT",
            phone: "TEXT",
            postal_code: "TEXT",
            address: "TEXT",
            address_number: "TEXT",
            address_complement: "TEXT",
            district: "TEXT",
            city: "TEXT",
            state: "TEXT",
            cnpj_checked_at: "TEXT",
          },
          unionMissing = Object.entries(unionAdds).filter(
            ([name]) => !unionExisting.has(name),
          );
        if (unionMissing.length)
          await runtimeDb!.batch(
            unionMissing.map(([name, type]) =>
              runtimeDb!.prepare(
                `ALTER TABLE unions ADD COLUMN ${name} ${type}`,
              ),
            ),
          );
        await runtimeDb!
          .prepare(
            "CREATE UNIQUE INDEX IF NOT EXISTS unions_tenant_cnpj_idx ON unions (tenant_id, cnpj)",
          )
          .run();
      });
  }
  return schemaReady;
}

export function getDb() {
  if (!runtimeDb) {
    throw new Error(
      "O banco local de compatibilidade não está disponível. Em produção, configure as variáveis do Supabase na Vercel.",
    );
  }

  return drizzle(runtimeDb, { schema });
}
