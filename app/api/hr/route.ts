import { ensureDatabase, getRuntimeDatabase } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import type { CloudUser } from "../../auth-cloud";
import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";

const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const money = (v: unknown) =>
  Math.max(0, Math.round(Number(String(v ?? 0).replace(",", ".")) * 100));
const validDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const vacationEntitlement = (absences: number, lossReason: unknown) => {
  if (String(lossReason || "").trim()) return 0;
  if (absences <= 5) return 30;
  if (absences <= 14) return 24;
  if (absences <= 23) return 18;
  if (absences <= 32) return 12;
  return 0;
};

export async function GET(r: Request) {
  const access = await authorizeCloud(r, "Cadastros");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudHrGet(r, access.user);
  try {
    await ensureDatabase();
    const db = getRuntimeDatabase(), t = tenant(r), url = new URL(r.url);
    const contractId = Number(url.searchParams.get("contractId") || 0);
    if (contractId) {
      const [profile, salaries, vacations, contract] = await Promise.all([
        db.prepare("SELECT * FROM worker_payroll_profiles WHERE tenant_id=? AND contract_id=?").bind(t, contractId).first(),
        db.prepare("SELECT * FROM salary_history WHERE tenant_id=? AND contract_id=? ORDER BY effective_date DESC,id DESC").bind(t, contractId).all(),
        db.prepare("SELECT * FROM vacation_periods WHERE tenant_id=? AND contract_id=? ORDER BY accrual_start DESC,id DESC").bind(t, contractId).all(),
        db.prepare("SELECT id,admission_date,status FROM employment_contracts WHERE tenant_id=? AND id=?").bind(t, contractId).first(),
      ]);
      return Response.json({ profile, salaries: salaries.results, vacations: vacations.results, contract });
    }
    const [functions, links, centers, references, items, issues, workers] = await Promise.all([
      db.prepare("SELECT f.*,(SELECT COUNT(*) FROM employment_contracts c WHERE c.tenant_id=f.tenant_id AND c.role=COALESCE(NULLIF(f.local_description,''),f.official_description)) usage_count FROM job_functions f WHERE tenant_id=? ORDER BY official_description").bind(t).all(),
      db.prepare("SELECT l.*,(SELECT COUNT(*) FROM employment_contracts c WHERE c.tenant_id=l.tenant_id AND c.employment_link_code=l.code) usage_count FROM employment_links l WHERE tenant_id=? ORDER BY code").bind(t).all(),
      db.prepare("SELECT c.*,(SELECT COUNT(*) FROM services s WHERE s.tenant_id=c.tenant_id AND s.group_source_id=c.id) usage_count FROM cost_centers c WHERE tenant_id=? ORDER BY description").bind(t).all(),
      db.prepare("SELECT * FROM salary_references WHERE tenant_id=? ORDER BY effective_date DESC,id DESC").bind(t).all(),
      db.prepare("SELECT s.*,(SELECT COUNT(*) FROM item_issues i WHERE i.item_id=s.id) usage_count FROM safety_items s WHERE tenant_id=? ORDER BY item_type,description").bind(t).all(),
      db.prepare("SELECT i.*,s.description item_description,p.name worker_name FROM item_issues i JOIN safety_items s ON s.id=i.item_id JOIN employment_contracts c ON c.id=i.contract_id JOIN people p ON p.id=c.person_id WHERE i.tenant_id=? ORDER BY i.issue_date DESC,i.id DESC").bind(t).all(),
      db.prepare("SELECT c.id,c.registration_number,p.name,c.role FROM employment_contracts c JOIN people p ON p.id=c.person_id WHERE c.tenant_id=? AND c.status='active' ORDER BY p.name").bind(t).all(),
    ]);
    return Response.json({ functions:functions.results, links:links.results, centers:centers.results, references:references.results, items:items.results, issues:issues.results, workers:workers.results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao consultar cadastros." }, { status: 500 });
  }
}

export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Cadastros");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudHrPost(r, access.user);
  try {
    await ensureDatabase();
    const db = getRuntimeDatabase(), t = tenant(r), b = await r.json() as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "saveProfile") {
      const contractId=Number(b.contractId), salary=money(b.baseSalary), daily=Math.round(salary/30);
      if (!contractId || !salary) return Response.json({error:"Informe o salário-base."},{status:400});
      const current=await db.prepare("SELECT base_salary_cents FROM worker_payroll_profiles WHERE tenant_id=? AND contract_id=?").bind(t,contractId).first<{base_salary_cents:number}>();
      if(current&&salary<current.base_salary_cents)return Response.json({error:"O novo salário não pode ser inferior ao salário atual."},{status:409});
      await db.prepare(`INSERT INTO worker_payroll_profiles (tenant_id,contract_id,employment_link_code,employment_link_description,contract_term,salary_type,base_salary_cents,daily_rate_cents,advance_rate_basis_points,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,contract_id) DO UPDATE SET salary_type=excluded.salary_type,base_salary_cents=excluded.base_salary_cents,daily_rate_cents=excluded.daily_rate_cents,advance_rate_basis_points=excluded.advance_rate_basis_points,updated_at=CURRENT_TIMESTAMP`)
        .bind(t,contractId,"","", "indefinite",b.salaryType==="daily"?"daily":"monthly",salary,daily,Math.round(Number(b.advanceRate||40)*100)).run();
      await db.prepare("UPDATE employment_contracts SET payment_type=? WHERE tenant_id=? AND id=?").bind(b.salaryType==="monthly"?"monthly":"production",t,contractId).run();
      if ((!current||salary!==current.base_salary_cents)&&validDate(b.effectiveDate)) await db.prepare("INSERT INTO salary_history (tenant_id,contract_id,effective_date,salary_cents,reason,source) VALUES (?,?,?,?,?,'individual')").bind(t,contractId,b.effectiveDate,salary,String(b.reason||"Cadastro/alteração salarial")).run();
      return Response.json({ok:true,message:current&&salary===current.base_salary_cents?"Configuração atualizada sem criar nova alteração salarial.":"Alteração salarial registrada com sucesso."});
    } else if(action==="updateSalaryHistory"){
      const id=Number(b.id),contractId=Number(b.contractId),salary=money(b.baseSalary);
      if(!id||!contractId||!salary||!validDate(b.effectiveDate))return Response.json({error:"Informe valor e vigência válidos."},{status:400});
      const previous=await db.prepare("SELECT salary_cents FROM salary_history WHERE tenant_id=? AND contract_id=? AND id<>? AND (effective_date<? OR (effective_date=? AND id<?)) ORDER BY effective_date DESC,id DESC LIMIT 1").bind(t,contractId,id,b.effectiveDate,b.effectiveDate,id).first<{salary_cents:number}>();
      const next=await db.prepare("SELECT salary_cents FROM salary_history WHERE tenant_id=? AND contract_id=? AND id<>? AND (effective_date>? OR (effective_date=? AND id>?)) ORDER BY effective_date,id LIMIT 1").bind(t,contractId,id,b.effectiveDate,b.effectiveDate,id).first<{salary_cents:number}>();
      if((previous&&salary<previous.salary_cents)||(next&&salary>next.salary_cents))return Response.json({error:"A edição deve manter a evolução salarial sem redução entre as vigências."},{status:409});
      await db.prepare("UPDATE salary_history SET effective_date=?,salary_cents=?,reason=? WHERE tenant_id=? AND contract_id=? AND id=?").bind(b.effectiveDate,salary,String(b.reason||"Alteração salarial"),t,contractId,id).run();
      const latest=await db.prepare("SELECT salary_cents FROM salary_history WHERE tenant_id=? AND contract_id=? ORDER BY effective_date DESC,id DESC LIMIT 1").bind(t,contractId).first<{salary_cents:number}>();
      if(latest)await db.prepare("UPDATE worker_payroll_profiles SET base_salary_cents=?,daily_rate_cents=ROUND(?/30.0),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND contract_id=?").bind(latest.salary_cents,latest.salary_cents,t,contractId).run();
      return Response.json({ok:true,message:"Registro salarial atualizado."});
    } else if(action==="deleteSalaryHistory"){
      const id=Number(b.id),contractId=Number(b.contractId);
      const count=await db.prepare("SELECT COUNT(*) total FROM salary_history WHERE tenant_id=? AND contract_id=?").bind(t,contractId).first<{total:number}>();
      if(!id||!contractId)return Response.json({error:"Registro salarial inválido."},{status:400});
      if(Number(count?.total||0)<=1)return Response.json({error:"Não é possível excluir o único registro salarial do colaborador."},{status:409});
      await db.prepare("DELETE FROM salary_history WHERE tenant_id=? AND contract_id=? AND id=?").bind(t,contractId,id).run();
      const latest=await db.prepare("SELECT salary_cents FROM salary_history WHERE tenant_id=? AND contract_id=? ORDER BY effective_date DESC,id DESC LIMIT 1").bind(t,contractId).first<{salary_cents:number}>();
      if(latest)await db.prepare("UPDATE worker_payroll_profiles SET base_salary_cents=?,daily_rate_cents=ROUND(?/30.0),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND contract_id=?").bind(latest.salary_cents,latest.salary_cents,t,contractId).run();
      return Response.json({ok:true,message:"Registro salarial excluído."});
    } else if (action === "saveVacation") {
      if (![b.accrualStart,b.accrualEnd,b.concessionDeadline].every(validDate)) return Response.json({error:"Informe o período aquisitivo e o prazo concessivo."},{status:400});
      const absences=Math.max(0,Number(b.unjustifiedAbsences)||0),days=vacationEntitlement(absences,b.lossReason);
      if (!days) return Response.json({error:"O período está sem direito a férias pelas faltas ou ocorrência informada. Registre a data de retorno como início de um novo período aquisitivo."},{status:400});
      const soldDays=Math.min(Math.floor(days/3),Math.max(0,Number(b.soldDays)||0));
      await db.prepare("INSERT INTO vacation_periods (tenant_id,contract_id,accrual_start,accrual_end,concession_deadline,scheduled_start,scheduled_end,days,sold_days,payment_date,status,notes,settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(t,Number(b.contractId),b.accrualStart,b.accrualEnd,b.concessionDeadline,b.scheduledStart||null,b.scheduledEnd||null,days,soldDays,b.paymentDate||null,String(b.status||"pending"),String(b.notes||""),b.status==="paid"?new Date().toISOString():null).run();
    } else if (action === "saveFunction") {
      if (!String(b.cboCode||"").trim() || !String(b.officialDescription||"").trim()) return Response.json({error:"Informe o CBO e a descrição oficial."},{status:400});
      if (b.id) await db.prepare("UPDATE job_functions SET cbo_code=?,official_description=?,local_description=?,active=? WHERE tenant_id=? AND id=?").bind(b.cboCode,b.officialDescription,b.localDescription||null,b.active!==false,t,Number(b.id)).run();
      else await db.prepare("INSERT INTO job_functions (tenant_id,cbo_code,official_description,local_description) VALUES (?,?,?,?)").bind(t,b.cboCode,b.officialDescription,b.localDescription||null).run();
    } else if (action === "saveLink") {
      const code=String(b.code||"").trim(), description=String(b.description||"").trim();
      if (!code || !description) return Response.json({error:"Informe o código e a descrição do vínculo."},{status:400});
      if (b.id) await db.prepare("UPDATE employment_links SET code=?,description=?,active=? WHERE tenant_id=? AND id=?").bind(code,description,b.active!==false,t,Number(b.id)).run();
      else await db.prepare("INSERT INTO employment_links (tenant_id,code,description) VALUES (?,?,?)").bind(t,code,description).run();
    } else if (action === "saveCenter") {
      if (!String(b.description||"").trim()) return Response.json({error:"Informe a descrição."},{status:400});
      if (b.id) await db.prepare("UPDATE cost_centers SET description=?,active=? WHERE tenant_id=? AND id=?").bind(b.description,b.active!==false,t,Number(b.id)).run();
      else await db.prepare("INSERT INTO cost_centers (tenant_id,description) VALUES (?,?)").bind(t,b.description).run();
    } else if (action === "saveReference") {
      if (!validDate(b.effectiveDate)||!money(b.value)) return Response.json({error:"Informe data e valor."},{status:400});
      await db.prepare("INSERT INTO salary_references (tenant_id,reference_type,effective_date,value_cents,notes) VALUES (?,?,?,?,?)").bind(t,b.referenceType==="category"?"category":"national",b.effectiveDate,money(b.value),String(b.notes||"")).run();
    } else if (action === "saveItem") {
      if (!String(b.description||"").trim()) return Response.json({error:"Informe a descrição."},{status:400});
      if (b.id) await db.prepare("UPDATE safety_items SET description=?,supplier=?,ca=?,active=? WHERE tenant_id=? AND id=?").bind(b.description,b.supplier||null,b.ca||null,b.active!==false,t,Number(b.id)).run();
      else await db.prepare("INSERT INTO safety_items (tenant_id,item_type,description,supplier,ca) VALUES (?,?,?,?,?)").bind(t,b.itemType==="tool"?"tool":"epi",b.description,b.supplier||null,b.ca||null).run();
    } else if (action === "issueItem") {
      if (!b.itemId||!b.contractId||!validDate(b.issueDate)) return Response.json({error:"Selecione item, colaborador e data."},{status:400});
      await db.prepare("INSERT INTO item_issues (tenant_id,item_id,contract_id,issue_date,quantity,return_due_date,condition_notes,employee_acknowledged) VALUES (?,?,?,?,?,?,?,?)").bind(t,Number(b.itemId),Number(b.contractId),b.issueDate,String(b.quantity||"1"),b.returnDueDate||null,String(b.notes||""),!!b.acknowledged).run();
    } else if (action === "issueItems") {
      const itemIds=Array.isArray(b.itemIds)?b.itemIds.map(Number).filter(Boolean):[],contractIds=Array.isArray(b.contractIds)?b.contractIds.map(Number).filter(Boolean):[];
      if (!itemIds.length||!contractIds.length||!validDate(b.issueDate)) return Response.json({error:"Selecione ao menos um item, um colaborador e a data."},{status:400});
      const activeWorkers=await db.prepare(`SELECT id FROM employment_contracts WHERE tenant_id=? AND status='active' AND id IN (${contractIds.map(()=>"?").join(",")})`).bind(t,...contractIds).all<{id:number}>(),validWorkers=new Set(activeWorkers.results.map(row=>Number(row.id)));
      const validItems=await db.prepare(`SELECT id FROM safety_items WHERE tenant_id=? AND active=1 AND id IN (${itemIds.map(()=>"?").join(",")})`).bind(t,...itemIds).all<{id:number}>(),allowedItems=new Set(validItems.results.map(row=>Number(row.id)));
      const statements=[];for(const contractId of contractIds)for(const itemId of itemIds)if(validWorkers.has(contractId)&&allowedItems.has(itemId))statements.push(db.prepare("INSERT INTO item_issues (tenant_id,item_id,contract_id,issue_date,quantity,return_due_date,condition_notes,employee_acknowledged) VALUES (?,?,?,?,?,?,?,?)").bind(t,itemId,contractId,b.issueDate,String(b.quantity||"1"),b.returnDueDate||null,String(b.notes||""),!!b.acknowledged));
      if(!statements.length)return Response.json({error:"Nenhum fornecimento válido foi selecionado."},{status:400});
      await db.batch(statements);return Response.json({ok:true,message:`${statements.length} fornecimento(s) registrado(s) com sucesso.`,affected:statements.length});
    } else if (action === "applyAdjustment") {
      if (!validDate(b.effectiveDate) || !Number(b.value)) return Response.json({error:"Informe a data e o valor do reajuste."},{status:400});
      const ids=Array.isArray(b.functionIds)?b.functionIds.map(Number).filter(Boolean):[];
      const filters=ids.length?` AND f.id IN (${ids.map(()=>"?").join(",")})`:"";
      const rows=await db.prepare(`SELECT p.contract_id,p.base_salary_cents FROM worker_payroll_profiles p JOIN employment_contracts c ON c.id=p.contract_id LEFT JOIN job_functions f ON f.tenant_id=c.tenant_id AND c.role=COALESCE(NULLIF(f.local_description,''),f.official_description) WHERE p.tenant_id=? AND c.status='active'${filters}`).bind(t,...ids).all<{contract_id:number;base_salary_cents:number}>();
      if (!rows.results.length) return Response.json({error:"Nenhum colaborador ativo com salário cadastrado atende ao filtro."},{status:409});
      const batch=await db.prepare("INSERT INTO salary_adjustment_batches (tenant_id,effective_date,mode,value,reason,function_ids_json,status) VALUES (?,?,?,?,?,?,'applied') RETURNING id").bind(t,b.effectiveDate,b.mode==="percentage"?"percentage":"value",b.mode==="percentage"?Math.round(Number(b.value)*100):money(b.value),String(b.reason||""),JSON.stringify(ids)).first<{id:number}>();
      const statements=[]; for(const row of rows.results){const next=b.mode==="percentage"?Math.round(row.base_salary_cents*(1+Number(b.value)/100)):money(b.value);statements.push(db.prepare("INSERT INTO salary_history (tenant_id,contract_id,effective_date,salary_cents,reason,source,adjustment_batch_id) VALUES (?,?,?,?,?,'batch',?)").bind(t,row.contract_id,b.effectiveDate,next,String(b.reason||"Reajuste salarial"),batch!.id));if(b.updateProfiles!==false)statements.push(db.prepare("UPDATE worker_payroll_profiles SET base_salary_cents=?,daily_rate_cents=ROUND(?/30.0),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND contract_id=?").bind(next,next,t,row.contract_id));}
      await db.batch(statements); return Response.json({ok:true,message:`Reajuste aplicado a ${rows.results.length} colaborador(es).`,affected:rows.results.length,batchId:batch!.id});
    } else if (action === "undoAdjustment") {
      if (!validDate(b.effectiveDate)) return Response.json({error:"Informe a data do reajuste."},{status:400});
      const batches=await db.prepare("SELECT id FROM salary_adjustment_batches WHERE tenant_id=? AND effective_date=? AND status='applied'").bind(t,b.effectiveDate).all<{id:number}>();
      if(!batches.results.length)return Response.json({error:"Nenhum reajuste aplicado nessa data."},{status:404});
      for(const x of batches.results){const histories=await db.prepare("SELECT DISTINCT contract_id FROM salary_history WHERE tenant_id=? AND adjustment_batch_id=?").bind(t,x.id).all<{contract_id:number}>();await db.prepare("DELETE FROM salary_history WHERE tenant_id=? AND adjustment_batch_id=?").bind(t,x.id).run();for(const h of histories.results){const prev=await db.prepare("SELECT salary_cents FROM salary_history WHERE tenant_id=? AND contract_id=? ORDER BY effective_date DESC,id DESC LIMIT 1").bind(t,h.contract_id).first<{salary_cents:number}>();if(prev)await db.prepare("UPDATE worker_payroll_profiles SET base_salary_cents=?,daily_rate_cents=ROUND(?/30.0),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND contract_id=?").bind(prev.salary_cents,prev.salary_cents,t,h.contract_id).run();}await db.prepare("UPDATE salary_adjustment_batches SET status='undone' WHERE tenant_id=? AND id=?").bind(t,x.id).run();}
      return Response.json({ok:true,message:`${batches.results.length} reajuste(s) desfeito(s).`});
    } else if (action === "delete") {
      const table = {function:"job_functions",link:"employment_links",center:"cost_centers",item:"safety_items",reference:"salary_references"}[String(b.entity)];
      if (!table) return Response.json({error:"Cadastro inválido."},{status:400});
      const usage = table==="job_functions" ? await db.prepare("SELECT 1 FROM employment_contracts c JOIN job_functions f ON f.tenant_id=c.tenant_id AND c.role=COALESCE(NULLIF(f.local_description,''),f.official_description) WHERE f.tenant_id=? AND f.id=? LIMIT 1").bind(t,Number(b.id)).first()
        : table==="employment_links" ? await db.prepare("SELECT 1 FROM employment_contracts c JOIN employment_links l ON l.tenant_id=c.tenant_id AND c.employment_link_code=l.code WHERE l.tenant_id=? AND l.id=? LIMIT 1").bind(t,Number(b.id)).first()
        : table==="cost_centers" ? await db.prepare("SELECT 1 FROM services WHERE tenant_id=? AND group_source_id=? LIMIT 1").bind(t,Number(b.id)).first()
        : table==="safety_items" ? await db.prepare("SELECT 1 FROM item_issues WHERE tenant_id=? AND item_id=? LIMIT 1").bind(t,Number(b.id)).first() : null;
      if (usage) return Response.json({error:table==="employment_links"?"O vínculo faz parte do cadastro de colaborador e não pode ser excluído.":"O registro possui vínculos e não pode ser excluído."},{status:409});
      await db.prepare(`DELETE FROM ${table} WHERE tenant_id=? AND id=?`).bind(t,Number(b.id)).run();
    } else return Response.json({error:"Ação inválida."},{status:400});
    return Response.json({ok:true,message:"Registro salvo com sucesso."});
  } catch (e) {
    return Response.json({error:e instanceof Error?e.message:"Falha ao salvar."},{status:500});
  }
}

type CloudRow = Record<string, any>;

const allowedCompanyFilter = (user: CloudUser | null) =>
  user?.companyIds == null
    ? ""
    : `&companies.legacy_id=in.(${user.companyIds.join(",") || "0"})`;

async function cloudHrGet(request: Request, user: CloudUser | null) {
  const config = getSupabaseConfig()!;
  try {
    const url = new URL(request.url);
    const contractId = String(url.searchParams.get("contractId") || "");
    if (contractId) {
      const contracts = await supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/employment_contracts?select=id,admission_date,status,companies!inner(legacy_id)&id=eq.${contractId}&organization_id=eq.${config.organizationId}${allowedCompanyFilter(user)}&limit=1`,
      );
      if (!contracts.length)
        return Response.json(
          { error: "Colaborador não encontrado ou sem acesso." },
          { status: 404 },
        );
      const [profiles, salaries, vacations] = await Promise.all([
        supabaseAdmin.get<CloudRow[]>(
          `/rest/v1/worker_payroll_profiles?select=*&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}&limit=1`,
        ),
        supabaseAdmin.get<CloudRow[]>(
          `/rest/v1/salary_history?select=*&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}&order=effective_date.desc,created_at.desc`,
        ),
        supabaseAdmin.get<CloudRow[]>(
          `/rest/v1/vacation_periods?select=*&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}&order=accrual_start.desc,created_at.desc`,
        ),
      ]);
      return Response.json({
        profile: profiles[0] || null,
        salaries,
        vacations,
        contract: contracts[0] || null,
        dataSource: "supabase",
      });
    }

    const [functions, links, contracts, references, centers, services, items, issues] =
      await Promise.all([
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/job_functions?select=*&organization_id=eq.${config.organizationId}&order=official_description.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/employment_links?select=*&organization_id=eq.${config.organizationId}&order=code.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/employment_contracts?select=id,registration_number,role_name,employment_link_code,status,people(full_name),companies!inner(legacy_id)&organization_id=eq.${config.organizationId}${allowedCompanyFilter(user)}&order=created_at.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/salary_references?select=*&organization_id=eq.${config.organizationId}&order=effective_date.desc,created_at.desc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/cost_centers?select=*&organization_id=eq.${config.organizationId}&order=description.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/services?select=group_legacy_id&organization_id=eq.${config.organizationId}&group_legacy_id=not.is.null`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/safety_items?select=*&organization_id=eq.${config.organizationId}&order=item_type.asc,description.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/item_issues?select=*&organization_id=eq.${config.organizationId}&order=issue_date.desc,created_at.desc`,
      ),
    ]);
    const usage = new Map<string, number>();
    for (const contract of contracts) {
      const role = String(contract.role_name || "").trim();
      if (role) usage.set(role, (usage.get(role) || 0) + 1);
    }
    return Response.json({
      functions: functions.map((row) => ({
        ...row,
        usage_count:
          usage.get(
            String(row.local_description || row.official_description),
          ) || 0,
      })),
      links: links.map((row) => ({
        ...row,
        usage_count: contracts.filter((contract) => contract.employment_link_code === row.code).length,
      })),
      centers: centers.map((row) => ({
        ...row,
        cloud_id: row.id,
        id: Number(row.legacy_id),
        usage_count: services.filter(
          (service) =>
            Number(service.group_legacy_id) === Number(row.legacy_id),
        ).length,
      })),
      references,
      items: items.map((row) => ({
        ...row,
        usage_count: issues.filter((issue) => issue.item_id === row.id).length,
      })),
      issues: issues
        .filter((issue) =>
          contracts.some((contract) => contract.id === issue.contract_id),
        )
        .map((issue) => {
          const item = items.find((row) => row.id === issue.item_id);
          const contract = contracts.find(
            (row) => row.id === issue.contract_id,
          );
          return {
            ...issue,
            item_description: item?.description,
            worker_name: contract?.people?.full_name,
          };
        }),
      workers: contracts
        .filter((row) => row.status === "active")
        .map((row) => ({
          id: row.id,
          registration_number: row.registration_number,
          name: row.people?.full_name,
          role: row.role_name,
        })),
      dataSource: "supabase",
      conversionScope: "functions,salaries,adjustments,vacations",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar Funções no Supabase.",
      },
      { status: 500 },
    );
  }
}

async function cloudHrPost(request: Request, user: CloudUser | null) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "issueItems") {
      const itemIds=Array.isArray(body.itemIds)?body.itemIds.map(String).filter(Boolean):[],contractIds=Array.isArray(body.contractIds)?body.contractIds.map(String).filter(Boolean):[];
      if(!itemIds.length||!contractIds.length||!validDate(body.issueDate))return Response.json({error:"Selecione ao menos um item, um colaborador e a data."},{status:400});
      const contractFilter=contractIds.join(","),itemFilter=itemIds.join(",");
      const contracts=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/employment_contracts?select=id,companies!inner(legacy_id)&organization_id=eq.${config.organizationId}&status=eq.active&id=in.(${contractFilter})${allowedCompanyFilter(user)}`),items=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/safety_items?select=id&organization_id=eq.${config.organizationId}&active=eq.true&id=in.(${itemFilter})`);
      const rows=contracts.flatMap(contract=>items.map(item=>({organization_id:config.organizationId,item_id:item.id,contract_id:contract.id,issue_date:body.issueDate,quantity:String(body.quantity||"1"),return_due_date:body.returnDueDate||null,condition_notes:String(body.notes||""),employee_acknowledged:Boolean(body.acknowledged)})));
      if(!rows.length)return Response.json({error:"Nenhum fornecimento válido foi selecionado."},{status:400});
      await supabaseAdmin.post("/rest/v1/item_issues",rows,{prefer:"return=minimal"});
      return Response.json({ok:true,message:`${rows.length} fornecimento(s) registrado(s) com sucesso.`,affected:rows.length});
    }
    if (action === "saveFunction") {
      const cboCode = String(body.cboCode || "").replace(/\D/g, "");
      const officialDescription = String(
        body.officialDescription || "",
      ).trim();
      if (!cboCode || !officialDescription)
        return Response.json(
          { error: "Informe o CBO e a descrição oficial." },
          { status: 400 },
        );
      const values = {
        organization_id: config.organizationId,
        cbo_code: cboCode,
        official_description: officialDescription,
        local_description:
          String(body.localDescription || "").trim() || null,
        active: body.active !== false,
      };
      let savedRows: CloudRow[];
      if (body.id)
        savedRows = await supabaseAdmin.patch<CloudRow[]>(
          `/rest/v1/job_functions?id=eq.${body.id}&organization_id=eq.${config.organizationId}`,
          values,
          { prefer: "return=representation" },
        );
      else
        savedRows = await supabaseAdmin.post<CloudRow[]>(
          "/rest/v1/job_functions",
          values,
          { prefer: "return=representation" },
        );
      if (!savedRows?.length)
        return Response.json(
          { error: "O Supabase não confirmou a gravação da função." },
          { status: 502 },
        );
      return Response.json({
        ok: true,
        message: "Função salva com sucesso.",
        function: savedRows[0],
      });
    }
    if (action === "delete" && body.entity === "function") {
      const rows = await supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/job_functions?select=official_description,local_description&organization_id=eq.${config.organizationId}&id=eq.${body.id}&limit=1`,
      );
      const role = String(
        rows[0]?.local_description || rows[0]?.official_description || "",
      );
      const linkedContracts = role
        ? await supabaseAdmin.get<Array<{ id: string }>>(
            `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&role_name=eq.${encodeURIComponent(role)}`,
          )
        : [];
      if (linkedContracts.length)
        return Response.json(
          {
            error:
              "A função está vinculada a colaborador e não pode ser excluída.",
          },
          { status: 409 },
        );
      await supabaseAdmin.delete(
        `/rest/v1/job_functions?id=eq.${body.id}&organization_id=eq.${config.organizationId}`,
      );
      return Response.json({ ok: true, message: "Função excluída." });
    }
    if (action === "saveLink") {
      const code=String(body.code||"").trim(), description=String(body.description||"").trim();
      if (!code||!description) return Response.json({error:"Informe o código e a descrição do vínculo."},{status:400});
      const values={organization_id:config.organizationId,code,description,active:body.active!==false};
      const saved=body.id
        ? await supabaseAdmin.patch<CloudRow[]>(`/rest/v1/employment_links?id=eq.${body.id}&organization_id=eq.${config.organizationId}`,values,{prefer:"return=representation"})
        : await supabaseAdmin.post<CloudRow[]>("/rest/v1/employment_links",values,{prefer:"return=representation"});
      if(!saved?.length)return Response.json({error:"O Supabase não confirmou a gravação do vínculo."},{status:502});
      return Response.json({ok:true,message:"Vínculo salvo com sucesso.",link:saved[0]});
    }
    if(action==="delete"&&body.entity==="link"){
      const rows=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/employment_links?select=code&organization_id=eq.${config.organizationId}&id=eq.${body.id}&limit=1`);
      const linked=rows[0]?.code?await supabaseAdmin.get<CloudRow[]>(`/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&employment_link_code=eq.${encodeURIComponent(rows[0].code)}&limit=1`):[];
      if(linked.length)return Response.json({error:"O vínculo está associado a colaborador e não pode ser excluído."},{status:409});
      await supabaseAdmin.delete(`/rest/v1/employment_links?id=eq.${body.id}&organization_id=eq.${config.organizationId}`);
      return Response.json({ok:true,message:"Vínculo excluído."});
    }

    if(action==="updateSalaryHistory"||action==="deleteSalaryHistory"){
      const contractId=String(body.contractId||""),id=String(body.id||"");
      if(!contractId||!id)return Response.json({error:"Registro salarial inválido."},{status:400});
      const histories=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/salary_history?select=*&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}&order=effective_date.asc,created_at.asc`);
      if(action==="deleteSalaryHistory"){
        if(histories.length<=1)return Response.json({error:"Não é possível excluir o único registro salarial do colaborador."},{status:409});
        await supabaseAdmin.delete(`/rest/v1/salary_history?id=eq.${id}&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}`);
      }else{
        const salaryCents=money(body.baseSalary),effectiveDate=String(body.effectiveDate||"");
        if(!salaryCents||!validDate(effectiveDate))return Response.json({error:"Informe valor e vigência válidos."},{status:400});
        const remaining=histories.filter(row=>String(row.id)!==id).sort((a,b)=>String(a.effective_date).localeCompare(String(b.effective_date))||String(a.created_at).localeCompare(String(b.created_at)));
        const previous=[...remaining].reverse().find(row=>String(row.effective_date)<=effectiveDate),next=remaining.find(row=>String(row.effective_date)>effectiveDate);
        if((previous&&salaryCents<Number(previous.salary_cents))||(next&&salaryCents>Number(next.salary_cents)))return Response.json({error:"A edição deve manter a evolução salarial sem redução entre as vigências."},{status:409});
        await supabaseAdmin.patch(`/rest/v1/salary_history?id=eq.${id}&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}`,{effective_date:effectiveDate,salary_cents:salaryCents,reason:String(body.reason||"Alteração salarial")});
      }
      const updated=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/salary_history?select=salary_cents&organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}&order=effective_date.desc,created_at.desc&limit=1`);
      if(updated[0])await supabaseAdmin.patch(`/rest/v1/worker_payroll_profiles?organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}`,{base_salary_cents:Number(updated[0].salary_cents),daily_rate_cents:Math.round(Number(updated[0].salary_cents)/30),updated_at:new Date().toISOString()});
      return Response.json({ok:true,message:action==="deleteSalaryHistory"?"Registro salarial excluído.":"Registro salarial atualizado."});
    }

    if (
      [
        "saveProfile",
        "saveVacation",
        "saveReference",
        "applyAdjustment",
        "undoAdjustment",
      ].includes(action) ||
      (action === "delete" && body.entity === "reference")
    ) {
      const payload: Record<string, unknown> = { ...body, action };
      if (action === "saveProfile") {
        const baseSalaryCents = money(body.baseSalary);
        if (!body.contractId || !baseSalaryCents)
          return Response.json(
            { error: "Informe o salário-base." },
            { status: 400 },
          );
        payload.baseSalaryCents = baseSalaryCents;
        payload.dailyRateCents = Math.round(baseSalaryCents / 30);
        payload.advanceRateBasisPoints = Math.round(
          Number(body.advanceRate || 40) * 100,
        );
        payload.salaryType = body.salaryType === "daily" ? "daily" : "monthly";
        const current=await supabaseAdmin.get<CloudRow[]>(`/rest/v1/worker_payroll_profiles?select=base_salary_cents&organization_id=eq.${config.organizationId}&contract_id=eq.${body.contractId}&limit=1`);
        if(current[0]&&baseSalaryCents<Number(current[0].base_salary_cents))return Response.json({error:"O novo salário não pode ser inferior ao salário atual."},{status:409});
        if(current[0]&&baseSalaryCents===Number(current[0].base_salary_cents))delete payload.effectiveDate;
        await supabaseAdmin.patch(`/rest/v1/employment_contracts?organization_id=eq.${config.organizationId}&id=eq.${body.contractId}`,{payment_type:body.salaryType==="monthly"?"monthly":"production"});
      } else if (action === "saveVacation") {
        if (
          ![body.accrualStart, body.accrualEnd, body.concessionDeadline].every(
            validDate,
          )
        )
          return Response.json(
            { error: "Informe o período aquisitivo e o prazo concessivo." },
            { status: 400 },
          );
        const absences = Math.max(0, Number(body.unjustifiedAbsences) || 0);
        const days = vacationEntitlement(absences, body.lossReason);
        if (!days)
          return Response.json(
            { error: "O período está sem direito a férias pelas faltas ou ocorrência informada. Registre a data de retorno como início de um novo período aquisitivo." },
            { status: 400 },
          );
        payload.days = days;
        payload.soldDays = Math.min(
          Math.floor(days / 3),
          Math.max(0, Number(body.soldDays) || 0),
        );
      } else if (action === "saveReference") {
        const valueCents = money(body.value);
        if (!validDate(body.effectiveDate) || !valueCents)
          return Response.json(
            { error: "Informe data e valor." },
            { status: 400 },
          );
        payload.valueCents = valueCents;
        payload.referenceType =
          body.referenceType === "category" ? "category" : "national";
      } else if (action === "applyAdjustment") {
        if (!validDate(body.effectiveDate) || !Number(body.value))
          return Response.json(
            { error: "Informe a data e o valor do reajuste." },
            { status: 400 },
          );
        payload.mode = body.mode === "percentage" ? "percentage" : "value";
        payload.valueStored =
          payload.mode === "percentage"
            ? Math.round(Number(body.value) * 100)
            : money(body.value);
        payload.functionIds = Array.isArray(body.functionIds)
          ? body.functionIds.map(String).filter(Boolean)
          : [];
      } else if (
        action === "undoAdjustment" &&
        !validDate(body.effectiveDate)
      ) {
        return Response.json(
          { error: "Informe a data do reajuste." },
          { status: 400 },
        );
      }

      const result = await supabaseAdmin.post<
        Array<{
          ok: boolean;
          message: string;
          affected: number;
          batch_id: string | null;
        }>
      >("/rest/v1/rpc/folha_save_hr", {
        p_organization_id: config.organizationId,
        p_company_legacy_ids: user?.companyIds,
        p_payload: payload,
      });
      const saved = result[0] || { ok: true };
      return Response.json({
        ...saved,
        batchId: "batch_id" in saved ? saved.batch_id : undefined,
      });
    }

    if (
      ["saveCenter", "saveItem", "issueItem"].includes(action) ||
      (action === "delete" &&
        ["center", "item"].includes(String(body.entity || "")))
    ) {
      if (
        action === "saveCenter" &&
        !String(body.description || "").trim()
      )
        return Response.json(
          { error: "Informe a descrição." },
          { status: 400 },
        );
      if (action === "saveItem" && !String(body.description || "").trim())
        return Response.json(
          { error: "Informe a descrição." },
          { status: 400 },
        );
      if (
        action === "issueItem" &&
        (!body.itemId || !body.contractId || !validDate(body.issueDate))
      )
        return Response.json(
          { error: "Selecione item, colaborador e data." },
          { status: 400 },
        );
      const result = await supabaseAdmin.post<
        Array<{ ok: boolean; message: string; affected: number }>
      >("/rest/v1/rpc/folha_save_auxiliary_hr", {
        p_organization_id: config.organizationId,
        p_company_legacy_ids: user?.companyIds,
        p_payload: body,
      });
      return Response.json(result[0] || { ok: true });
    }

    return Response.json(
      { error: "Este cadastro será convertido em uma etapa própria." },
      { status: 503 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao salvar função no Supabase.",
      },
      { status: 500 },
    );
  }
}
