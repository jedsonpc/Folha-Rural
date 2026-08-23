"use client";
import { useEffect, useMemo, useState } from "react";
import { cachedApiFetch, queueableLaunchFetch } from "./offline-api";
import "./launches.css";
import CurrencyInput from "./currency-input";
type Contract = {
  id: number;
  name: string;
  registrationNumber: number | null;
  legacyCode: string | null;
  status: string;
  admissionDate: string | null;
  terminationDate: string | null;
  role: string | null;
  paymentType: "production" | "monthly";
};
type Service = {
  id: number;
  sourceId: number;
  description: string;
  unitName: string | null;
  formulaCode: string | null;
  entryType: "earning" | "deduction" | "special";
  affectsDsr: boolean;
  active: boolean;
};
type Entry = {
  id: number | string;
  entryDate: string;
  contractId: number;
  serviceId: number;
  quantity: string;
  unitPriceCents: number;
  amountCents: number;
  discountCents: number;
  sourceSequence: number | null;
  notes: string | null;
};
type Holiday = { id: number; holidayDate: string; name: string };
type Data = {
  contracts: Contract[];
  services: Service[];
  entries: Entry[];
  holidays: Holiday[];
};
const iso = () => new Date().toISOString().slice(0, 10),
  nextDay=(value:string)=>{const day=new Date(`${value}T12:00:00`);day.setDate(day.getDate()+1);return day.toISOString().slice(0,10)},
  money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100),
  dateBR = (s: string) => s.split("-").reverse().join("/"),
  weekKey = (s: string) => {
    const d = new Date(`${s}T12:00:00`),
      day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  };
export default function LaunchesModule({ company }: { company: string }) {
  const [date, setDate] = useState(iso()),
    [consultDate, setConsultDate] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showHoliday, setShowHoliday] = useState(false);
  const [entryMode, setEntryMode] = useState<"production" | "monthly">(
      "production",
    ),
    [gridRows, setGridRows] = useState<
      Record<number, { id?:number|string; serviceId: string; quantity: string; unitPrice: string }>
    >({});
  const [form, setForm] = useState({
      contractId: "",
      serviceId: "",
      quantity: "",
      unitPrice: "",
      notes: "",
    }),
    [cloneDate, setCloneDate] = useState(nextDay(iso())),
    [holiday, setHoliday] = useState({ date: iso(), name: "" });
  const month = date.slice(0, 7);
  const load = async (requestedMonth=month) => {
    if (company === "all") return;
    try {
      const r = await cachedApiFetch(`/api/launches?company=${company}&month=${requestedMonth}`,{cache:"no-store"}),
        b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setData(b);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  };
  useEffect(() => {
    load();
  }, [company, month]);
  const post = async (body: object) => {
    setBusy(true);
    setNotice("");
    try {
      const r = await queueableLaunchFetch("/api/launches", {
          ...body,
          companySourceId: Number(company),
        }),
        b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setNotice(b.message || "Operação concluída.");
      const targetDate=String((body as Record<string,unknown>).targetDate||"");
      await load(targetDate?targetDate.slice(0,7):month);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha na operação.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const dayEntries = data?.entries.filter((e) => e.entryDate === date) || [],
    contract = (id: number) => data?.contracts.find((c) => c.id === id),
    service = (id: number) => data?.services.find((s) => s.id === id);
  useEffect(()=>{
    if(!data)return;
    const modeEntries=data.entries.filter(entry=>entry.entryDate===date&&data.contracts.find(item=>item.id===entry.contractId)?.paymentType===entryMode);
    const rows:Record<number,{id?:number|string;serviceId:string;quantity:string;unitPrice:string}>={};
    for(const entry of modeEntries)if(!rows[entry.contractId])rows[entry.contractId]={id:entry.id,serviceId:String(entry.serviceId),quantity:String(entry.quantity),unitPrice:(entry.unitPriceCents/100).toFixed(2)};
    setGridRows(rows);
  },[data,date,entryMode]);
  const days = useMemo(() => {
    if (!data) return [];
    const [y, m] = month.split("-").map(Number),
      count = new Date(y, m, 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const d = `${month}-${String(i + 1).padStart(2, "0")}`,
        entries = data.entries.filter((e) => e.entryDate === d),
        holiday = data.holidays.find((h) => h.holidayDate === d);
      return {
        date: d,
        total: entries.reduce((a, e) => a + e.amountCents, 0),
        count: entries.length,
        holiday,
        sunday: new Date(`${d}T12:00:00`).getDay() === 0,
      };
    });
  }, [data, month]);
  const dsr = useMemo(() => {
    if (!data) return [];
    const by = new Map<
      number,
      {
        name: string;
        production: number;
        dsr: number;
        rests: number;
        worked: Set<string>;
        weeks: Map<string, { total: number; days: Set<string> }>;
      }
    >();
    for (const e of data.entries) {
      if (e.sourceSequence != null) continue;
      const service = data.services.find((s) => s.id === e.serviceId);
      if (!service?.affectsDsr) continue;
      const c = data.contracts.find((x) => x.id === e.contractId);
      if (!c) continue;
      let row = by.get(e.contractId);
      if (!row) {
        row = {
          name: c.name,
          production: 0,
          dsr: 0,
          rests: 0,
          worked: new Set(),
          weeks: new Map(),
        };
        by.set(e.contractId, row);
      }
      row.production += e.amountCents;
      row.worked.add(e.entryDate);
      const key = weekKey(e.entryDate),
        w = row.weeks.get(key) || { total: 0, days: new Set<string>() };
      w.total += e.amountCents;
      w.days.add(e.entryDate);
      row.weeks.set(key, w);
    }
    for (const row of by.values())
      for (const [key, w] of row.weeks) {
        const start = new Date(`${key}T12:00:00`);
        let rests = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const s = d.toISOString().slice(0, 10);
          if (!s.startsWith(month)) continue;
          if (
            d.getDay() === 0 ||
            data.holidays.some((h) => h.holidayDate === s)
          )
            rests++;
        }
        row.rests += rests;
        if (w.days.size) row.dsr += Math.round((w.total / w.days.size) * rests);
      }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, month]);
  if (company === "all")
    return (
      <section className="module launch-empty">
        <h2>Selecione uma empresa</h2>
        <p>Os apontamentos são sempre feitos dentro de uma empresa.</p>
      </section>
    );
  if (error)
    return (
      <section className="panel data-state">
        <b>Não foi possível abrir os apontamentos</b>
        <p>{error}</p>
      </section>
    );
  if (!data)
    return (
      <section className="panel data-state">
        <span className="spinner" />
        <p>Carregando calendário…</p>
      </section>
    );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await post({ action: "save", entryDate: date, ...form }))
      setForm({ ...form, quantity: "", notes: "" });
  };
  const activeGrid = data.contracts
    .filter(
      (c) =>
        c.status === "active" &&
        c.paymentType === entryMode &&
        (!c.admissionDate || c.admissionDate <= date) &&
        (!c.terminationDate || c.terminationDate >= date),
    )
    .sort(
      (a, b) =>
        (a.registrationNumber || 999999) - (b.registrationNumber || 999999),
    );
  const modeDayEntries=dayEntries.filter(entry=>contract(entry.contractId)?.paymentType===entryMode);
  const cloneEntry=async(entry:Entry)=>{const target=window.prompt("Data para clonar este apontamento (AAAA-MM-DD):",date);if(!target||target===date)return;if(!/^20\d{2}-\d{2}-\d{2}$/.test(target)||Number(target.slice(0,4))>2100){setNotice("Informe uma data válida entre 2000 e 2100.");return}if(await post({action:"save",entryDate:target,contractId:entry.contractId,serviceId:entry.serviceId,quantity:entry.quantity,unitPrice:(entry.unitPriceCents/100).toFixed(2),notes:entry.notes||""}))setNotice(`Apontamento clonado para ${dateBR(target)}.`)};
  const saveGrid = async () => {
    const rows = activeGrid
      .map((c) => ({ contractId: c.id, ...gridRows[c.id] }))
      .filter((r) => r.serviceId && Number(r.quantity) > 0);
    const existing=rows.filter(row=>row.id),fresh=rows.filter(row=>!row.id);
    for(const row of existing)if(!await post({action:"updateEntry",id:row.id,entryDate:date,...row}))return;
    if(fresh.length)await post({ action: "saveBatch", entryDate: date, rows:fresh });
    else if(existing.length)setNotice(`${existing.length} apontamento(s) atualizado(s).`);
  };
  return (
    <section className="launches">
      <div className="launch-toolbar">
        <label>
          Dia do apontamento
          <input
            type="date"
            value={date}
            onChange={(e) => {setDate(e.target.value);setCloneDate(nextDay(e.target.value))}}
          />
        </label>
        <button
          className="secondary"
          onClick={() => setShowHoliday(!showHoliday)}
        >
          ★ Incluir feriado
        </button>
      </div>
      {notice && <div className="inline-notice">{notice}</div>}
      {showHoliday && (
        <div className="operation-box">
          <div>
            <b>Novo feriado</b>
            <p>Será considerado no cálculo do DSR.</p>
          </div>
          <input
            type="date"
            value={holiday.date}
            onChange={(e) => setHoliday({ ...holiday, date: e.target.value })}
          />
          <input
            placeholder="Nome do feriado"
            value={holiday.name}
            onChange={(e) => setHoliday({ ...holiday, name: e.target.value })}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (
                await post({
                  action: "holiday",
                  holidayDate: holiday.date,
                  name: holiday.name,
                })
              ) {
                setShowHoliday(false);
                setHoliday({ ...holiday, name: "" });
              }
            }}
          >
            Salvar feriado
          </button>
        </div>
      )}
      <article className="panel batch-entry-panel">
        <div className="panel-title">
          <div>
            <small>PLANILHA DE APONTAMENTO DIÁRIO</small>
            <h2>{dateBR(date)}</h2>
          </div>
          <div className="entry-mode">
            <button
              className={entryMode === "production" ? "active" : ""}
              onClick={() => setEntryMode("production")}
            >
              Apontamento de produção
            </button>
            <button
              className={entryMode === "monthly" ? "active" : ""}
              onClick={() => setEntryMode("monthly")}
            >
              Apontamento de mensalistas
            </button>
          </div>
        </div>
        <div className="day-clone-card">
          <div className="day-clone-title"><span>⧉</span><div><b>Clonar apontamentos deste dia</b><small>Origem: {dateBR(date)}. Escolha abaixo o dia que receberá uma cópia de todos os apontamentos salvos.</small></div></div>
          <label>Dia de destino<input type="date" min="2000-01-01" max="2100-12-31" value={cloneDate} onChange={e=>setCloneDate(e.target.value)}/></label>
          <button type="button" className="primary" disabled={busy||!dayEntries.length||cloneDate===date} onClick={async()=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(cloneDate)||Number(cloneDate.slice(0,4))>2100){setNotice("Escolha uma data de destino válida entre 2000 e 2100.");return}if(cloneDate===date){setNotice("O dia de destino deve ser diferente do dia de origem.");return}if(await post({action:"clone",sourceDate:date,targetDate:cloneDate})){const destination=cloneDate;setDate(destination);setCloneDate(nextDay(destination))}}}>Clonar para {cloneDate?dateBR(cloneDate):"o dia escolhido"}</button>
          {!dayEntries.length&&<small className="day-clone-warning">Salve ao menos um apontamento neste dia para habilitar a clonagem.</small>}
        </div>
        <div className="table-scroll">
          <table className="data-table batch-table">
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Colaborador</th>
                <th>Função</th>
                <th>Código / serviço</th>
                <th>Produção</th>
                <th>Preço</th>
                <th>Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeGrid.map((c) => {
                const row = gridRows[c.id] || {
                    serviceId: "",
                    quantity: "",
                    unitPrice: "",
                  },
                  total = Math.round(
                    Number(row.quantity || 0) *
                      Number(row.unitPrice || 0) *
                      100,
                  );
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.registrationNumber || c.legacyCode}</b>
                    </td>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td>{c.role || "—"}</td>
                    <td>
                      <select
                        value={row.serviceId}
                        onChange={(e) =>
                          setGridRows({
                            ...gridRows,
                            [c.id]: { ...row, serviceId: e.target.value },
                          })
                        }
                      >
                        <option value="">Selecione…</option>
                        {data.services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.sourceId} · {s.description}
                          </option>
                        ))}
                      </select>
                      {data.services.find((s) => String(s.id) === row.serviceId)?.formulaCode && (
                        <small>Fórmula: {data.services.find((s) => String(s.id) === row.serviceId)?.formulaCode}</small>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={row.quantity}
                        onChange={(e) =>
                          setGridRows({
                            ...gridRows,
                            [c.id]: { ...row, quantity: e.target.value },
                          })
                        }
                      />
                    </td>
                    <td>
                      <CurrencyInput
                        min="0"
                        value={row.unitPrice}
                        onValueChange={(value) =>
                          setGridRows({
                            ...gridRows,
                            [c.id]: { ...row, unitPrice: value },
                          })
                        }
                      />
                    </td>
                    <td>
                      <b>{money(total)}</b>
                    </td>
                    <td><div className="entry-row-actions">{row.id&&<><button type="button" className="secondary" onClick={()=>setGridRows({...gridRows,[c.id]:row})}>Editar</button><button type="button" className="secondary" onClick={async()=>{const target=window.prompt("Data para clonar este apontamento (AAAA-MM-DD):",date);if(!target||target===date)return;if(!/^20\d{2}-\d{2}-\d{2}$/.test(target)||Number(target.slice(0,4))>2100){setNotice("Informe uma data válida entre 2000 e 2100.");return}if(await post({action:"save",entryDate:target,contractId:c.id,serviceId:row.serviceId,quantity:row.quantity,unitPrice:row.unitPrice}))setNotice(`Apontamento clonado para ${dateBR(target)}.`)}}>Clonar</button><button type="button" className="danger" onClick={async()=>{if(window.confirm(`Excluir o apontamento de ${c.name}?`))await post({action:"delete",id:row.id})}}>Excluir</button></>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!activeGrid.length && (
          <p className="sheet-empty">
            Nenhum colaborador ativo classificado como{" "}
            {entryMode === "production" ? "produção" : "mensalista"}.
          </p>
        )}
        <div className="batch-actions">
          <span>{activeGrid.length} colaboradores ativos · {dayEntries.filter(entry=>contract(entry.contractId)?.paymentType===entryMode).length} apontamento(s) nesta data</span>
          <button
            className="primary"
            disabled={busy || !activeGrid.length}
            onClick={saveGrid}
          >
            Salvar planilha do dia
          </button>
        </div>
      </article>
      <article className="panel completed-entries-panel">
        <div className="panel-title"><div><small>APONTAMENTOS REALIZADOS</small><h2>{modeDayEntries.length} registro(s) em {dateBR(date)}</h2></div><b>{entryMode==="monthly"?"Mensalistas":"Apontamento diário"}</b></div>
        {modeDayEntries.length?<div className="table-scroll"><table className="data-table completed-entries-table"><thead><tr><th>Colaborador</th><th>Serviço</th><th>Quantidade</th><th>Preço</th><th>Total</th><th>Ações</th></tr></thead><tbody>{modeDayEntries.map(entry=><tr key={entry.id}><td><b>{contract(entry.contractId)?.name}</b></td><td>{service(entry.serviceId)?.description}</td><td>{entry.quantity}</td><td>{money(entry.unitPriceCents)}</td><td><b>{money(entry.amountCents)}</b></td><td><div className="entry-row-actions"><button type="button" className="secondary" onClick={()=>setGridRows({...gridRows,[entry.contractId]:{id:entry.id,serviceId:String(entry.serviceId),quantity:String(entry.quantity),unitPrice:(entry.unitPriceCents/100).toFixed(2)}})}>Editar</button><button type="button" className="secondary" onClick={()=>cloneEntry(entry)}>Clonar</button><button type="button" className="danger" onClick={async()=>{if(window.confirm(`Excluir o apontamento de ${contract(entry.contractId)?.name}?`))await post({action:"delete",id:entry.id})}}>Excluir</button></div></td></tr>)}</tbody></table></div>:<p className="sheet-empty">Nenhum apontamento realizado para este grupo nesta data.</p>}
      </article>
      <div className="launch-grid legacy-entry-form">
        <article className="panel entry-panel">
          <div className="data-heading">
            <small>LANÇAMENTO DIÁRIO</small>
            <h2>{dateBR(date)}</h2>
            <p>
              {data.holidays.find((h) => h.holidayDate === date)?.name ||
                "Produção por colaborador e serviço"}
            </p>
          </div>
          <form onSubmit={save} className="entry-form">
            <label>
              Colaborador
              <select
                required
                value={form.contractId}
                onChange={(e) =>
                  setForm({ ...form, contractId: e.target.value })
                }
              >
                <option value="">Selecione…</option>
                {data.contracts
                  .filter(
                    (c) =>
                      (!c.admissionDate || c.admissionDate <= date) &&
                      (!c.terminationDate || c.terminationDate >= date),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ·{" "}
                      {c.registrationNumber
                        ? `MAT ${c.registrationNumber}`
                        : c.legacyCode}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Serviço
              <select
                required
                value={form.serviceId}
                onChange={(e) =>
                  setForm({ ...form, serviceId: e.target.value })
                }
              >
                <option value="">Selecione…</option>
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sourceId} · {s.description}
                  </option>
                ))}
              </select>
              {data.services.find((s) => String(s.id) === form.serviceId)?.formulaCode && (
                <small>Fórmula: {data.services.find((s) => String(s.id) === form.serviceId)?.formulaCode}</small>
              )}
            </label>
            <label>
              Quantidade
              <input
                required
                type="number"
                min="0.001"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </label>
            <label>
              Valor unitário (R$)
              <CurrencyInput
                required
                min="0"
                value={form.unitPrice}
                onValueChange={(value) =>
                  setForm({ ...form, unitPrice: value })
                }
              />
            </label>
            <label className="wide">
              Observação
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <div className="entry-total">
              <span>Total calculado</span>
              <b>
                {money(
                  Math.round(
                    Number(form.quantity || 0) *
                      Number(form.unitPrice || 0) *
                      100,
                  ),
                )}
              </b>
            </div>
            <button className="primary" disabled={busy}>
              Salvar lançamento
            </button>
          </form>
        </article>
        <article className="panel day-panel">
          <div className="panel-title">
            <div>
              <small>CONFERÊNCIA DO DIA</small>
              <h2>{dayEntries.length} lançamentos</h2>
            </div>
            <b>{money(dayEntries.reduce((a, e) => a + e.amountCents, 0))}</b>
          </div>
          <div className="day-list">
            {dayEntries.length ? (
              dayEntries.map((e) => (
                <div key={e.id}>
                  <div>
                    <b>{contract(e.contractId)?.name}</b>
                    <small>
                      {service(e.serviceId)?.description} · {e.quantity} ×{" "}
                      {money(e.unitPriceCents)}
                    </small>
                  </div>
                  <strong>{money(e.amountCents)}</strong>
                  <button onClick={() => post({ action: "delete", id: e.id })}>
                    ×
                  </button>
                </div>
              ))
            ) : (
              <p>Nenhum lançamento neste dia.</p>
            )}
          </div>
        </article>
      </div>
      <article className="panel calendar-panel">
        <div className="panel-title">
          <div>
            <small>COMPETÊNCIA</small>
            <h2>Calendário de {month.split("-").reverse().join("/")}</h2>
          </div>
          <span>Clique para consultar a planilha do dia</span>
        </div>
        <div className="month-days">
          {days.map((d) => (
            <button
              key={d.date}
              className={`${d.date === date ? "selected" : ""} ${d.sunday || d.holiday ? "rest" : ""}`}
              onClick={() => {
                setDate(d.date);
                setConsultDate(d.date);
              }}
            >
              <small>{dateBR(d.date).slice(0, 5)}</small>
              {d.holiday ? (
                <em>{d.holiday.name}</em>
              ) : d.sunday ? (
                <em>Domingo</em>
              ) : (
                <em>{d.count} lanç.</em>
              )}
              <b>{d.total ? money(d.total) : "—"}</b>
            </button>
          ))}
        </div>
      </article>
      {consultDate && (
        <div className="modal-backdrop">
          <div className="modal daily-sheet">
            <div className="modal-head">
              <div>
                <small>CONSULTA DE APONTAMENTOS</small>
                <h2>Planilha de {dateBR(consultDate)}</h2>
              </div>
              <button onClick={() => setConsultDate(null)}>×</button>
            </div>
            <div className="sheet-summary">
              <span>
                {data.entries.filter((e) => e.entryDate === consultDate).length}{" "}
                lançamentos
              </span>
              <b>
                Total bruto:{" "}
                {money(
                  data.entries
                    .filter((e) => e.entryDate === consultDate)
                    .reduce((a, e) => a + e.amountCents, 0),
                )}
              </b>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Serviço</th>
                    <th>Quantidade</th>
                    <th>Valor unitário</th>
                    <th>Desconto</th>
                    <th>Total</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries
                    .filter((e) => e.entryDate === consultDate)
                    .map((e) => (
                      <tr key={e.id}>
                        <td>
                          <b>{contract(e.contractId)?.name || "—"}</b>
                        </td>
                        <td>{service(e.serviceId)?.description || "—"}</td>
                        <td>{e.quantity}</td>
                        <td>{money(e.unitPriceCents)}</td>
                        <td>{money(e.discountCents || 0)}</td>
                        <td>
                          <b>{money(e.amountCents)}</b>
                        </td>
                        <td>
                          {e.sourceSequence != null ? "Access" : "Folha Rural"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!data.entries.some((e) => e.entryDate === consultDate) && (
              <p className="sheet-empty">
                Nenhum lançamento registrado neste dia.
              </p>
            )}
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setConsultDate(null)}
              >
                Fechar consulta
              </button>
            </div>
          </div>
        </div>
      )}
      <article className="panel dsr-panel">
        <div className="panel-title">
          <div>
            <small>MEMÓRIA DE CÁLCULO</small>
            <h2>DSR sobre média de produção</h2>
          </div>
          <span className="tag">Prévia mensal</span>
        </div>
        <p className="dsr-rule">
          Regra inicial: em cada semana, produção ÷ dias com produção × domingos
          e feriados. Confira a convenção coletiva aplicável.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Produção</th>
                <th>Dias trabalhados</th>
                <th>Repousos/feriados</th>
                <th>DSR calculado</th>
                <th>Total variável</th>
              </tr>
            </thead>
            <tbody>
              {dsr.map((r) => (
                <tr key={r.name}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{money(r.production)}</td>
                  <td>{r.worked.size}</td>
                  <td>{r.rests}</td>
                  <td>
                    <b>{money(r.dsr)}</b>
                  </td>
                  <td>
                    <b>{money(r.production + r.dsr)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
