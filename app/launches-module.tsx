"use client";
import { useEffect, useMemo, useState } from "react";
import { cachedApiFetch, queueableLaunchFetch } from "./offline-api";
import "./launches.css";
import "./launches-holiday.css";
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
  baseSalaryCents: number;
  dailyRateCents: number;
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
type GridRow = { id?: number | string; serviceId: string; quantity: string; unitPrice: string };
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
  },
  rowKey = (contractId: number, slot = 0) => `${contractId}:${slot}`,
  formulaFactor = (formula: string | null) => {
    if (!formula) return 1;
    const normalized = formula.replace(/\s/g, "").replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 1;
    const value = Math.abs(Number(match[0]));
    return normalized.includes("%") || value > 1 ? value / 100 : value;
  },
  dsrAmount = (weeklyTotalCents: number) => Math.round(weeklyTotalCents / 6),
  isDailyAdditional = (service?: Service) => Boolean(service && /INSALUBR|PERICULOS|GRATIFICA/i.test(service.description));
export default function LaunchesModule({ company, isAdmin }: { company: string; isAdmin: boolean }) {
  const [date, setDate] = useState(iso()),
    [consultDate, setConsultDate] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showHoliday, setShowHoliday] = useState(false),
    [deleteDays, setDeleteDays] = useState<string[]>([]);
  const [entryMode, setEntryMode] = useState<"production" | "monthly">(
      "production",
    ),
    [gridRows, setGridRows] = useState<Record<string, GridRow>>({}),[dsrServiceId,setDsrServiceId]=useState(""),[dsrValues,setDsrValues]=useState<Record<number,string>>({}),[holidayServiceId,setHolidayServiceId]=useState(""),[holidayServiceSearch,setHolidayServiceSearch]=useState(""),[holidayValues,setHolidayValues]=useState<Record<number,string>>({});
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
  const recalculateAppliedDsr=async(changedDate:string)=>{
    if(!changedDate||company==="all")return 0;
    const response=await fetch(`/api/launches?company=${company}&month=${changedDate.slice(0,7)}`,{cache:"no-store"});
    if(!response.ok)return 0;
    const current=await response.json() as Data,dsrIds=new Set(current.services.filter(item=>/\bDSR\b|DESCANSO.*REMUNERADO|REPOUSO.*REMUNERADO|DESCANSO SEMANAL|REPOUSO SEMANAL/i.test(`${item.description} ${item.formulaCode||""}`)).map(item=>String(item.id))),key=weekKey(changedDate);if(dsrServiceId)dsrIds.add(dsrServiceId);
    const applied=current.entries.filter(entry=>weekKey(entry.entryDate)===key&&dsrIds.has(String(entry.serviceId))&&(new Date(`${entry.entryDate}T12:00:00`).getDay()===0||current.holidays.some(item=>item.holidayDate===entry.entryDate)));
    const grouped=new Map<string,Array<Record<string,unknown>>>();
    for(const dsrEntry of applied){const worker=current.contracts.find(c=>c.id===dsrEntry.contractId);if(!worker)continue;const production=current.entries.filter(entry=>entry.contractId===dsrEntry.contractId&&weekKey(entry.entryDate)===key&&entry.entryDate!==dsrEntry.entryDate&&!dsrIds.has(String(entry.serviceId))&&current.services.find(item=>item.id===entry.serviceId)?.affectsDsr),total=production.reduce((sum,entry)=>sum+entry.amountCents,0),daily=worker.dailyRateCents||Math.round((worker.baseSalaryCents||0)/30),start=new Date(`${key}T12:00:00`),expected=[] as string[];for(let i=0;i<6;i++){const day=new Date(start);day.setDate(start.getDate()+i);const dayIso=day.toISOString().slice(0,10);if((!worker.admissionDate||dayIso>=worker.admissionDate)&&!current.holidays.some(h=>h.holidayDate===dayIso))expected.push(dayIso)}const unjustified=production.some(e=>/FALTA.*INJUST|INJUST.*FALTA/i.test(`${current.services.find(s=>s.id===e.serviceId)?.description||""} ${e.notes||""}`)),lowDay=daily>0&&expected.some(day=>production.filter(e=>e.entryDate===day).reduce((sum,e)=>sum+e.amountCents,0)<daily),value=!unjustified&&!lowDay&&total>0?dsrAmount(total):0;if(value<=0)continue;const rows=grouped.get(dsrEntry.entryDate)||[];rows.push({contractId:dsrEntry.contractId,serviceId:dsrEntry.serviceId,quantity:"1",unitPrice:(value/100).toFixed(2)});grouped.set(dsrEntry.entryDate,rows)}
    let updated=0;for(const [entryDate,rows] of grouped){const saved=await queueableLaunchFetch("/api/launches",{action:"saveBatch",automaticDsr:true,companySourceId:Number(company),entryDate,rows});if(saved.ok)updated+=rows.length}return updated;
  };
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
      const payload=body as Record<string,unknown>,deletedDate=payload.action==="delete"?data?.entries.find(entry=>String(entry.id)===String(payload.id))?.entryDate:"",changedDate=String(payload.targetDate||payload.entryDate||deletedDate||"");
      const recalculated=payload.automaticDsr?0:await recalculateAppliedDsr(changedDate);
      setNotice(`${b.message || "Operação concluída."}${recalculated?` DSR recalculado automaticamente para ${recalculated} colaborador(es).`:""}`);
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
    const rows:Record<string,GridRow>={};
    const slots=new Map<number,number>();
    for(const entry of modeEntries){const slot=slots.get(entry.contractId)||0;if(entryMode==="production"&&slot>0)continue;if(entryMode==="monthly"&&slot>2)continue;rows[rowKey(entry.contractId,slot)]={id:entry.id,serviceId:String(entry.serviceId),quantity:String(entry.quantity),unitPrice:(entry.unitPriceCents/100).toFixed(2)};slots.set(entry.contractId,slot+1)}
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
  const daysWithEntries = useMemo(
    () => days.filter((day) => day.count > 0),
    [days],
  );
  useEffect(() => {
    setDeleteDays((selected) =>
      selected.filter((selectedDay) =>
        daysWithEntries.some((day) => day.date === selectedDay),
      ),
    );
  }, [daysWithEntries]);
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
      if (e.entryDate.startsWith(month)) {
        row.production += e.amountCents;
        row.worked.add(e.entryDate);
      }
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
        if (w.days.size) row.dsr += dsrAmount(w.total) * rests;
      }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, month]);
  const dsrServices=useMemo(()=>data?.services.filter(item=>/\bDSR\b|DESCANSO.*REMUNERADO|REPOUSO.*REMUNERADO|DESCANSO SEMANAL|REPOUSO SEMANAL/i.test(`${item.description} ${item.formulaCode||""}`))||[],[data]);
  const holidayServices=useMemo(()=>data?.services.filter(item=>item.active&&/FERIADO|FOLGA.*REMUNERAD|REPOUSO.*FERIADO|DESCANSO.*FERIADO|DIA.*FERIADO/i.test(`${item.description} ${item.formulaCode||""}`))||[],[data]);
  const selectableHolidayServices=useMemo(()=>{const query=holidayServiceSearch.trim().toLocaleLowerCase("pt-BR"),services=data?.services.filter(item=>item.active)??[];if(!query)return services;return services.filter(item=>`${item.sourceId} ${item.description} ${item.formulaCode||""}`.toLocaleLowerCase("pt-BR").includes(query))},[data,holidayServiceSearch]);
  useEffect(()=>{if(!dsrServiceId&&dsrServices[0])setDsrServiceId(String(dsrServices[0].id))},[dsrServices,dsrServiceId]);
  useEffect(()=>{if(!holidayServiceId&&holidayServices[0])setHolidayServiceId(String(holidayServices[0].id))},[holidayServices,holidayServiceId]);
  const selectedHoliday=data?.holidays.find(item=>item.holidayDate===date),isHoliday=Boolean(selectedHoliday);
  const weekHolidays=useMemo(()=>data?.holidays.filter(item=>weekKey(item.holidayDate)===weekKey(date))||[],[data,date]),hasWeekHoliday=weekHolidays.length>0,restDay=Boolean(data&&(new Date(`${date}T12:00:00`).getDay()===0||isHoliday));
  const selectedWeekDsr=useMemo(()=>{
    if(!data||!restDay)return[];
    const key=weekKey(date),start=new Date(`${key}T12:00:00`),rows=[] as Array<{contractId:number;name:string;total:number;days:Set<string>;calculated:number;eligible:boolean;reason:string;expectedDays:number}>;
    for(const worker of data.contracts){
      const daily=worker.dailyRateCents||Math.round((worker.baseSalaryCents||0)/30),admission=worker.admissionDate||"";
      const expected:string[]=[];for(let i=0;i<6;i++){const d=new Date(start);d.setDate(start.getDate()+i);const s=d.toISOString().slice(0,10);if((!admission||s>=admission)&&!data.holidays.some(h=>h.holidayDate===s))expected.push(s)}
      const weekly=data.entries.filter(entry=>entry.contractId===worker.id&&weekKey(entry.entryDate)===key&&entry.entryDate!==date&&!dsrServices.some(s=>s.id===entry.serviceId));
      const remuneration=weekly.filter(entry=>{const item=data.services.find(s=>s.id===entry.serviceId);return item?.affectsDsr&&item.entryType!=="deduction"}),total=remuneration.reduce((sum,e)=>sum+e.amountCents,0),days=new Set(remuneration.map(e=>e.entryDate));
      const unjustified=weekly.some(e=>/FALTA.*INJUST|INJUST.*FALTA/i.test(`${data.services.find(s=>s.id===e.serviceId)?.description||""} ${e.notes||""}`));
      const lowDay=daily>0&&expected.some(day=>remuneration.filter(e=>e.entryDate===day).reduce((sum,e)=>sum+e.amountCents,0)<daily);
      const admissionWeek=Boolean(admission&&weekKey(admission)===key),eligible=!unjustified&&!lowDay&&total>0;
      const calculated=eligible?dsrAmount(total):0;
      if(total||admissionWeek)rows.push({contractId:worker.id,name:worker.name,total,days,calculated,eligible,reason:unjustified?"Falta injustificada":lowDay?"Dia sem lançamento ou abaixo da diária":"Apto",expectedDays:expected.length});
    }
    return rows.sort((a,b)=>a.name.localeCompare(b.name));
  },[data,date,restDay,weekHolidays]);
  useEffect(()=>{if(!data||!dsrServiceId)return;const values:Record<number,string>={};for(const row of selectedWeekDsr){const saved=data.entries.find(entry=>entry.entryDate===date&&entry.contractId===row.contractId&&String(entry.serviceId)===dsrServiceId);values[row.contractId]=((saved?.amountCents??row.calculated)/100).toFixed(2)}setDsrValues(values)},[data,date,dsrServiceId,selectedWeekDsr]);
  useEffect(()=>{if(!data||!holidayServiceId||!hasWeekHoliday)return;const values:Record<number,string>={};for(const row of selectedWeekDsr){const worker=data.contracts.find(c=>c.id===row.contractId),saved=data.entries.find(entry=>weekHolidays.some(h=>h.holidayDate===entry.entryDate)&&entry.contractId===row.contractId&&String(entry.serviceId)===holidayServiceId),daily=worker?.dailyRateCents||Math.round((worker?.baseSalaryCents||0)/30);values[row.contractId]=((saved?.amountCents??(row.eligible?daily:0))/100).toFixed(2)}setHolidayValues(values)},[data,holidayServiceId,hasWeekHoliday,weekHolidays,selectedWeekDsr]);
  const saveDsr=async()=>{if(!dsrServiceId){setNotice("Cadastre ou selecione o serviço correspondente ao DSR.");return}if(hasWeekHoliday&&!holidayServiceId){setNotice("Cadastre ou selecione o serviço correspondente ao pagamento de feriado.");return}const incomplete=selectedWeekDsr.filter(row=>row.days.size<row.expectedDays);if(incomplete.length&&!window.confirm(`Atenção: ${incomplete.length} colaborador(es) não possuem lançamentos em todos os dias exigidos da semana. Deseja continuar o cálculo?`))return;const eligible=selectedWeekDsr.filter(row=>row.eligible);if(hasWeekHoliday){const holidayRows=eligible.map(row=>({contractId:row.contractId,serviceId:holidayServiceId,quantity:"1",unitPrice:holidayValues[row.contractId]||"0"})).filter(row=>Number(row.unitPrice)>0);for(const holidayDay of weekHolidays)if(holidayRows.length&&!await post({action:"saveBatch",automaticDsr:true,entryDate:holidayDay.holidayDate,rows:holidayRows}))return}const rows=eligible.map(row=>({contractId:row.contractId,serviceId:dsrServiceId,quantity:"1",unitPrice:dsrValues[row.contractId]||"0"})).filter(row=>Number(row.unitPrice)>0);if(!rows.length){setNotice("Nenhum colaborador atende às regras do DSR nesta semana.");return}await post({action:"saveBatch",automaticDsr:true,entryDate:date,rows})};
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
      .flatMap((c) => Array.from({length:entryMode==="monthly"?3:1},(_,slot)=>{const row=gridRows[rowKey(c.id,slot)],selected=data.services.find(service=>String(service.id)===row?.serviceId),daily=c.dailyRateCents||Math.round(c.baseSalaryCents/30),unitPrice=entryMode==="monthly"?((daily*(isDailyAdditional(selected)?formulaFactor(selected?.formulaCode||null):1))/100).toFixed(2):row?.unitPrice;return { contractId:c.id,...row,unitPrice }}))
      .filter((r) => r.serviceId && Number(r.quantity) > 0);
    const existing=rows.filter(row=>row.id),fresh=rows.filter(row=>!row.id);
    for(const row of existing)if(!await post({action:"updateEntry",id:row.id,entryDate:date,...row}))return;
    if(fresh.length)await post({ action: "saveBatch", entryDate: date, rows:fresh });
    else if(existing.length)setNotice(`${existing.length} apontamento(s) atualizado(s).`);
  };
  const deletePeriodEntries = async () => {
    if (!deleteDays.length) {
      setNotice("Selecione ao menos um dia com apontamentos para excluir.");
      return;
    }
    const selectedEntries = data.entries.filter((entry) => deleteDays.includes(entry.entryDate)).length;
    const allDays = deleteDays.length === daysWithEntries.length;
    const description = allDays
      ? `TODOS os ${selectedEntries} apontamentos de ${month.split("-").reverse().join("/")}`
      : `${selectedEntries} apontamento(s) de ${deleteDays.length} dia(s) selecionado(s)`;
    if (!window.confirm(`ATENÇÃO: você está prestes a excluir ${description}. Esta ação não pode ser desfeita. Deseja continuar?`)) return;
    if (await post({ action: "deletePeriod", month, deleteAll: allDays, days: deleteDays })) setDeleteDays([]);
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
          onClick={() => {setHoliday({date,name:holiday.name});setShowHoliday(!showHoliday)}}
        >
          ★ Incluir feriado
        </button>
      </div>
      {notice && <div className="inline-notice">{notice}</div>}
      {isAdmin && (
        <article className="panel period-delete-panel">
          <div className="period-delete-head">
            <div>
              <small>ÁREA EXCLUSIVA DO ADMINISTRADOR</small>
              <h2>Excluir apontamentos do período</h2>
              <p>Selecione todos os apontamentos do mês ou somente os dias que devem ser apagados.</p>
            </div>
            <b>{month.split("-").reverse().join("/")}</b>
          </div>
          {!daysWithEntries.length ? (
            <p className="sheet-empty">Este mês não possui apontamentos para exclusão.</p>
          ) : (
            <>
              <label className="period-delete-all">
                <input type="checkbox" checked={deleteDays.length === daysWithEntries.length} onChange={(event) => setDeleteDays(event.target.checked ? daysWithEntries.map((day) => day.date) : [])} />
                Excluir todos os apontamentos deste mês
              </label>
              <div className="period-delete-days">
                {daysWithEntries.map((day) => (
                  <label key={day.date}>
                    <input type="checkbox" checked={deleteDays.includes(day.date)} onChange={(event) => setDeleteDays(event.target.checked ? [...deleteDays, day.date] : deleteDays.filter((value) => value !== day.date))} />
                    <span><b>{dateBR(day.date)}</b><small>{day.count} apontamento(s)</small></span>
                  </label>
                ))}
              </div>
              <div className="period-delete-actions">
                <span>{deleteDays.length} de {daysWithEntries.length} dia(s) selecionado(s)</span>
                <button type="button" className="danger" disabled={busy || !deleteDays.length} onClick={deletePeriodEntries}>Excluir apontamentos selecionados</button>
              </div>
            </>
          )}
        </article>
      )}
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
              {activeGrid.flatMap((c) => Array.from({length:entryMode==="monthly"?3:1},(_,slot) => {
                const key=rowKey(c.id,slot),row = gridRows[key] || {serviceId:"",quantity:"",unitPrice:""},
                  selectedService=data.services.find((s)=>String(s.id)===row.serviceId),
                  dailyCents=c.dailyRateCents||Math.round(c.baseSalaryCents/30),
                  automaticUnitCents=entryMode==="monthly"?Math.round(dailyCents*(isDailyAdditional(selectedService)?formulaFactor(selectedService?.formulaCode||null):1)):Math.round(Number(row.unitPrice||0)*100),
                  displayedUnit=entryMode==="monthly"?(automaticUnitCents/100).toFixed(2):row.unitPrice,
                  total = Math.round(Number(row.quantity || 0)*automaticUnitCents);
                return (
                  <tr key={key} className={entryMode==="monthly"?"monthly-entry-row":""}>
                    <td>{slot===0&&<b>{c.registrationNumber || c.legacyCode}</b>}</td>
                    <td>{slot===0&&<div className="worker-cell"><b>{c.name}</b><small>{c.role || "Função não informada"}</small></div>}</td>
                    <td>{slot===0&&(c.role || "—")}</td>
                    <td>
                      <select
                        value={row.serviceId}
                        onChange={(e) => {const service=data.services.find(item=>String(item.id)===e.target.value),unit=entryMode==="monthly"?((dailyCents*(isDailyAdditional(service)?formulaFactor(service?.formulaCode||null):1))/100).toFixed(2):row.unitPrice;setGridRows({...gridRows,[key]:{...row,serviceId:e.target.value,unitPrice:unit}})}}
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
                        onChange={(e) => setGridRows({...gridRows,[key]:{...row,quantity:e.target.value,unitPrice:displayedUnit}})}
                      />
                    </td>
                    <td>
                      <CurrencyInput
                        min="0"
                        disabled={entryMode==="monthly"}
                        value={displayedUnit}
                        onValueChange={(value) => setGridRows({...gridRows,[key]:{...row,unitPrice:value}})}
                      />
                      {entryMode==="monthly"&&<small>{isDailyAdditional(selectedService)?"Diária × fórmula":"Salário-base ÷ 30"}</small>}
                    </td>
                    <td>
                      <b>{money(total)}</b>
                    </td>
                    <td><div className="entry-row-actions">{row.id&&<><button type="button" className="secondary">Editar</button><button type="button" className="secondary" onClick={async()=>{const target=window.prompt("Data para clonar este apontamento (AAAA-MM-DD):",date);if(!target||target===date)return;if(!/^20\d{2}-\d{2}-\d{2}$/.test(target)||Number(target.slice(0,4))>2100){setNotice("Informe uma data válida entre 2000 e 2100.");return}if(await post({action:"save",entryDate:target,contractId:c.id,serviceId:row.serviceId,quantity:row.quantity,unitPrice:displayedUnit}))setNotice(`Apontamento clonado para ${dateBR(target)}.`)}}>Clonar</button><button type="button" className="danger" onClick={async()=>{if(window.confirm(`Excluir o apontamento de ${c.name}?`))await post({action:"delete",id:row.id})}}>Excluir</button></>}</div></td>
                  </tr>
                );
              }))}
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
      <article className="panel dsr-entry-panel">
        <div className="panel-title"><div><small>DESCANSO SEMANAL REMUNERADO</small><h2>Calcular e lançar DSR no dia selecionado</h2></div><span className={`tag ${restDay?"":"muted"}`}>{restDay?`Descanso em ${dateBR(date)}`:"Selecione domingo ou feriado"}</span></div>
        <div className="dsr-entry-config"><label>Serviço/código do DSR<select value={dsrServiceId} onChange={event=>setDsrServiceId(event.target.value)}><option value="">Selecione o código correspondente…</option>{dsrServices.length>0&&<optgroup label="Serviços identificados como DSR">{dsrServices.map(item=><option key={item.id} value={item.id}>{item.sourceId} · {item.description}</option>)}</optgroup>}<optgroup label="Todos os serviços cadastrados">{data.services.filter(item=>!dsrServices.some(candidate=>candidate.id===item.id)).map(item=><option key={item.id} value={item.id}>{item.sourceId} · {item.description}</option>)}</optgroup></select><small>O DSR corresponde a 1/6 da remuneração semanal.</small></label>{hasWeekHoliday&&<label>Serviço/código do feriado<input type="search" value={holidayServiceSearch} onChange={event=>setHolidayServiceSearch(event.target.value)} placeholder="Buscar por código, serviço ou fórmula" aria-label="Buscar serviço de feriado"/><select value={holidayServiceId} onChange={event=>setHolidayServiceId(event.target.value)}><option value="">Selecione o serviço de feriado…</option>{holidayServices.length>0&&<optgroup label="Serviços identificados para feriado">{holidayServices.filter(item=>selectableHolidayServices.some(candidate=>candidate.id===item.id)).map(item=><option key={item.id} value={item.id}>{item.sourceId} · {item.description}</option>)}</optgroup>}<optgroup label="Todos os serviços cadastrados">{selectableHolidayServices.filter(item=>!holidayServices.some(candidate=>candidate.id===item.id)).map(item=><option key={item.id} value={item.id}>{item.sourceId} · {item.description}</option>)}</optgroup></select><small>{weekHolidays.map(h=>dateBR(h.holidayDate)).join(", ")}: a diária será gravada no feriado antes do DSR.</small></label>}<p>Direito condicionado à inexistência de falta injustificada e de dia exigido com remuneração abaixo da diária. É permitido lançar trabalho normalmente no feriado.</p></div>
        {!restDay?<p className="sheet-empty">O lançamento de DSR é disponibilizado quando a data escolhida for domingo ou feriado cadastrado.</p>:selectedWeekDsr.length?<><div className="dsr-entry-list">{selectedWeekDsr.map(row=><div key={row.contractId}><div><b>{row.name}</b><small>Remuneração: {money(row.total)} · {row.days.size}/{row.expectedDays} dia(s) exigido(s) · {row.reason}</small></div>{hasWeekHoliday&&<label>Feriado (R$ por dia)<CurrencyInput min="0" disabled={!row.eligible} value={holidayValues[row.contractId]||""} onValueChange={value=>setHolidayValues({...holidayValues,[row.contractId]:value})}/></label>}<label>DSR (R$)<CurrencyInput min="0" disabled={!row.eligible} value={dsrValues[row.contractId]||""} onValueChange={value=>setDsrValues({...dsrValues,[row.contractId]:value})}/></label></div>)}</div><div className="batch-actions"><span>{selectedWeekDsr.filter(r=>r.eligible).length} colaborador(es) apto(s)</span><button type="button" className="primary" disabled={busy||!dsrServiceId||(hasWeekHoliday&&!holidayServiceId)} onClick={saveDsr}>{hasWeekHoliday?"Gerar feriado(s) e depois DSR":"Salvar/atualizar DSR"}</button></div></>:<p className="sheet-empty">Não há remuneração que componha DSR nesta semana.</p>}
      </article>
      <article className="panel completed-entries-panel">
        <div className="panel-title"><div><small>APONTAMENTOS REALIZADOS</small><h2>{modeDayEntries.length} registro(s) em {dateBR(date)}</h2></div><b>{entryMode==="monthly"?"Mensalistas":"Apontamento diário"}</b></div>
        {modeDayEntries.length?<div className="table-scroll"><table className="data-table completed-entries-table"><thead><tr><th>Colaborador</th><th>Serviço</th><th>Quantidade</th><th>Preço</th><th>Total</th><th>Ações</th></tr></thead><tbody>{modeDayEntries.map(entry=><tr key={entry.id}><td><b>{contract(entry.contractId)?.name}</b></td><td>{service(entry.serviceId)?.description}</td><td>{entry.quantity}</td><td>{money(entry.unitPriceCents)}</td><td><b>{money(entry.amountCents)}</b></td><td><div className="entry-row-actions"><button type="button" className="secondary" onClick={()=>{const entries=modeDayEntries.filter(item=>item.contractId===entry.contractId),slot=Math.max(0,entries.findIndex(item=>item.id===entry.id));setGridRows({...gridRows,[rowKey(entry.contractId,slot)]:{id:entry.id,serviceId:String(entry.serviceId),quantity:String(entry.quantity),unitPrice:(entry.unitPriceCents/100).toFixed(2)}})}}>Editar</button><button type="button" className="secondary" onClick={()=>cloneEntry(entry)}>Clonar</button><button type="button" className="danger" onClick={async()=>{if(window.confirm(`Excluir o apontamento de ${contract(entry.contractId)?.name}?`))await post({action:"delete",id:entry.id})}}>Excluir</button></div></td></tr>)}</tbody></table></div>:<p className="sheet-empty">Nenhum apontamento realizado para este grupo nesta data.</p>}
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
        <div className="month-weekdays">{["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(day=><b key={day}>{day}</b>)}</div>
        <div className="month-days" style={{"--first-day":new Date(`${month}-01T12:00:00`).getDay()+1} as React.CSSProperties}>
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
