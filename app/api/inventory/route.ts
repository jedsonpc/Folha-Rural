/* eslint-disable @typescript-eslint/no-explicit-any */
import { authorizeCloud } from "../../auth-cloud";
import { getSupabaseConfig, supabaseAdmin } from "../../../db/supabase";

type Row = Record<string, any>;
const cents = (v: unknown) => Math.round(Number(v || 0) * 100);
async function companyId(sourceId: number) {
  const config = getSupabaseConfig()!;
  const rows = await supabaseAdmin.get<Row[]>(`/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${sourceId}&limit=1`);
  return rows[0]?.id as string | undefined;
}
export async function GET(request: Request) {
  const access = await authorizeCloud(request, "Estoque e custos");
  if (access.response) return access.response;
  if (!getSupabaseConfig()) return Response.json({ error: "O módulo de estoque requer a configuração de nuvem." }, { status: 503 });
  const sourceId = Number(new URL(request.url).searchParams.get("company"));
  if (!sourceId || (access.user?.companyIds && !access.user.companyIds.includes(sourceId))) return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
  const config = getSupabaseConfig()!, id = await companyId(sourceId);
  if (!id) return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
  const base = `organization_id=eq.${config.organizationId}&company_id=eq.${id}`;
  const [products, partners, movements, categories] = await Promise.all([
    supabaseAdmin.get<Row[]>(`/rest/v1/inventory_products?select=*,inventory_categories(name)&${base}&order=description.asc`),
    supabaseAdmin.get<Row[]>(`/rest/v1/business_partners?select=*&${base}&order=name.asc`),
    supabaseAdmin.get<Row[]>(`/rest/v1/inventory_movements?select=*,inventory_products(description,unit),business_partners(name)&${base}&order=movement_date.desc,created_at.desc&limit=1000`),
    supabaseAdmin.get<Row[]>(`/rest/v1/inventory_categories?select=*&${base}&order=name.asc`),
  ]);
  const stock = new Map<string, number>();
  for (const m of movements) stock.set(m.product_id, (stock.get(m.product_id) || 0) + (["purchase","positive_adjustment"].includes(m.movement_type) ? 1 : -1) * Number(m.quantity));
  const productRows: Row[] = products.map(p => ({ ...p, stock: stock.get(p.id) || 0 }));
  const inventoryValue = productRows.reduce((s,p) => s + Number(p.stock) * Number(p.average_cost_cents), 0);
  const revenue = movements.filter(m => m.movement_type === "sale").reduce((s,m) => s + Number(m.quantity) * Number(m.unit_value_cents), 0);
  const purchases = movements.filter(m => m.movement_type === "purchase").reduce((s,m) => s + Number(m.quantity) * Number(m.unit_value_cents), 0);
  return Response.json({ products: productRows, partners, movements, categories, metrics: { inventoryValue, revenue, purchases, lowStock: productRows.filter(p => Number(p.stock) <= Number(p.minimum_stock)).length } }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const access = await authorizeCloud(request, "Estoque e custos");
  if (access.response) return access.response;
  const config = getSupabaseConfig();
  if (!config) return Response.json({ error: "O módulo de estoque requer a configuração de nuvem." }, { status: 503 });
  const b = await request.json() as Row, sourceId = Number(b.company), id = await companyId(sourceId);
  if (!id || (access.user?.companyIds && !access.user.companyIds.includes(sourceId))) return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
  const common = { organization_id: config.organizationId, company_id: id };
  if (b.action === "partner") await supabaseAdmin.post("/rest/v1/business_partners", { ...common, partner_type: b.partnerType, name: String(b.name || "").trim(), trade_name: b.tradeName || null, document: b.document || null, phone: b.phone || null, email: b.email || null }, { prefer: "return=minimal" });
  else if (b.action === "product") await supabaseAdmin.post("/rest/v1/inventory_products", { ...common, description: String(b.description || "").trim(), sku: b.sku || null, unit: b.unit || "UN", minimum_stock: Number(b.minimumStock || 0), sale_price_cents: cents(b.salePrice) }, { prefer: "return=minimal" });
  else if (b.action === "movement") await supabaseAdmin.post("/rest/v1/inventory_movements", { ...common, product_id: b.productId, partner_id: b.partnerId || null, movement_type: b.movementType, movement_date: b.date, quantity: Number(b.quantity), unit_value_cents: cents(b.unitValue), document_number: b.documentNumber || null, crop: b.crop || null, cost_center: b.costCenter || null, notes: b.notes || null }, { prefer: "return=minimal" });
  else return Response.json({ error: "Operação inválida." }, { status: 400 });
  return Response.json({ ok: true, message: "Registro salvo com sucesso." });
}
