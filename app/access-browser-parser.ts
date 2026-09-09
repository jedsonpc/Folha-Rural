import { Buffer } from "buffer";
import MDBReader from "mdb-reader";
type Row=Record<string,unknown>;
export type AccessImportFilter = {
 scope: "registrations" | "launches-all" | "launches-month" | "launches-year";
 month?: string;
 year?: string;
};
const n=(v:unknown)=>typeof v==="number"?v:Number(v)||0;
const t=(v:unknown)=>v==null?null:String(v).trim()||null;
const d=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):t(v);
const fixService=(v:unknown)=>{const x=String(v||"Serviço sem descrição").trim().replace(/\s+/g," "),f:Record<string,string>={"diferensa de férias":"Diferença de férias","fasendo mudas":"Fazendo mudas","fasendo aceiro":"Fazendo aceiro","disbrotando cacau":"Desbrotando cacau","cutivo de mamão":"Cultivo de mamão","conservaçao de estrada":"Conservação de estrada","demarcaçao":"Demarcação","folga de aviso previo":"Folga de aviso prévio","salário familia":"Salário-família","combate à pragas":"Combate a pragas"};return f[x.toLocaleLowerCase("pt-BR")]||x};
export async function parseAccessInBrowser(file:File,password:string,filter:AccessImportFilter){
 const reader=new MDBReader(Buffer.from(await file.arrayBuffer()),{password}),names=reader.getTableNames({normalTables:true,systemTables:false,linkedTables:true});
 const get=(name:string)=>names.includes(name)?reader.getTable(name).getData() as Row[]:[];
 const registrations=filter.scope==="registrations";
 const companies=get("TB_Empresas").map(r=>{const doc=t(r.CNPJ_CEI),digits=String(doc||"").replace(/\D/g,"");return{sourceId:n(r.CodDaEmpresa),name:t(r.NomeDaEmpresa)||"Empresa sem nome",document:digits.length===12?null:doc,documentType:digits.length===12?"caepf":"cnpj",cei:digits.length===12?digits:null,city:t(r.Cidade),state:t(r.UF),address:t(r.Endereco),district:t(r.Bairro),postalCode:t(r.CEP),phone:t(r.Telefone),email:t(r.Email)}});
 const contracts=registrations?get("TB_Cadastro_Pessoal").map(r=>({sourceRegistration:n(r.Matricula),companySourceId:n(r.CodDaEmpresa),name:t(r.Nome)||"Colaborador sem nome",cpf:t(r.CPF),pis:t(r.PIS),birthDate:d(r.Nascimento),birthCity:t(r.Naturalidade),birthState:t(r.UF_Naturalidade),address:t(r.Endereco),district:t(r.Bairro),city:t(r.Cidade),state:t(r.UF_Cidade),postalCode:t(r.CEP),identityNumber:t(r.Identidade),identityIssuer:t(r.Orgao),identityState:t(r.UF_orgao),identityIssueDate:d(r.Emissao),voterTitleNumber:t(r.Titulo),voterZone:t(r.Zona),voterSection:t(r.Secao),ctpsNumber:t(r.CTPS),ctpsIssueDate:d(r.Emissao_CTPS),phone:t(r.Telefone),admissionDate:d(r["Admissão"]),terminationDate:d(r.Data_rescisao),role:t(r.Funcao),active:r.Ativo===true&&!r.Data_rescisao})):[];
 const groups=new Map(get("TB_Grupo").map(r=>[n(r.CodigoDoGrupo),t(r.Grupo)])),units=new Map(get("TB_Unidade de Apontamento").map(r=>[n(r.CodUnidade),t(r.Unidade)]));
 const services=registrations?[]:get("TB_Cadastro de Servicos").map(r=>{const g=n(r.CodigoDoGrupo),u=n(r.CodUnidade);return{sourceId:n(r.CodServico),groupSourceId:g,description:fixService(r.Descricao),unitSourceId:u,fgts:Boolean(r.FGTS),fgts13:Boolean(r["FGTS 13 Sal"]),inss:Boolean(r.INSS),inss13:Boolean(r["INSS 13"]),rais:Boolean(r.RAIS),formulaCode:t(r.Formula),groupName:groups.get(g)||null,unitName:units.get(u)||null,affectsDsr:g>=4,active:true}});
 const dep=registrations?get("TB_Dependente").map(r=>({sourceId:n(r.Cad_Dep),companySourceId:n(r.CodEmpresa)||1,sourceRegistration:n(r.Matricula),name:t(r.Dependente),birthDate:d(r.Nascimento),dependentType:"other",cpf:null})).filter(r=>r.name):[];
 const dateMatches=(value:string|null)=>Boolean(value)&&(filter.scope==="launches-all"||(filter.scope==="launches-month"&&value!.startsWith(filter.month||""))||(filter.scope==="launches-year"&&value!.startsWith(`${filter.year||""}-`)));
 const headers=registrations?[]:get("TB_Lançamentos").filter(r=>dateMatches(d(r.Data))),headerMap=new Map(headers.map(r=>[n(r.Sequencia),{company:n(r.CodDaEmpresa),date:d(r.Data)}])),sequences=new Set(headerMap.keys());
 const details=registrations?[]:get("TB_Detalhes do Lançamento").filter(r=>sequences.has(n(r.Sequencia)));
 const historyEntries=details.map(r=>{const h=headerMap.get(n(r.Sequencia)),quantity=n(r.Producao),unitPriceCents=Math.round(n(r.Preco)*100);if(!h?.date)return null;return{companySourceId:h.company,entryDate:h.date,sourceRegistration:n(r.Matricula),serviceSourceId:n(r.CodServico),quantity,unitPriceCents,amountCents:Math.round(quantity*unitPriceCents),discountCents:Math.round(n(r.Desconto)*100),sourceSequence:n(r.Sequencia)}}).filter(Boolean);
 const selectedContracts=registrations?contracts:[];
 return{fileName:file.name,companies,contracts:selectedContracts,services:registrations?[]:services,dependents:dep,peopleCount:new Set(selectedContracts.map(r=>String(r.cpf||`${r.companySourceId}:${r.sourceRegistration}`))).size,activeCount:selectedContracts.filter(r=>r.active).length,dependentsCount:dep.length,detailsCount:details.length,launchesCount:headers.length,historyEntries};
}
