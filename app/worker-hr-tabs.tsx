"use client";
import { useEffect, useState } from "react";
import "./hr.css";
const brl=(c:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((c||0)/100);
export default function WorkerHrTabs({contractId,kind}:{contractId:number;kind:"salary"|"vacation"}) {
  const [data,setData]=useState<any>({profile:null,salaries:[],vacations:[]}),[msg,setMsg]=useState("");
  const [salary,setSalary]=useState<any>({linkCode:"101",linkDescription:"Empregado geral",contractTerm:"indefinite",salaryType:"monthly",baseSalary:"",dailyRate:"",advanceRate:40,effectiveDate:new Date().toISOString().slice(0,10),reason:""});
  const [vac,setVac]=useState<any>({accrualStart:"",accrualEnd:"",concessionDeadline:"",scheduledStart:"",scheduledEnd:"",days:30,soldDays:0,paymentDate:"",status:"pending",notes:""});
  const load=()=>fetch(`/api/hr?contractId=${contractId}`).then(r=>r.json()).then(b=>{setData(b);if(b.profile)setSalary((s:any)=>({...s,linkCode:b.profile.employment_link_code||"",linkDescription:b.profile.employment_link_description||"",contractTerm:b.profile.contract_term,salaryType:b.profile.salary_type,baseSalary:(b.profile.base_salary_cents/100).toFixed(2),dailyRate:(b.profile.daily_rate_cents/100).toFixed(2),advanceRate:b.profile.advance_rate_basis_points/100}))});
  useEffect(()=>{void load()},[contractId]);
  const save=async(body:any)=>{const r=await fetch("/api/hr",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),b=await r.json();setMsg(b.error||b.message);if(r.ok)load()};
  const alerts=(data.vacations||[]).filter((v:any)=>v.status!=="paid" && new Date(v.concession_deadline).getTime()-Date.now()<=122*86400000);
  if(kind==="salary") return <div className="hr-pane">
    <h3>Salário e vínculo</h3><p className="helper">Parâmetros usados na folha. Mensalista gera adiantamento de 40% na quinzena; apontamento diário usa 1/30 do salário, com valor flexível.</p>
    <div className="form-grid">
      <label>Código do vínculo (padrão IOB)<input value={salary.linkCode} onChange={e=>setSalary({...salary,linkCode:e.target.value})}/></label>
      <label className="wide">Descrição do vínculo<input value={salary.linkDescription} onChange={e=>setSalary({...salary,linkDescription:e.target.value})}/></label>
      <label>Tipo de contrato<select value={salary.contractTerm} onChange={e=>setSalary({...salary,contractTerm:e.target.value})}><option value="determined">Prazo determinado</option><option value="indefinite">Prazo indeterminado</option></select></label>
      <label>Tipo de salário<select value={salary.salaryType} onChange={e=>setSalary({...salary,salaryType:e.target.value})}><option value="monthly">Mensalista</option><option value="daily">Apontamento diário</option></select></label>
      <label>Salário-base (R$)<input type="number" step=".01" value={salary.baseSalary} onChange={e=>setSalary({...salary,baseSalary:e.target.value,dailyRate:salary.dailyRate||(+e.target.value/30).toFixed(2)})}/></label>
      <label>Valor da diária (R$)<input type="number" step=".01" value={salary.dailyRate} onChange={e=>setSalary({...salary,dailyRate:e.target.value})}/></label>
      <label>Adiantamento quinzenal (%)<input type="number" value={salary.advanceRate} onChange={e=>setSalary({...salary,advanceRate:e.target.value})}/></label>
      <label>Data de vigência<input type="date" value={salary.effectiveDate} onChange={e=>setSalary({...salary,effectiveDate:e.target.value})}/></label>
      <label className="wide">Motivo/observação<input value={salary.reason} onChange={e=>setSalary({...salary,reason:e.target.value})}/></label>
    </div><button type="button" className="primary" onClick={()=>save({action:"saveProfile",contractId,...salary})}>Salvar salário</button>{msg&&<div className="inline-notice">{msg}</div>}
    <h3>Histórico salarial</h3><div className="compact-list">{data.salaries.map((s:any)=><div key={s.id}><b>{brl(s.salary_cents)}</b><span>{s.effective_date} · {s.reason||"Sem observação"}</span></div>)}</div>
  </div>;
  return <div className="hr-pane"><h3>Gestão de férias</h3>{alerts.length>0&&<div className="vacation-alert"><b>⚠ Férias exigem programação</b><span>Há período vencido ou a até quatro meses da dobra. O lembrete permanecerá até a quitação.</span></div>}
    <div className="form-grid"><label>Início aquisitivo<input type="date" value={vac.accrualStart} onChange={e=>setVac({...vac,accrualStart:e.target.value})}/></label><label>Fim aquisitivo<input type="date" value={vac.accrualEnd} onChange={e=>setVac({...vac,accrualEnd:e.target.value})}/></label><label>Prazo concessivo<input type="date" value={vac.concessionDeadline} onChange={e=>setVac({...vac,concessionDeadline:e.target.value})}/></label><label>Início programado<input type="date" value={vac.scheduledStart} onChange={e=>setVac({...vac,scheduledStart:e.target.value})}/></label><label>Fim programado<input type="date" value={vac.scheduledEnd} onChange={e=>setVac({...vac,scheduledEnd:e.target.value})}/></label><label>Dias de férias<input type="number" value={vac.days} onChange={e=>setVac({...vac,days:e.target.value})}/></label><label>Dias vendidos<input type="number" value={vac.soldDays} onChange={e=>setVac({...vac,soldDays:e.target.value})}/></label><label>Data do pagamento<input type="date" value={vac.paymentDate} onChange={e=>setVac({...vac,paymentDate:e.target.value})}/></label><label>Status<select value={vac.status} onChange={e=>setVac({...vac,status:e.target.value})}><option value="pending">Pendente</option><option value="scheduled">Programada</option><option value="taken">Gozada</option><option value="paid">Quitada</option></select></label><label className="wide">Observações<textarea value={vac.notes} onChange={e=>setVac({...vac,notes:e.target.value})}/></label></div>
    <button type="button" className="primary" onClick={()=>save({action:"saveVacation",contractId,...vac})}>Registrar férias</button>{msg&&<div className="inline-notice">{msg}</div>}<div className="compact-list">{data.vacations.map((v:any)=><div key={v.id}><b>{v.accrual_start} a {v.accrual_end}</b><span>Prazo: {v.concession_deadline} · {v.status}</span></div>)}</div></div>;
}
