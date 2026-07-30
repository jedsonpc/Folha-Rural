import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    sourceId: integer("source_id").notNull(),
    name: text("name").notNull(),
    document: text("document"),
    documentType: text("document_type").notNull().default("cnpj"),
    ownerCpf: text("owner_cpf"),
    cei: text("cei"),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    registrationStatus: text("registration_status"),
    email: text("email"),
    phone: text("phone"),
    postalCode: text("postal_code"),
    address: text("address"),
    addressNumber: text("address_number"),
    addressComplement: text("address_complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    checkedAt: text("checked_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("companies_tenant_source_idx").on(
      table.tenantId,
      table.sourceId,
    ),
  ],
);

export const workers = sqliteTable(
  "workers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    sourceId: integer("source_id").notNull(),
    companySourceId: integer("company_source_id").notNull(),
    name: text("name").notNull(),
    cpf: text("cpf"),
    admissionDate: text("admission_date"),
    role: text("role"),
    paymentType: text("payment_type").notNull().default("production"),
    unionMember: integer("union_member", { mode: "boolean" })
      .notNull()
      .default(false),
    unionDiscountCents: integer("union_discount_cents").notNull().default(0),
    unionId: integer("union_id"),
    familyDependents: integer("family_dependents").notNull().default(0),
    irrfDependents: integer("irrf_dependents").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("workers_tenant_source_idx").on(table.tenantId, table.sourceId),
  ],
);

export const people = sqliteTable(
  "people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    personKey: text("person_key").notNull(),
    name: text("name").notNull(),
    cpf: text("cpf"),
    pis: text("pis"),
    birthDate: text("birth_date"),
    identityNumber: text("identity_number"),
    identityIssuer: text("identity_issuer"),
    identityState: text("identity_state"),
    identityIssueDate: text("identity_issue_date"),
    ctpsNumber: text("ctps_number"),
    ctpsSeries: text("ctps_series"),
    ctpsState: text("ctps_state"),
    ctpsIssueDate: text("ctps_issue_date"),
    voterTitleNumber: text("voter_title_number"),
    voterZone: text("voter_zone"),
    voterSection: text("voter_section"),
    cnhNumber: text("cnh_number"),
    cnhCategory: text("cnh_category"),
    cnhExpirationDate: text("cnh_expiration_date"),
    cnhFirstIssueDate: text("cnh_first_issue_date"),
    militaryCertificate: text("military_certificate"),
    phone: text("phone"),
    motherName: text("mother_name"),
    birthState: text("birth_state"),
    birthCity: text("birth_city"),
    photoDataUrl: text("photo_data_url"),
    email: text("email"),
    sex: text("sex"),
    education: text("education"),
    maritalStatus: text("marital_status"),
    raceColor: text("race_color"),
    address: text("address"),
    addressNumber: text("address_number"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    needsReview: integer("needs_review", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("people_tenant_key_idx").on(table.tenantId, table.personKey),
  ],
);

export const employmentContracts = sqliteTable(
  "employment_contracts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    companySourceId: integer("company_source_id").notNull(),
    sourceRegistration: integer("source_registration").notNull(),
    registrationNumber: integer("registration_number"),
    legacyCode: text("legacy_code"),
    admissionDate: text("admission_date"),
    terminationDate: text("termination_date"),
    role: text("role"),
    cboCode: text("cbo_code"),
    weeklyHours: integer("weekly_hours").notNull().default(44),
    employmentLinkCode: text("employment_link_code"),
    employmentLinkDescription: text("employment_link_description"),
    contractTerm: text("contract_term").notNull().default("indefinite"),
    paymentType: text("payment_type").notNull().default("production"),
    unionMember: integer("union_member", { mode: "boolean" })
      .notNull()
      .default(false),
    unionDiscountCents: integer("union_discount_cents").notNull().default(0),
    unionId: integer("union_id"),
    unionDiscountFrequency: text("union_discount_frequency")
      .notNull()
      .default("monthly"),
    familyDependents: integer("family_dependents").notNull().default(0),
    irrfDependents: integer("irrf_dependents").notNull().default(0),
    employmentCondition: text("employment_condition")
      .notNull()
      .default("first_job"),
    contractType: text("contract_type").notNull().default("harvest"),
    seasonSourceId: integer("season_source_id"),
    status: text("status").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("contracts_tenant_source_idx").on(
      table.tenantId,
      table.companySourceId,
      table.sourceRegistration,
    ),
    uniqueIndex("contracts_tenant_registration_idx").on(
      table.tenantId,
      table.companySourceId,
      table.registrationNumber,
    ),
  ],
);

export const legacyContractMap = sqliteTable(
  "legacy_contract_map",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    companySourceId: integer("company_source_id").notNull(),
    sourceRegistration: integer("source_registration").notNull(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => employmentContracts.id),
    targetCode: text("target_code").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("legacy_map_source_idx").on(
      table.tenantId,
      table.companySourceId,
      table.sourceRegistration,
    ),
  ],
);

export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    sourceId: integer("source_id").notNull(),
    groupSourceId: integer("group_source_id"),
    description: text("description").notNull(),
    unitSourceId: integer("unit_source_id"),
    fgts: integer("fgts", { mode: "boolean" }).notNull().default(false),
    inss: integer("inss", { mode: "boolean" }).notNull().default(false),
    fgts13: integer("fgts_13", { mode: "boolean" }).notNull().default(false),
    inss13: integer("inss_13", { mode: "boolean" }).notNull().default(false),
    irrf: integer("irrf", { mode: "boolean" }).notNull().default(false),
    rais: integer("rais", { mode: "boolean" }).notNull().default(false),
    formulaCode: text("formula_code"),
    entryType: text("entry_type").notNull().default("earning"),
    groupName: text("group_name"),
    unitName: text("unit_name"),
    affectsDsr: integer("affects_dsr", { mode: "boolean" })
      .notNull()
      .default(false),
    composesProductionAverage: integer("composes_production_average", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("services_tenant_source_idx").on(
      table.tenantId,
      table.sourceId,
    ),
  ],
);

export const taxBrackets = sqliteTable(
  "tax_brackets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    taxType: text("tax_type").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    lowerCents: integer("lower_cents").notNull(),
    upperCents: integer("upper_cents"),
    rateBasisPoints: integer("rate_basis_points").notNull(),
    deductionCents: integer("deduction_cents").notNull().default(0),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    officialUpdatedAt: text("official_updated_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("tax_brackets_unique_idx").on(
      table.tenantId,
      table.taxType,
      table.effectiveFrom,
      table.lowerCents,
    ),
  ],
);

export const importRuns = sqliteTable("import_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  fileName: text("file_name").notNull(),
  companiesCount: integer("companies_count").notNull().default(0),
  workersCount: integer("workers_count").notNull().default(0),
  servicesCount: integer("services_count").notNull().default(0),
  status: text("status").notNull().default("completed"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const dailyEntries = sqliteTable(
  "daily_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    companySourceId: integer("company_source_id").notNull(),
    entryDate: text("entry_date").notNull(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => employmentContracts.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    quantity: text("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    notes: text("notes"),
    clonedFromId: integer("cloned_from_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    discountCents: integer("discount_cents").notNull().default(0),
    sourceSequence: integer("source_sequence"),
  },
  (table) => [
    uniqueIndex("entries_unique_day_item_idx").on(
      table.tenantId,
      table.companySourceId,
      table.entryDate,
      table.contractId,
      table.serviceId,
    ),
  ],
);

export const holidays = sqliteTable(
  "holidays",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    companySourceId: integer("company_source_id").notNull(),
    holidayDate: text("holiday_date").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("holidays_tenant_company_date_idx").on(
      table.tenantId,
      table.companySourceId,
      table.holidayDate,
    ),
  ],
);

export const payrollClosings = sqliteTable(
  "payroll_closings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    companySourceId: integer("company_source_id").notNull(),
    competence: text("competence").notNull(),
    periodType: text("period_type").notNull(),
    status: text("status").notNull().default("closed"),
    totalsJson: text("totals_json").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("closing_unique_idx").on(
      table.tenantId,
      table.companySourceId,
      table.competence,
      table.periodType,
    ),
  ],
);

export const dependents = sqliteTable(
  "dependents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id),
    dependentType: text("dependent_type").notNull(),
    name: text("name").notNull(),
    cpf: text("cpf").notNull(),
    birthDate: text("birth_date").notNull(),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    birthCertificate: text("birth_certificate"),
    vaccinationProof: integer("vaccination_proof", { mode: "boolean" })
      .notNull()
      .default(false),
    schoolProof: integer("school_proof", { mode: "boolean" })
      .notNull()
      .default(false),
    salaryFamilyEligible: integer("salary_family_eligible", { mode: "boolean" })
      .notNull()
      .default(false),
    irrfDependent: integer("irrf_dependent", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("dependents_tenant_cpf_idx").on(table.tenantId, table.cpf),
  ],
);

export const unions = sqliteTable(
  "unions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    code: text("code").notNull(),
    cnpj: text("cnpj"),
    description: text("description").notNull(),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    registrationStatus: text("registration_status"),
    email: text("email"),
    phone: text("phone"),
    postalCode: text("postal_code"),
    address: text("address"),
    addressNumber: text("address_number"),
    addressComplement: text("address_complement"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    cnpjCheckedAt: text("cnpj_checked_at"),
    contributionCents: integer("contribution_cents").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("unions_tenant_code_idx").on(table.tenantId, table.code),
    uniqueIndex("unions_tenant_cnpj_idx").on(table.tenantId, table.cnpj),
  ],
);

export const unionContributionRates = sqliteTable(
  "union_contribution_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    unionId: integer("union_id")
      .notNull()
      .references(() => unions.id),
    effectiveFrom: text("effective_from").notNull(),
    contributionCents: integer("contribution_cents").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("union_rates_tenant_union_date_idx").on(
      table.tenantId,
      table.unionId,
      table.effectiveFrom,
    ),
  ],
);

export const localUsers = sqliteTable(
  "local_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: text("role").notNull(),
    permissionsJson: text("permissions_json").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("local_users_username_idx").on(table.username)],
);

export const localSessions = sqliteTable(
  "local_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => localUsers.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("local_sessions_token_idx").on(table.tokenHash)],
);
