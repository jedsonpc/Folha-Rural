"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import "./inventory.css";
import "./inventory-enhancements.css";
import CurrencyInput from "./currency-input";

type AnyRow = Record<string, any>;
type InventorySection = "dashboard" | "products" | "partners" | "crops" | "movements" | "reports";

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((c || 0) / 100);
const formatDocument=(d:string)=>d.length<=11?d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2"):d.replace(/(\d{2})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1/$2").replace(/(\d{4})(\d{1,2})$/,"$1-$2");

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
  crops: { eyebrow: "CADASTROS", title: "Culturas", description: "Cadastre as culturas utilizadas nas entradas e saídas de produtos da empresa." },
  movements: { eyebrow: "OPERAÇÃO", title: "Entradas e saídas", description: "Registre compras, consumo por cultura ou talhão, vendas e ajustes de inventário." },
  reports: { eyebrow: "RELATÓRIOS GERENCIAIS", title: "Custos, receitas e movimentações", description: "Acompanhe os resultados da operação e gere relatórios para impressão ou PDF." },
};

export default function InventoryModule({ company, section }:{ company:string; section:InventorySection }) {
  const [data, setData] = useState<AnyRow>({ products: [], partners: [], movements: [], metrics: {} });
  const [message, setMessage] = useState("");
  const [movementValue,setMovementValue]=useState({quantity:"",unit:"",total:""}),[filters,setFilters]=useState({from:"",to:"",type:"",product:""});
  const content = sectionContent[section];
  const load = () => fetch(`/api/inventory?company=${company}`, { cache: "no-store" })
    .then(r => r.json()).then(b => { setData(b); setMessage(b.error || ""); });

  // A troca de empresa deve sempre descartar o estoque anterior.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [company]);

  const partners = data.partners || [];
  const availablePartners = useMemo(() => partners, [partners]);
  const lowStock = (data.products || []).filter((p: AnyRow) => Number(p.stock) <= Number(p.minimum_stock));

  async function submit(e: React.FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action, company,quantity:movementValue.quantity||body.quantity,unitValue:movementValue.unit||body.unitValue,totalValue:movementValue.total }) });
    const result = await response.json();
    setMessage(result.message || result.error);
    if (response.ok) { form.reset(); load(); }
  }
  async function act(action:string,row:AnyRow){let payload:AnyRow={action,company,id:row.id};if(action==="saveProduct"){const description=prompt("Produto",row.description);if(!description)return;payload={...payload,description,sku:prompt("Código/SKU",row.sku||"")||"",unit:prompt("Unidade",row.unit||"UN")||"UN",minimumStock:prompt("Estoque mínimo",row.minimum_stock||"0")||"0"}}else if(action==="savePartner"){const name=prompt("Nome/Razão social",row.name);if(!name)return;payload={...payload,name,tradeName:prompt("Nome fantasia",row.trade_name||"")||"",document:prompt("CPF/CNPJ",row.document||"")||"",phone:prompt("Telefone",row.phone||"")||"",email:prompt("E-mail",row.email||"")||"",partnerType:row.partner_type}}else if(action==="saveCrop"){const name=prompt("Cultura",row.name);if(!name)return;payload={...payload,name}}else if(action.startsWith("delete")&&!confirm("Confirma a exclusão?"))return;const r=await fetch("/api/inventory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),b=await r.json();setMessage(b.message||b.error);if(r.ok)load()}
  const reportRows=(data.movements||[]).filter((r:AnyRow)=>(!filters.from||r.movement_date>=filters.from)&&(!filters.to||r.movement_date<=filters.to)&&(!filters.type||r.movement_type===filters.type)&&(!filters.product||String(r.product_id)===filters.product));

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
      <form onSubmit={e => submit(e, "saveProduct")} className="inventory-form">
        <div className="form-heading"><small>NOVO CADASTRO</small><h3>Produto ou insumo</h3><p>Preencha os dados essenciais. Você poderá movimentar o item logo após salvar.</p></div>
        <label>Descrição do produto<input name="description" placeholder="Ex.: Fertilizante NPK" required /></label>
        <div className="inventory-form-row"><label>Código / SKU<input name="sku" placeholder="Código interno" /></label><label>Unidade<select name="unit"><option>UN</option><option>KG</option><option>L</option><option>TON</option><option>SC</option><option>CX</option></select></label></div>
        <label>Estoque mínimo<input name="minimumStock" type="number" step="0.001" placeholder="0,000" /></label>
        <button className="primary">Salvar produto</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Produtos cadastrados" description={`${(data.products || []).length} item(ns) nesta empresa.`} /><ProductTable rows={data.products || []} edit={r=>act("saveProduct",r)} remove={r=>act("deleteProduct",r)} /></div>
    </div>}

    {section === "partners" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "savePartner")} className="inventory-form">
        <div className="form-heading"><small>NOVO CADASTRO</small><h3>Cliente ou fornecedor</h3><p>Identifique o relacionamento para facilitar compras, vendas e relatórios.</p></div>
        <label>Tipo de parceiro<select name="partnerType"><option value="supplier">Fornecedor</option><option value="customer">Cliente</option><option value="both">Cliente e fornecedor</option></select></label>
        <label>Nome / Razão social<input name="name" placeholder="Nome completo ou razão social" required /></label>
        <label>Nome fantasia<input name="tradeName" placeholder="Nome pelo qual é conhecido" /></label>
        <label>CPF / CNPJ<input name="document" maxLength={18} placeholder="000.000.000-00 ou 00.000.000/0000-00" onChange={async e=>{const input=e.currentTarget,d=input.value.replace(/\D/g,"").slice(0,14);input.value=formatDocument(d);if(d.length===14){const r=await fetch(`/api/cnpj?cnpj=${d}`),b=await r.json(),form=input.form;if(r.ok&&form){(form.elements.namedItem("name") as HTMLInputElement).value=b.legalName||b.name||"";(form.elements.namedItem("tradeName") as HTMLInputElement).value=b.tradeName||""}}}} /></label>
        <div className="inventory-form-row"><label>Telefone<input name="phone" placeholder="(00) 00000-0000" /></label><label>E-mail<input name="email" type="email" placeholder="contato@empresa.com" /></label></div>
        <button className="primary">Salvar cadastro</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Clientes e fornecedores cadastrados" description={`${partners.length} parceiro(s) nesta empresa.`} /><PartnerTable rows={partners} edit={r=>act("savePartner",r)} remove={r=>act("deletePartner",r)} /></div>
    </div>}

    {section === "crops" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "saveCrop")} className="inventory-form">
        <div className="form-heading"><small>NOVO CADASTRO</small><h3>Cultura agrícola</h3><p>As culturas salvas ficarão disponíveis na caixa Cultura das entradas e saídas.</p></div>
        <label>Nome da cultura<input name="name" placeholder="Ex.: Cacau, café ou cana-de-açúcar" required /></label>
        <button className="primary">Salvar cultura</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Culturas cadastradas" description={`${(data.crops || []).length} cultura(s) nesta empresa.`} /><CropTable rows={data.crops || []} edit={r=>act("saveCrop",r)} remove={r=>act("deleteCrop",r)} /></div>
    </div>}

    {section === "movements" && <div className="inventory-workspace">
      <form onSubmit={e => submit(e, "saveMovement")} className="inventory-form">
        <div className="form-heading"><small>NOVO LANÇAMENTO</small><h3>Movimentação de estoque</h3><p>Informe a origem ou o destino para compor corretamente custos e receitas.</p></div>
        <label>Tipo de movimentação<select name="movementType"><option value="purchase">Compra / entrada</option><option value="consumption">Consumo na lavoura</option><option value="sale">Venda / receita</option><option value="positive_adjustment">Ajuste positivo</option><option value="negative_adjustment">Ajuste negativo</option></select></label>
        <label>Produto<select name="productId" required><option value="">Selecione o produto</option>{(data.products || []).map((p: AnyRow) => <option value={p.id} key={p.id}>{p.description}</option>)}</select></label>
        <label>Cliente ou fornecedor<select name="partnerId"><option value="">Sem parceiro vinculado</option>{availablePartners.map((p: AnyRow) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <div className="inventory-form-row"><label>Data<input name="date" type="date" required /></label><label>Quantidade<input name="quantity" type="number" min="0.0001" step="0.0001" value={movementValue.quantity} onChange={e=>{const quantity=e.target.value;setMovementValue({...movementValue,quantity,total:quantity&&movementValue.unit?(Number(quantity)*Number(movementValue.unit)).toFixed(2):movementValue.total})}} required /></label></div>
        <div className="inventory-form-row"><label>Preço unitário (R$)<CurrencyInput name="unitValue" value={movementValue.unit} onValueChange={unit=>setMovementValue({...movementValue,unit,total:movementValue.quantity&&unit?(Number(movementValue.quantity)*Number(unit)).toFixed(2):movementValue.total})}/></label><label>Valor total (R$)<CurrencyInput value={movementValue.total} onValueChange={total=>setMovementValue({...movementValue,total,unit:movementValue.quantity&&total?(Number(total)/Number(movementValue.quantity)).toFixed(2):movementValue.unit})}/></label></div><label>Documento<input name="documentNumber" placeholder="NF ou documento" /></label>
        <div className="inventory-form-row"><label>Cultura<select name="crop"><option value="">Sem cultura vinculada</option>{(data.crops || []).map((crop: AnyRow) => <option value={crop.name} key={crop.id}>{crop.name}</option>)}</select></label><label>Talhão / centro de custo<input name="costCenter" placeholder="Local da aplicação" /></label></div>
        <button className="primary">Registrar movimentação</button>
      </form>
      <div className="inventory-list"><SectionTitle title="Movimentações recentes" description="Histórico de entradas, saídas, vendas e ajustes." /><MovementTable rows={data.movements || []} remove={r=>act("deleteMovement",r)} /></div>
    </div>}

    {section === "reports" && <>
      <div className="report-callout"><div><small>RELATÓRIO CONSOLIDADO</small><h3>Posição gerencial da empresa</h3><p>Indicadores de compras, estoque, faturamento e movimentações detalhadas.</p></div><button className="secondary" onClick={() => window.print()}>Imprimir ou salvar em PDF</button></div>
      <div className="report-filters"><label>De<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label><label>Até<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label><label>Movimento<select value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">Todos</option>{Object.entries(movementNames).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>Produto<select value={filters.product} onChange={e=>setFilters({...filters,product:e.target.value})}><option value="">Todos</option>{(data.products||[]).map((p:AnyRow)=><option key={p.id} value={p.id}>{p.description}</option>)}</select></label></div>
      <div className="inventory-kpis compact"><article><small>ESTOQUE</small><b>{brl(data.metrics?.inventoryValue)}</b></article><article><small>ENTRADAS FILTRADAS</small><b>{brl(reportRows.filter((r:AnyRow)=>r.movement_type==="purchase").reduce((s:number,r:AnyRow)=>s+Number(r.quantity)*Number(r.unit_value_cents),0))}</b></article><article><small>RECEITAS FILTRADAS</small><b>{brl(reportRows.filter((r:AnyRow)=>r.movement_type==="sale").reduce((s:number,r:AnyRow)=>s+Number(r.quantity)*Number(r.unit_value_cents),0))}</b></article><article><small>MOVIMENTAÇÕES</small><b>{reportRows.length}</b></article></div>
      <SectionTitle title="Detalhamento das movimentações" description="Base para conferência de custos e receitas por produto, cultura e centro de custo." />
      <MovementTable rows={reportRows} />
    </>}
  </section>;
}

function SectionTitle({ title, description }:{ title:string; description:string }) { return <div className="inventory-section-title"><div><h3>{title}</h3><p>{description}</p></div></div>; }
function Empty({ text }:{ text:string }) { return <div className="inventory-empty"><span>✓</span><p>{text}</p></div>; }
const Actions=({row,edit,remove}:{row:AnyRow;edit?:(r:AnyRow)=>void;remove?:(r:AnyRow)=>void})=><div className="record-actions">{edit&&<button className="secondary" onClick={()=>edit(row)}>Editar</button>}{remove&&<button className="danger" onClick={()=>remove(row)}>Excluir</button>}</div>;
function ProductTable({rows,empty="Nenhum produto cadastrado.",edit,remove}:{rows:AnyRow[];empty?:string;edit?:(r:AnyRow)=>void;remove?:(r:AnyRow)=>void}){if(!rows.length)return <Empty text={empty}/>;return <div className="record-grid">{rows.map(r=><article key={r.id}><header><b>{r.description}</b><span>{r.unit}</span></header><p>Código: {r.sku||"—"} · Estoque: {Number(r.stock||0).toLocaleString("pt-BR")} · Custo médio: {brl(r.average_cost_cents)} · Mínimo: {r.minimum_stock}</p><Actions row={r} edit={edit} remove={remove}/></article>)}</div>}
function PartnerTable({rows,edit,remove}:{rows:AnyRow[];edit:(r:AnyRow)=>void;remove:(r:AnyRow)=>void}){if(!rows.length)return <Empty text="Nenhum cliente ou fornecedor cadastrado."/>;return <div className="record-grid">{rows.map(r=><article key={r.id}><header><b>{r.name}</b><span>{r.partner_type==="supplier"?"Fornecedor":r.partner_type==="customer"?"Cliente":"Ambos"}</span></header><p>{r.trade_name||""} {r.document?`· ${formatDocument(r.document)}`:""} · {r.phone||r.email||"Sem contato"}</p><Actions row={r} edit={edit} remove={remove}/></article>)}</div>}
function CropTable({rows,edit,remove}:{rows:AnyRow[];edit:(r:AnyRow)=>void;remove:(r:AnyRow)=>void}){if(!rows.length)return <Empty text="Nenhuma cultura cadastrada."/>;return <div className="record-grid">{rows.map(r=><article key={r.id}><header><b>{r.name}</b></header><Actions row={r} edit={edit} remove={remove}/></article>)}</div>}
function MovementTable({rows,remove}:{rows:AnyRow[];remove?:(r:AnyRow)=>void}){if(!rows.length)return <Empty text="Nenhuma movimentação registrada."/>;return <div className="table-scroll"><table className="data-table"><thead><tr><th>Data</th><th>Movimento</th><th>Parceiro</th><th>Produto</th><th>Quantidade</th><th>Preço</th><th>Total</th><th>Cultura / Centro</th>{remove&&<th>Ações</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{String(r.movement_date).split("-").reverse().join("/")}</td><td><span className={`movement-badge ${r.movement_type}`}>{movementNames[r.movement_type]||r.movement_type}</span></td><td>{r.business_partners?.name||"—"}</td><td><b>{r.inventory_products?.description}</b></td><td>{Number(r.quantity).toLocaleString("pt-BR")} {r.inventory_products?.unit}</td><td>{brl(Number(r.unit_value_cents))}</td><td>{brl(Number(r.quantity)*Number(r.unit_value_cents))}</td><td>{[r.crop,r.cost_center].filter(Boolean).join(" · ")||"—"}</td>{remove&&<td><Actions row={r} remove={remove}/></td>}</tr>)}</tbody></table></div>}
