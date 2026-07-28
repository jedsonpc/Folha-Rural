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

export async function GET(r: Request) {
  const access = await authorizeCloud(r, "Cadastros");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudFunctionsGet(access.user);
  try {
    await ensureDatabase();
    const db = getRuntimeDatabase(), t = tenant(r), url = new URL(r.url);
    const contractId = Number(url.searchParams.get("contractId") || 0);
    if (contractId) {
      const [profile, salaries, vacations] = await Promise.all([
        db.prepare("SELECT * FROM worker_payroll_profiles WHERE tenant_id=? AND contract_id=?").bind(t, contractId).first(),
        db.prepare("SELECT * FROM salary_history WHERE tenant_id=? AND contract_id=? ORDER BY effective_date DESC,id DESC").bind(t, contractId).all(),
        db.prepare("SELECT * FROM vacation_periods WHERE tenant_id=? AND contract_id=? ORDER BY accrual_start DESC,id DESC").bind(t, contractId).all(),
      ]);
      return Response.json({ profile, salaries: salaries.results, vacations: vacations.results });
    }
    const [functions, centers, references, items, issues, workers] = await Promise.all([
      db.prepare("SELECT f.*,(SELECT COUNT(*) FROM employment_contracts c WHERE c.tenant_id=f.tenant_id AND c.role=COALESCE(NULLIF(f.local_description,''),f.official_description)) usage_count FROM job_functions f WHERE tenant_id=? ORDER BY official_description").bind(t).all(),
      db.prepare("SELECT c.*,(SELECT COUNT(*) FROM services s WHERE s.tenant_id=c.tenant_id AND s.group_source_id=c.id) usage_count FROM cost_centers c WHERE tenant_id=? ORDER BY description").bind(t).all(),
      db.prepare("SELECT * FROM salary_references WHERE tenant_id=? ORDER BY effective_date DESC,id DESC").bind(t).all(),
      db.prepare("SELECT s.*,(SELECT COUNT(*) FROM item_issues i WHERE i.item_id=s.id) usage_count FROM safety_items s WHERE tenant_id=? ORDER BY item_type,description").bind(t).all(),
      db.prepare("SELECT i.*,s.description item_description,p.name worker_name FROM item_issues i JOIN safety_items s ON s.id=i.item_id JOIN employment_contracts c ON c.id=i.contract_id JOIN people p ON p.id=c.person_id WHERE i.tenant_id=? ORDER BY i.issue_date DESC,i.id DESC").bind(t).all(),
      db.prepare("SELECT c.id,p.name,c.role FROM employment_contracts c JOIN people p ON p.id=c.person_id WHERE c.tenant_id=? AND c.status='active' ORDER BY p.name").bind(t).all(),
    ]);
    return Response.json({ functions:functions.results, centers:centers.results, references:references.results, items:items.results, issues:issues.results, workers:workers.results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao consultar cadastros." }, { status: 500 });
  }
}

export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Cadastros");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudFunctionsPost(r);
  try {
    await ensureDatabase();
    const db = getRuntimeDatabase(), t = tenant(r), b = await r.json() as Record<string, unknown>;
    const action = String(b.action || "");
    if (action === "saveProfile") {
      const contractId=Number(b.contractId), salary=money(b.baseSalary), daily=b.dailyRate ? money(b.dailyRate) : Math.round(salary/30);
      if (!contractId || !salary) return Response.json({error:"Informe o salário-base."},{status:400});
      await db.prepare(`INSERT INTO worker_payroll_profiles (tenant_id,contract_id,employment_link_code,employment_link_description,contract_term,salary_type,base_salary_cents,daily_rate_cents,advance_rate_basis_points,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,contract_id) DO UPDATE SET salary_type=excluded.salary_type,base_salary_cents=excluded.base_salary_cents,daily_rate_cents=excluded.daily_rate_cents,advance_rate_basis_points=excluded.advance_rate_basis_points,updated_at=CURRENT_TIMESTAMP`)
        .bind(t,contractId,"","", "indefinite",b.salaryType==="daily"?"daily":"monthly",salary,daily,Math.round(Number(b.advanceRate||40)*100)).run();
      if (validDate(b.effectiveDate)) await db.prepare("INSERT INTO salary_history (tenant_id,contract_id,effective_date,salary_cents,reason,source) VALUES (?,?,?,?,?,'individual')").bind(t,contractId,b.effectiveDate,salary,String(b.reason||"Cadastro/alteração salarial")).run();
    } else if (action === "saveVacation") {
      if (![b.accrualStart,b.accrualEnd,b.concessionDeadline].every(validDate)) return Response.json({error:"Informe o período aquisitivo e o prazo concessivo."},{status:400});
      await db.prepare("INSERT INTO vacation_periods (tenant_id,contract_id,accrual_start,accrual_end,concession_deadline,scheduled_start,scheduled_end,days,sold_days,payment_date,status,notes,settled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(t,Number(b.contractId),b.accrualStart,b.accrualEnd,b.concessionDeadline,b.scheduledStart||null,b.scheduledEnd||null,Number(b.days)||30,Number(b.soldDays)||0,b.paymentDate||null,String(b.status||"pending"),String(b.notes||""),b.status==="paid"?new Date().toISOString():null).run();
    } else if (action === "saveFunction") {
      if (!String(b.cboCode||"").trim() || !String(b.officialDescription||"").trim()) return Response.json({error:"Informe o CBO e a descrição oficial."},{status:400});
      if (b.id) await db.prepare("UPDATE job_functions SET cbo_code=?,official_description=?,local_description=?,active=? WHERE tenant_id=? AND id=?").bind(b.cboCode,b.officialDescription,b.localDescription||null,b.active!==false,t,Number(b.id)).run();
      else await db.prepare("INSERT INTO job_functions (tenant_id,cbo_code,official_description,local_description) VALUES (?,?,?,?)").bind(t,b.cboCode,b.officialDescription,b.localDescription||null).run();
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
      const table = {function:"job_functions",center:"cost_centers",item:"safety_items",reference:"salary_references"}[String(b.entity)];
      if (!table) return Response.json({error:"Cadastro inválido."},{status:400});
      const usage = table==="job_functions" ? await db.prepare("SELECT 1 FROM employment_contracts c JOIN job_functions f ON f.tenant_id=c.tenant_id AND c.role=COALESCE(NULLIF(f.local_description,''),f.official_description) WHERE f.tenant_id=? AND f.id=? LIMIT 1").bind(t,Number(b.id)).first()
        : table==="cost_centers" ? await db.prepare("SELECT 1 FROM services WHERE tenant_id=? AND group_source_id=? LIMIT 1").bind(t,Number(b.id)).first()
        : table==="safety_items" ? await db.prepare("SELECT 1 FROM item_issues WHERE tenant_id=? AND item_id=? LIMIT 1").bind(t,Number(b.id)).first() : null;
      if (usage) return Response.json({error:"O registro possui vínculos e não pode ser excluído."},{status:409});
      await db.prepare(`DELETE FROM ${table} WHERE tenant_id=? AND id=?`).bind(t,Number(b.id)).run();
    } else return Response.json({error:"Ação inválida."},{status:400});
    return Response.json({ok:true,message:"Registro salvo com sucesso."});
  } catch (e) {
    return Response.json({error:e instanceof Error?e.message:"Falha ao salvar."},{status:500});
  }
}

type CloudRow = Record<string, any>;

async function cloudFunctionsGet(user: CloudUser | null) {
  const config = getSupabaseConfig()!;
  try {
    const companyFilter =
      user?.companyIds == null
        ? ""
        : `&companies.legacy_id=in.(${user.companyIds.join(",") || "0"})`;
    const [functions, contracts] = await Promise.all([
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/job_functions?select=*&organization_id=eq.${config.organizationId}&order=official_description.asc`,
      ),
      supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/employment_contracts?select=role_name,companies!inner(legacy_id)&organization_id=eq.${config.organizationId}${companyFilter}`,
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
      centers: [],
      references: [],
      items: [],
      issues: [],
      workers: [],
      dataSource: "supabase",
      conversionScope: "functions",
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

async function cloudFunctionsPost(request: Request) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
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
      if (body.id)
        await supabaseAdmin.patch(
          `/rest/v1/job_functions?id=eq.${body.id}&organization_id=eq.${config.organizationId}`,
          values,
          { prefer: "return=minimal" },
        );
      else
        await supabaseAdmin.post(
          "/rest/v1/job_functions?on_conflict=organization_id,cbo_code",
          values,
          { prefer: "resolution=merge-duplicates,return=minimal" },
        );
      return Response.json({
        ok: true,
        message: "Função salva com sucesso.",
      });
    }
    if (action === "delete" && body.entity === "function") {
      const rows = await supabaseAdmin.get<CloudRow[]>(
        `/rest/v1/job_functions?select=official_description,local_description&organization_id=eq.${config.organizationId}&id=eq.${body.id}&limit=1`,
      );
      const role = String(
        rows[0]?.local_description || rows[0]?.official_description || "",
      );
      const used = role
        ? await supabaseAdmin.get<Array<{ id: string }>>(
            `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&role_name=eq.${encodeURIComponent(role)}&limit=1`,
          )
        : [];
      if (used.length)
        return Response.json(
          {
            error:
              "A função possui vínculos e não pode ser excluída. Desative-a.",
          },
          { status: 409 },
        );
      await supabaseAdmin.delete(
        `/rest/v1/job_functions?id=eq.${body.id}&organization_id=eq.${config.organizationId}`,
      );
      return Response.json({ ok: true, message: "Função excluída." });
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
