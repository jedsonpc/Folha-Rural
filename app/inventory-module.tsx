"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import "./inventory.css";

type AnyRow = Record<string, any>;
type InventorySection = "dashboard" | "products" | "partners" | "movements" | "reports";

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((c || 0) / 100);

const movementNames: Record<string, string> = {
  purchase: "Compra / entrada",
  consumption: "Consumo na lavoura",
  sale: "Venda / receita",
  positive_adjustment: "Ajuste positivo",
  negative_adjustment: "Ajuste negativo",
};

const sectionContent: Record<InventorySection, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "GESTÃO AGRÍCOLA", title: "Painel agrícola", description: "Indicadores de estoque, compras, receitas e itens que precisam de atenção." },
  products: { eyebrow: "CADASTROS", title: "Produtos e insumos", description: "Cadastre insumos, materiais, unidades, preços e níveis mínimos de estoque." },
  partners: { eyebrow: "CADASTROS", title: "Clientes e fornecedores", description: "Centralize os dados comerciais de quem compra, vende ou fornece para a propriedade." },
  movements: { eyebrow: "OPERAÇÃO", title: "Entradas e saídas", description: "Registre compras, consumo por cultura ou talhão, vendas e ajustes de inventário." },
  reports: { eyebrow: "RELATÓRIOS GERENCIAIS", title: "Custos, receitas e movimentações", description: "Acompanhe os resultados da operação e gere relatórios para impressão ou PDF." },
};

export default function InventoryModule({ company, section }:{ company:string; section:InventorySection }) {
  const [data, setData] = useState<AnyRow>({ products: [], partners: [], movements: [], metrics: {} });
  const [message, setMessage] = useState("");
  const content = sectionContent[section];
  const load = () => fetch(`/api/inventory?company=${company}`, { cache: "no-store" })
    .then(r => r.json()).then(b => { setData(b); setMessage(b.error || ""); });

  // A troca de empresa deve sempre descartar o estoque anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [company]);

  const partners = data.partners || [];
  const availablePartners = useMemo(() => partners.filter((p: AnyRow) => p.partner_type !== "customer"), [partners]);
  const lowStock = (data.products || []).filter((p: AnyRow) => Number(p.stock) <= Number(p.minimum_stock));

  async function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action, company }) });
    const result = await response.json();
    setMessage(result.message || result.error);
    if (response.ok) { form.reset(); load(); }
  }

  return <section className="module inventory-module">
    <div className="module-hero inventory-hero">
      <span aria-hidden="true">▦</span>
      <div><small>{content.eyebrow}</small><h2>{content.title}</h2><p>{content.description}</p></div>
    </div>
    {message && <div className="inline-notice">{message}</div>}

    {section === "dashboard" && <>
      <div className="inventory-kpis">
        <article><small>VALOR EM ESTOQUE</small><b>{brl(data.metrics?.inventoryValue)}</b><p>Valor atualizado pelo custo médio</p></article>
        <article><small>COMPRAS</small><b>{brl(data.metrics?.purchases)}</b><p>Entradas registradas no período</p></article>
        <article><small>FATURAMENTO</small><b>{brl(data.metrics?.revenue)}</b><p>Receitas de vendas registradas</p></article>
        <article className={data.metrics?.lowStock ? "warning" : ""}><small>ESTOQUE BAIXO</small><b>{data.metrics?.lowStock || 0}</b><p>Itens abaixo do mínimo definido</p></article>
      </div>
      <SectionTitle title="Itens que exigem atenção" description="Produtos no estoque mínimo ou abaixo dele." />
      <ProductTable rows={lowStock} empty="Nenhum produto exige reposição no momento." />
    </>}

    {section === "products" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "product")} className="inventory-form">
        <div className="form-heading"><small>NOVO CADASTRO</small><h3>Produto ou insumo</h3><p>Preencha os dados essenciais. Você poderá movimentar o item logo após salvar.</p></div>
        <label>Descrição do produto<input name="description" placeholder="Ex.: Fertilizante NPK" required /></label>
        <div className="inventory-form-row"><label>Código / SKU<input name="sku" placeholder="Código interno" /></label><label>Unidade<select name="unit"><option>UN</option><option>KG</option><option>L</option><option>TON</option><option>SC</option><option>CX</option></select></label></div>
        <div className="inventory-form-row"><label>Estoque mínimo<input name="minimumStock" type="number" step="0.001" placeholder="0,000" /></label><label>Preço de venda<input name="salePrice" type="number" step="0.01" placeholder="0,00" /></label></div>
        <button className="primary">Salvar produto</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Produtos cadastrados" description={`${(data.products || []).length} item(ns) nesta empresa.`} /><ProductTable rows={data.products || []} /></div>
    </div>}

    {section === "partners" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "partner")} className="inventory-form">
        <div className="form-heading"><small>NOVO CADASTRO</small><h3>Cliente ou fornecedor</h3><p>Identifique o relacionamento para facilitar compras, vendas e relatórios.</p></div>
        <label>Tipo de parceiro<select name="partnerType"><option value="supplier">Fornecedor</option><option value="customer">Cliente</option><option value="both">Cliente e fornecedor</option></select></label>
        <label>Nome / Razão social<input name="name" placeholder="Nome completo ou razão social" required /></label>
        <label>Nome fantasia<input name="tradeName" placeholder="Nome pelo qual é conhecido" /></label>
        <label>CPF / CNPJ<input name="document" placeholder="Somente números ou formatado" /></label>
        <div className="inventory-form-row"><label>Telefone<input name="phone" placeholder="(00) 00000-0000" /></label><label>E-mail<input name="email" type="email" placeholder="contato@empresa.com" /></label></div>
        <button className="primary">Salvar cadastro</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Clientes e fornecedores cadastrados" description={`${partners.length} parceiro(s) nesta empresa.`} /><PartnerTable rows={partners} /></div>
    </div>}

    {section === "movements" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "movement")} className="inventory-form">
        <div className="form-heading"><small>NOVO LANÇAMENTO</small><h3>Movimentação de estoque</h3><p>Informe a origem ou o destino para compor corretamente custos e receitas.</p></div>
        <label>Tipo de movimentação<select name="movementType"><option value="purchase">Compra / entrada</option><option value="consumption">Consumo na lavoura</option><option value="sale">Venda / receita</option><option value="positive_adjustment">Ajuste positivo</option><option value="negative_adjustment">Ajuste negativo</option></select></label>
        <label>Produto<select name="productId" required><option value="">Selecione o produto</option>{(data.products || []).map((p: AnyRow) => <option value={p.id} key={p.id}>{p.description}</option>)}</select></label>
        <label>Cliente ou fornecedor<select name="partnerId"><option value="">Sem parceiro vinculado</option>{availablePartners.map((p: AnyRow) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <div className="inventory-form-row"><label>Data<input name="date" type="date" required /></label><label>Quantidade<input name="quantity" type="number" min="0.0001" step="0.0001" placeholder="0,0000" required /></label></div>
        <div className="inventory-form-row"><label>Valor unitário<input name="unitValue" type="number" step="0.01" placeholder="0,00" /></label><label>Documento<input name="documentNumber" placeholder="NF ou documento" /></label></div>
        <div className="inventory-form-row"><label>Cultura<input name="crop" placeholder="Cana, cacau..." /></label><label>Talhão / centro de custo<input name="costCenter" placeholder="Local da aplicação" /></label></div>
        <button className="primary">Registrar movimentação</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Movimentações recentes" description="Histórico de entradas, saídas, vendas e ajustes." /><MovementTable rows={data.movements || []} /></div>
    </div>}

    {section === "reports" && <>
      <div className="report-callout"><div><small>RELATÓRIO CONSOLIDADO</small><h3>Posição gerencial da empresa</h3><p>Indicadores de compras, estoque, faturamento e movimentações detalhadas.</p></div><button className="secondary" onClick={() => window.print()}>Imprimir ou salvar em PDF</button></div>
      <div className="inventory-kpis compact"><article><small>ESTOQUE</small><b>{brl(data.metrics?.inventoryValue)}</b></article><article><small>COMPRAS</small><b>{brl(data.metrics?.purchases)}</b></article><article><small>RECEITAS</small><b>{brl(data.metrics?.revenue)}</b></article><article><small>MOVIMENTAÇÕES</small><b>{(data.movements || []).length}</b></article></div>
      <SectionTitle title="Detalhamento das movimentações" description="Base para conferência de custos e receitas por produto, cultura e centro de custo." />
      <MovementTable rows={data.movements || []} />
    </>}
  </section>;
}

function SectionTitle({ title, description }:{ title:string; description:string }) { return <div className="inventory-section-title"><div><h3>{title}</h3><p>{description}</p></div></div>; }
function Empty({ text }:{ text:string }) { return <div className="inventory-empty"><span>✓</span><p>{text}</p></div>; }
function ProductTable({ rows, empty = "Nenhum produto cadastrado." }:{ rows:AnyRow[]; empty?:string }) { if (!rows.length) return <Empty text={empty} />; return <div className="table-scroll"><table className="data-table"><thead><tr><th>Produto</th><th>Unidade</th><th>Estoque</th><th>Custo médio</th><th>Mínimo</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><b>{r.description}</b><small>{r.sku ? `Código ${r.sku}` : "Sem código interno"}</small></td><td>{r.unit}</td><td>{Number(r.stock || 0).toLocaleString("pt-BR")}</td><td>{brl(r.average_cost_cents)}</td><td>{r.minimum_stock}</td></tr>)}</tbody></table></div>; }
function PartnerTable({ rows }:{ rows:AnyRow[] }) { if (!rows.length) return <Empty text="Nenhum cliente ou fornecedor cadastrado." />; return <div className="table-scroll"><table className="data-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Documento</th><th>Contato</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><b>{r.name}</b><small>{r.trade_name}</small></td><td>{r.partner_type === "supplier" ? "Fornecedor" : r.partner_type === "customer" ? "Cliente" : "Ambos"}</td><td>{r.document || "—"}</td><td>{r.phone || r.email || "—"}</td></tr>)}</tbody></table></div>; }
function MovementTable({ rows }:{ rows:AnyRow[] }) { if (!rows.length) return <Empty text="Nenhuma movimentação registrada." />; return <div className="table-scroll"><table className="data-table"><thead><tr><th>Data</th><th>Movimento</th><th>Produto</th><th>Quantidade</th><th>Valor total</th><th>Cultura / Centro</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{String(r.movement_date).split("-").reverse().join("/")}</td><td><span className={`movement-badge ${r.movement_type}`}>{movementNames[r.movement_type] || r.movement_type}</span></td><td><b>{r.inventory_products?.description}</b></td><td>{Number(r.quantity).toLocaleString("pt-BR")} {r.inventory_products?.unit}</td><td>{brl(Number(r.quantity) * Number(r.unit_value_cents))}</td><td>{[r.crop, r.cost_center].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div>; }
