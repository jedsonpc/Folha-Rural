/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseConfig, supabaseAdmin } from "../../../db/supabase";

type ImportPayload = {
  fileName?: string;
  companies?: unknown[];
  contracts?: unknown[];
  dependents?: unknown[];
  services?: unknown[];
  inventory?: Record<string, any[]>;
};

export async function cloudImportAccessGet() {
  const config = getSupabaseConfig()!;
  const [people, contracts, active, imports] = await Promise.all([
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/people?select=id&organization_id=eq.${config.organizationId}`,
    ),
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}`,
    ),
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&status=eq.active`,
    ),
    supabaseAdmin.get<unknown[]>(
      `/rest/v1/import_runs?select=*&organization_id=eq.${config.organizationId}&order=created_at.desc&limit=5`,
    ),
  ]);
  return Response.json({
    counts: {
      people: people.length,
      contracts: contracts.length,
      activeContracts: active.length,
    },
    imports,
  });
}

export async function cloudImportAccessPost(request: Request) {
  const config = getSupabaseConfig()!;
  const payload = (await request.json()) as ImportPayload;
  const rawCompanies = (payload.companies || []).slice(0, 1000) as any[];
  const rawContracts = (payload.contracts || []).slice(0, 5000) as any[];
  const rawDependents = (payload.dependents || []).slice(0, 5000) as any[];
  const services = (payload.services || []).slice(0, 1000);
  if (!rawCompanies.length && !rawContracts.length && !services.length)
    return Response.json(
      { error: "Nenhum registro válido foi recebido." },
      { status: 400 },
    );
  const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
  const normalizedName = (value: unknown) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const existingCompanies = await supabaseAdmin.get<any[]>(`/rest/v1/companies?select=id,legacy_id,document,cei,name&organization_id=eq.${config.organizationId}`);
  const usedIds = new Set(existingCompanies.map(row => Number(row.legacy_id))), remap = new Map<number,number>();
  let nextId = Math.max(0, ...usedIds) + 1;
  const companies = rawCompanies.map(company => {
    const sourceId = Number(company.sourceId), document = digits(company.document || company.cei);
    const same = existingCompanies.find(
      row =>
        (document && [digits(row.document), digits(row.cei)].includes(document)) ||
        normalizedName(row.name) === normalizedName(company.name),
    );
    let targetId = same ? Number(same.legacy_id) : sourceId;
    if (!same && usedIds.has(targetId)) { while (usedIds.has(nextId)) nextId++; targetId = nextId++; }
    usedIds.add(targetId); remap.set(sourceId,targetId);
    return { ...company, sourceId: targetId };
  });
  const contracts = rawContracts.map(row => ({ ...row, companySourceId: remap.get(Number(row.companySourceId)) ?? Number(row.companySourceId) }));
  const dependents = rawDependents.map(row => ({ ...row, companySourceId: remap.get(Number(row.companySourceId)) ?? Number(row.companySourceId) }));
  const inventory: Record<string, any[]> | undefined = payload.inventory ? { ...payload.inventory, purchases: (payload.inventory.purchases || []).map(row => ({ ...row, companySourceId: remap.get(Number(row.companySourceId)) ?? Number(row.companySourceId) })) } : undefined;
  const existingContracts = await supabaseAdmin.get<any[]>(`/rest/v1/employment_contracts?select=legacy_registration,companies!inner(legacy_id)&organization_id=eq.${config.organizationId}`);
  const existingKeys = new Set(existingContracts.map(row => `${Number(row.companies?.legacy_id)}:${Number(row.legacy_registration)}`));
  const newContracts = contracts.filter(row => !existingKeys.has(`${Number(row.companySourceId)}:${Number(row.sourceRegistration)}`));
  const newContractKeys = new Set(newContracts.map(row => `${Number(row.companySourceId)}:${Number(row.sourceRegistration)}`));
  const newDependents = dependents.filter(row => newContractKeys.has(`${Number(row.companySourceId)}:${Number(row.sourceRegistration)}`));
  const result = await supabaseAdmin.post<Record<string, unknown>>(
    "/rest/v1/rpc/folha_import_access_registry",
    {
      p_organization_id: config.organizationId,
      p_file_name: (payload.fileName || "Banco Access").slice(0, 180),
      p_companies: companies,
      p_contracts: newContracts,
      p_dependents: newDependents,
      p_services: [],
    },
  );
  const companyRows = await supabaseAdmin.get<any[]>(`/rest/v1/companies?select=id,legacy_id&organization_id=eq.${config.organizationId}`);
  const companyMap = new Map(companyRows.map(row => [Number(row.legacy_id), row.id]));
  const inventoryStats = {
    validated: inventory ? ((inventory.categories || []).length + (inventory.suppliers || []).length + (inventory.products || []).length + (inventory.crops || []).length) * companies.length + (inventory.purchaseItems || []).length : 0,
    imported: 0,
  };
  for (const company of companies) {
      const companyId = companyMap.get(Number(company.sourceId));
      if (!companyId) continue;
      const serviceRows = (services as any[]).map(row => ({
        organization_id: config.organizationId, company_id: companyId, legacy_id: row.sourceId,
        description: row.description, group_legacy_id: row.groupSourceId || null, unit_legacy_id: row.unitSourceId || null,
        fgts_incidence: Boolean(row.fgts), fgts_13_incidence: Boolean(row.fgts13), inss_incidence: Boolean(row.inss),
        inss_13_incidence: Boolean(row.inss13), rais_incidence: Boolean(row.rais), formula_code: row.formulaCode || null,
        group_name: row.groupName || null, unit_name: row.unitName || null, affects_dsr: Boolean(row.affectsDsr), active: row.active !== false,
      }));
      if (serviceRows.length) await supabaseAdmin.post("/rest/v1/services?on_conflict=organization_id,company_id,legacy_id", serviceRows, { prefer: "resolution=ignore-duplicates,return=minimal" });
      if (!inventory) continue;
      let categories = await supabaseAdmin.get<any[]>(`/rest/v1/inventory_categories?select=id,legacy_id,name&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`);
      const categoryIds = new Set(categories.map(row => Number(row.legacy_id)));
      const categoryRows = (inventory.categories || []).filter(row => !categoryIds.has(Number(row.sourceId))).map(row => ({ organization_id: config.organizationId, company_id: companyId, legacy_id: row.sourceId, name: row.name }));
      const cropNames = new Set(categories.map(row => String(row.name).toLocaleLowerCase("pt-BR")));
      const cropRows = (inventory.crops || []).filter(row => !cropNames.has(`cultura::${String(row.name).toLocaleLowerCase("pt-BR")}`)).map(row => ({ organization_id: config.organizationId, company_id: companyId, legacy_id: -1000000 - Number(row.sourceId), name: `CULTURA::${row.name}` }));
      if (categoryRows.length || cropRows.length) await supabaseAdmin.post("/rest/v1/inventory_categories?on_conflict=organization_id,company_id,legacy_id", [...categoryRows, ...cropRows], { prefer: "resolution=ignore-duplicates,return=minimal" });
      inventoryStats.imported += categoryRows.length + cropRows.length;
      const suppliers = await supabaseAdmin.get<any[]>(`/rest/v1/business_partners?select=id,legacy_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&partner_type=eq.supplier`), supplierIds = new Set(suppliers.map(row => Number(row.legacy_id)));
      const supplierRows = (inventory.suppliers || []).filter(row => !supplierIds.has(Number(row.sourceId))).map(row => ({ organization_id: config.organizationId, company_id: companyId, legacy_id: row.sourceId, partner_type: "supplier", name: row.name, trade_name: row.tradeName, phone: row.phone, contact_name: row.contactName }));
      if (supplierRows.length) await supabaseAdmin.post("/rest/v1/business_partners?on_conflict=organization_id,company_id,partner_type,legacy_id", supplierRows, { prefer: "resolution=ignore-duplicates,return=minimal" });
      inventoryStats.imported += supplierRows.length;
      categories = await supabaseAdmin.get<any[]>(`/rest/v1/inventory_categories?select=id,legacy_id,name&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`);
      const categoryMap = new Map(categories.map(row => [Number(row.legacy_id), row.id]));
      let products = await supabaseAdmin.get<any[]>(`/rest/v1/inventory_products?select=id,legacy_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`), productIds = new Set(products.map(row => Number(row.legacy_id)));
      const productRows = (inventory.products || []).filter(row => !productIds.has(Number(row.sourceId))).map(row => ({ organization_id: config.organizationId, company_id: companyId, category_id: categoryMap.get(Number(row.categorySourceId)) || null, legacy_id: row.sourceId, sku: String(row.sourceId), description: row.description, unit: row.unit }));
      if (productRows.length) await supabaseAdmin.post("/rest/v1/inventory_products?on_conflict=organization_id,company_id,legacy_id", productRows, { prefer: "resolution=ignore-duplicates,return=minimal" });
      inventoryStats.imported += productRows.length;
      products = await supabaseAdmin.get<any[]>(`/rest/v1/inventory_products?select=id,legacy_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`);
      const productMap = new Map(products.map(row => [Number(row.legacy_id), row.id]));
      const refreshedSuppliers = await supabaseAdmin.get<any[]>(`/rest/v1/business_partners?select=id,legacy_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&partner_type=eq.supplier`), supplierMap = new Map(refreshedSuppliers.map(row => [Number(row.legacy_id), row.id]));
      const purchases = new Map((inventory.purchases || []).filter(row => Number(row.companySourceId) === Number(company.sourceId)).map(row => [Number(row.sourceId), row]));
      const movementRows = [];
      for (const item of inventory.purchaseItems || []) {
        const purchase:any = purchases.get(Number(item.purchaseSourceId)), productId = productMap.get(Number(item.productSourceId));
        if (!purchase || !productId || !item.quantity || !purchase.date) continue;
        movementRows.push({ organization_id: config.organizationId, company_id: companyId, product_id: productId, partner_id: supplierMap.get(Number(purchase.supplierSourceId)) || null, movement_type: "purchase", movement_date: purchase.date, quantity: item.quantity, unit_value_cents: Math.round(Number(item.totalValue || 0) * 100 / Number(item.quantity)), document_number: purchase.documentNumber, notes: item.notes, legacy_entry_id: item.purchaseSourceId });
      }
      const existingMovements = await supabaseAdmin.get<any[]>(`/rest/v1/inventory_movements?select=legacy_entry_id,product_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`), movementKeys = new Set(existingMovements.map(row => `${Number(row.legacy_entry_id)}:${row.product_id}`));
      const newMovements = movementRows.filter(row => !movementKeys.has(`${Number(row.legacy_entry_id)}:${row.product_id}`));
      if (newMovements.length) await supabaseAdmin.post("/rest/v1/inventory_movements?on_conflict=organization_id,company_id,legacy_entry_id,product_id", newMovements, { prefer: "resolution=ignore-duplicates,return=minimal" });
      inventoryStats.imported += newMovements.length;
  }
  return Response.json({ ...result, inventoryImported: Boolean(inventory), inventoryStats: { ...inventoryStats, notIncluded: Math.max(0, inventoryStats.validated - inventoryStats.imported) }, skippedExistingContracts: contracts.length - newContracts.length, companyCodeRemap: Object.fromEntries(remap) });
}
