"use client";
import { useEffect, useMemo, useState } from "react";
import "./hr.css";

const brl=(c:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((c||0)/100);
const isoToday=()=>new Date().toISOString().slice(0,10);
const isoDate=(date:Date)=>date.toISOString().slice(0,10);
const addDays=(value:string,days:number)=>{if(!value)return"";const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return isoDate(date)};
const addYears=(value:string,years:number,minusDay=false)=>{if(!value)return"";const date=new Date(`${value}T12:00:00Z`);date.setUTCFullYear(date.getUTCFullYear()+years);if(minusDay)date.setUTCDate(date.getUTCDate()-1);return isoDate(date)};
const vacationDays=(absences:number,lossReason:string)=>{if(lossReason)return 0;if(absences<=5)return 30;if(absences<=14)return 24;if(absences<=23)return 18;if(absences<=32)return 12;return 0};
const statusLabel:Record<string,string>={pending:"Pendente",scheduled:"Programada",taken:"Gozada",paid:"Quitada"};
const emptyVacation={accrualStart:"",accrualEnd:"",concessionDeadline:"",scheduledStart:"",scheduledEnd:"",unjustifiedAbsences:0,lossReason:"",days:30,sellAllowance:false,soldDays:0,paymentDate:"",status:"pending",notes:""};

export default function WorkerHrTabs({contractId,kind}:{contractId:number;kind:"salary"|"vacation"}) {
  const [data,setData]=useState<any>({profile:null,salaries:[],vacations:[],contract:null}),[msg,setMsg]=useState("");
  const [salary,setSalary]=useState<any>({salaryType:"monthly",baseSalary:"",dailyRate:"",advanceRate:40,effectiveDate:isoToday(),reason:""});
  const [vac,setVac]=useState<any>(emptyVacation);
  const deriveVacation=(next:any)=>{const absences=Math.max(0,Number(next.unjustifiedAbsences)||0),days=vacationDays(absences,next.lossReason),soldDays=next.sellAllowance&&days?Math.floor(days/3):0,scheduledEnd=next.scheduledStart&&days?addDays(next.scheduledStart,Math.max(1,days-soldDays)-1):"";return{...next,unjustifiedAbsences:absences,days,soldDays,accrualEnd:addYears(next.accrualStart,1,true),concessionDeadline:addYears(addYears(next.accrualStart,1,true),1),scheduledEnd,paymentDate:next.paymentDate||(next.scheduledStart?addDays(next.scheduledStart,-2):"")}};
  const suggestedAccrualStart=(payload:any)=>{const latest=payload.vacations?.[0];return latest?.accrual_end?addDays(latest.accrual_end,1):payload.contract?.admission_date||""};
  const load=()=>fetch(`/api/hr?contractId=${contractId}`).then(r=>r.json()).then(b=>{setData(b);if(b.profile){const base=(b.profile.base_salary_cents/100).toFixed(2);setSalary((s:any)=>({...s,salaryType:b.profile.salary_type,baseSalary:base,dailyRate:(Number(base)/30).toFixed(2),advanceRate:b.profile.advance_rate_basis_points/100}))}setVac((current:any)=>{if(current.accrualStart)return current;const start=suggestedAccrualStart(b);return start?deriveVacation({...current,accrualStart:start}):current})});
  useEffect(()=>{void load()},[contractId]);
  const save=async(body:any)=>{setMsg("");const r=await fetch("/api/hr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),b=await r.json();setMsg(b.error||b.message);if(r.ok){await load();if(body.action==="saveVacation")setVac(emptyVacation)}};
  const updateVacation=(change:any)=>setVac((current:any)=>deriveVacation({...current,...change}));
  const alerts=(data.vacations||[]).filter((v:any)=>v.status!=="paid"&&new Date(v.concession_deadline).getTime()-Date.now()<=122*86400000);
  const maxAllowance=vac.days?Math.floor(Number(vac.days)/3):0,daysToTake=Math.max(0,Number(vac.days)-Number(vac.soldDays));
  const vacationNotes=useMemo(()=>[`Faltas injustificadas no período: ${vac.unjustifiedAbsences}.`,`Hipótese de perda do direito: ${vac.lossReason||"Não informada"}.`,`Dias de direito calculados conforme art. 130 da CLT: ${vac.days}.`,vac.sellAllowance?`Abono pecuniário: ${vac.soldDays} dia(s).`:"Sem abono pecuniário.",vac.notes].filter(Boolean).join("\n"),[vac]);

  if(kind==="salary")return <div className="hr-pane salary-pane">
    <div className="salary-heading"><div><h3>Salário e remuneração</h3><p className="helper">Defina os parâmetros usados nos cálculos da folha do colaborador.</p></div><span className="salary-badge">Configuração salarial</span></div>
    <section className="salary-card"><div className="salary-card-title"><span>1</span><div><b>Remuneração principal</b><small>Informe o regime e o salário mensal contratado.</small></div></div>
      <div className="salary-grid salary-grid-main">
        <label>Tipo de salário<select value={salary.salaryType} onChange={e=>setSalary({...salary,salaryType:e.target.value})}><option value="monthly">Mensalista</option><option value="daily">Apontamento diário</option></select></label>
        <label>Salário-base mensal (R$)<input type="number" min="0" step=".01" value={salary.baseSalary} onChange={e=>{const base=e.target.value;setSalary({...salary,baseSalary:base,dailyRate:base?(Number(base)/30).toFixed(2):""})}}/></label>
        <label className="calculated-field">Valor da diária (R$)<input type="number" step=".01" value={salary.baseSalary?(Number(salary.baseSalary)/30).toFixed(2):""} readOnly/><small className="field-help">Cálculo automático: salário mensal ÷ 30.</small></label>
      </div>
    </section>
    <section className="salary-card"><div className="salary-card-title"><span>2</span><div><b>Parâmetros e vigência</b><small>Complete os dados que identificam esta configuração salarial.</small></div></div>
      <div className="salary-grid salary-grid-details">
        <label>Adiantamento quinzenal (%)<input type="number" min="0" max="100" step=".01" value={salary.advanceRate} onChange={e=>setSalary({...salary,advanceRate:e.target.value})}/></label>
        <label>Data de vigência<input type="date" value={salary.effectiveDate} onChange={e=>setSalary({...salary,effectiveDate:e.target.value})}/></label>
        <label className="salary-reason">Motivo ou observação<input placeholder="Ex.: admissão, reajuste anual ou promoção" value={salary.reason} onChange={e=>setSalary({...salary,reason:e.target.value})}/></label>
      </div>
    </section>
    <div className="salary-actions"><button type="button" className="primary" onClick={()=>save({action:"saveProfile",contractId,...salary,dailyRate:salary.baseSalary?(Number(salary.baseSalary)/30).toFixed(2):""})}>Salvar configuração salarial</button></div>{msg&&<div className="inline-notice">{msg}</div>}
    <div className="salary-history-heading"><div><h3>Histórico salarial</h3><p className="helper">Alterações registradas para este colaborador.</p></div><span>{data.salaries.length} registro(s)</span></div><div className="compact-list salary-history">{data.salaries.map((s:any)=><div key={s.id}><b>{brl(s.salary_cents)}</b><span>{s.effective_date} · {s.reason||"Sem observação"}</span></div>)}</div>
  </div>;

  return <div className="hr-pane vacation-pane"><div className="vacation-heading"><div><h3>Gestão de férias</h3><p className="helper">Apuração orientada pelos arts. 130, 133, 134, 143 e 145 da CLT.</p></div><span className="legal-badge">Cálculo assistido</span></div>{alerts.length>0&&<div className="vacation-alert"><b>⚠ Férias exigem programação</b><span>Há período vencido ou a até quatro meses do fim do período concessivo.</span></div>}
    <section className="vacation-step"><div className="vacation-step-title"><span>1</span><div><b>Período aquisitivo</b><small>O ciclo padrão corresponde a 12 meses de vigência do contrato.</small></div></div><div className="form-grid">
      <label>Início do período aquisitivo<input type="date" value={vac.accrualStart} onChange={e=>updateVacation({accrualStart:e.target.value,paymentDate:""})}/><small className="field-help">Sugerido pela admissão ou pelo período anterior.</small></label>
      <label>Fim do período aquisitivo<input type="date" value={vac.accrualEnd} readOnly/><small className="field-help">Calculado: 12 meses menos um dia.</small></label>
      <label>Limite do período concessivo<input type="date" value={vac.concessionDeadline} readOnly/><small className="field-help">As férias devem terminar até esta data.</small></label>
    </div></section>
    <section className="vacation-step"><div className="vacation-step-title"><span>2</span><div><b>Apuração do direito</b><small>Informe faltas injustificadas e situações que podem iniciar um novo período.</small></div></div><div className="form-grid">
      <label>Faltas injustificadas no período<input type="number" min="0" max="365" value={vac.unjustifiedAbsences} onChange={e=>updateVacation({unjustifiedAbsences:e.target.value})}/><small className="field-help">0–5: 30 dias; 6–14: 24; 15–23: 18; 24–32: 12; acima de 32: sem direito.</small></label>
      <label className="wide">Ocorrência que causa perda do direito<select value={vac.lossReason} onChange={e=>updateVacation({lossReason:e.target.value})}><option value="">Nenhuma ocorrência informada</option><option value="Saída e readmissão após mais de 60 dias">Saída e readmissão após mais de 60 dias</option><option value="Licença remunerada superior a 30 dias">Licença remunerada superior a 30 dias</option><option value="Paralisação com salário superior a 30 dias">Paralisação com salário superior a 30 dias</option><option value="Benefício previdenciário superior a 6 meses">Benefício previdenciário superior a 6 meses</option></select><small className="field-help">Nessas hipóteses, confira a data de retorno que inicia novo período aquisitivo.</small></label>
    </div><div className={`vacation-entitlement ${vac.days?"positive":"zero"}`}><span>Dias de direito calculados</span><strong>{vac.days}</strong><small>{vac.days?"Antes de eventual abono pecuniário":"Período sem dias de férias; confira faltas e afastamentos"}</small></div></section>
    <section className="vacation-step"><div className="vacation-step-title"><span>3</span><div><b>Programação e pagamento</b><small>Defina o gozo, o abono e a situação do registro.</small></div></div><div className="form-grid">
      <label>Início programado<input type="date" value={vac.scheduledStart} min={vac.accrualEnd?addDays(vac.accrualEnd,1):undefined} max={vac.concessionDeadline||undefined} onChange={e=>updateVacation({scheduledStart:e.target.value,paymentDate:e.target.value?addDays(e.target.value,-2):""})}/><small className="field-help">Não iniciar nos 2 dias anteriores a feriado ou repouso semanal.</small></label>
      <label>Fim programado<input type="date" value={vac.scheduledEnd} readOnly/><small className="field-help">Calculado por {daysToTake} dia(s) de gozo.</small></label>
      <label>Data limite do pagamento<input type="date" value={vac.paymentDate} onChange={e=>setVac({...vac,paymentDate:e.target.value})}/><small className="field-help">Até 2 dias antes do início das férias.</small></label>
      <label className="vacation-check"><input type="checkbox" checked={vac.sellAllowance} disabled={!vac.days} onChange={e=>updateVacation({sellAllowance:e.target.checked})}/><span>Converter 1/3 em abono pecuniário <small>{maxAllowance} dia(s) vendidos e {vac.days-maxAllowance} dia(s) de gozo</small></span></label>
      <label>Status<select value={vac.status} onChange={e=>setVac({...vac,status:e.target.value})}><option value="pending">Pendente</option><option value="scheduled">Programada</option><option value="taken">Gozada</option><option value="paid">Quitada</option></select></label>
      <label className="wide">Observações e conferências<textarea value={vac.notes} onChange={e=>setVac({...vac,notes:e.target.value})} placeholder="Ex.: aviso entregue, opção de abono no prazo, afastamentos conferidos…"/></label>
    </div></section>
    <div className="legal-notice">O cálculo apoia o cadastro, mas afastamentos, férias coletivas, fracionamento, trabalho parcial e regras coletivas devem ser conferidos pelo responsável trabalhista.</div>
    <button type="button" className="primary" disabled={!vac.accrualStart||!vac.days} onClick={()=>save({action:"saveVacation",contractId,...vac,notes:vacationNotes})}>Registrar período de férias</button>{msg&&<div className="inline-notice">{msg}</div>}
    <h3>Períodos registrados</h3><div className="compact-list vacation-list">{data.vacations.map((v:any)=><div key={v.id}><b>{v.accrual_start} a {v.accrual_end}</b><span>{v.days} dias · limite {v.concession_deadline} · {statusLabel[v.status]||v.status}</span></div>)}</div>
  </div>;
}
