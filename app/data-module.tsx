"use client";
import { useEffect, useMemo, useState } from "react";
import { isValidCpf } from "./cpf";
import "./data130.css";
import "./data134.css";
import WorkerHrTabs from "./worker-hr-tabs";

type Company = {
  id: number;
  sourceId: number;
  name: string;
  document: string | null;
  city: string | null;
  state: string | null;
};
type Contract = {
  id: number;
  companySourceId: number;
  registrationNumber: number | null;
  legacyCode: string | null;
  sourceRegistration: number;
  admissionDate: string | null;
  terminationDate: string | null;
  role: string | null;
  cboCode: string | null;
  weeklyHours: number;
  employmentLinkCode: string | null;
  employmentLinkDescription: string | null;
  contractTerm: "determined" | "indefinite";
  status: string;
  personId: number;
  name: string;
  cpf: string | null;
  pis: string | null;
  birthDate: string | null;
  identityNumber: string | null;
  identityIssuer: string | null;
  identityState: string | null;
  identityIssueDate: string | null;
  ctpsNumber: string | null;
  ctpsSeries: string | null;
  ctpsState: string | null;
  ctpsIssueDate: string | null;
  voterTitleNumber: string | null;
  voterZone: string | null;
  voterSection: string | null;
  cnhNumber: string | null;
  cnhCategory: string | null;
  cnhExpirationDate: string | null;
  cnhFirstIssueDate: string | null;
  militaryCertificate: string | null;
  phone: string | null;
  motherName: string | null;
  birthState: string | null;
  birthCity: string | null;
  photoDataUrl: string | null;
  email: string | null;
  sex: string | null;
  education: string | null;
  maritalStatus: string | null;
  raceColor: string | null;
  address: string | null;
  addressNumber: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  needsReview: boolean;
  paymentType: "production" | "monthly";
  unionMember: boolean;
  unionDiscountCents: number;
  unionId: number | null;
  unionDiscountFrequency: "biweekly" | "monthly";
  familyDependents: number;
  irrfDependents: number;
  employmentCondition: "first_job" | "reemployment";
  contractType: "harvest" | "offseason" | "indefinite";
};
type Payload = {
  companies: Company[];
  contracts: Contract[];
  counts: { people: number; contracts: number; active: number; review: number };
  dependents: Dependent[];
  unions: Union[];
};
type Dependent = {
  id: number;
  personId: number;
  dependentType: string;
  name: string;
  cpf: string;
  birthDate: string;
  disabled: boolean;
  birthCertificate: string | null;
  vaccinationProof: boolean;
  schoolProof: boolean;
  salaryFamilyEligible: boolean;
  irrfDependent: boolean;
};
type Union = {
  id: number;
  code: string;
  description: string;
  contributionCents: number;
  active: boolean;
};
type JobFunction = {
  id: number;
  cbo_code: string;
  official_description: string;
  local_description: string | null;
  active: boolean;
};
const showDate = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${v.slice(0, 10)}T00:00:00Z`),
      )
    : "—";
const onlyDigits = (v: string | null | undefined) =>
  (v || "").replace(/\D/g, "");
const formatCpf = (v: string | null | undefined) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
};
const formatPis = (v: string | null | undefined) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{5})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{2})(\d)/, ".$1-$2");
};
const formatPhone = (v: string | null | undefined) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10)
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};
const formatCep = (v: string | null | undefined) =>
  onlyDigits(v)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");
const showCpf = (v: string | null) => formatCpf(v) || "Não informado";
const today = () => new Date().toISOString().slice(0, 10);
const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export default function DataModule({
  mode,
  selectedCompany = "all",
  onSelectCompany,
}: {
  mode: "Empresas" | "Colaboradores";
  selectedCompany?: string;
  onSelectCompany?: (v: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [functions, setFunctions] = useState<JobFunction[]>([]);
  const [admission, setAdmission] = useState<Contract | null>(null),
    [editing, setEditing] = useState<Contract | null>(null),
    [creating, setCreating] = useState(false),
    [tab, setTab] = useState<
      "person" | "documents" | "address" | "contract" | "dependents" | "salary" | "vacation"
    >("person"),
    [createTab, setCreateTab] = useState<
      "person" | "documents" | "address" | "contract" | "dependents"
    >("person"),
    [createDependents, setCreateDependents] = useState<
      Array<Omit<Dependent, "personId">>
    >([]),
    [createDependent, setCreateDependent] = useState({
      id: 0,
      dependentType: "child",
      name: "",
      cpf: "",
      birthDate: "",
      disabled: false,
      birthCertificate: "",
      vaccinationProof: false,
      schoolProof: false,
      salaryFamilyEligible: true,
      irrfDependent: true,
    }),
    [dependentForm, setDependentForm] = useState({
      id: 0,
      dependentType: "child",
      name: "",
      cpf: "",
      birthDate: "",
      disabled: false,
      birthCertificate: "",
      vaccinationProof: false,
      schoolProof: false,
      salaryFamilyEligible: true,
      irrfDependent: true,
    }),
    [saving, setSaving] = useState(false);
  const [birthCities, setBirthCities] = useState<string[]>([]),
    [editBirthCities, setEditBirthCities] = useState<string[]>([]),
    [cepStatus, setCepStatus] = useState("");
  const [newForm, setNewForm] = useState({
      companySourceId: "",
      admissionDate: today(),
      role: "",
      cboCode: "",
      weeklyHours: "44",
      employmentLinkCode: "",
      employmentLinkDescription: "",
      contractTerm: "indefinite",
      employmentCondition: "reemployment",
      contractType: "harvest",
    }),
    [createForm, setCreateForm] = useState({
      name: "",
      cpf: "",
      pis: "",
      birthDate: "",
      identityNumber: "",
      identityIssuer: "",
      identityState: "",
      identityIssueDate: "",
      ctpsNumber: "",
      ctpsSeries: "",
      ctpsState: "",
      ctpsIssueDate: "",
      voterTitleNumber: "",
      voterZone: "",
      voterSection: "",
      cnhNumber: "",
      cnhCategory: "",
      cnhExpirationDate: "",
      cnhFirstIssueDate: "",
      militaryCertificate: "",
      phone: "",
      motherName: "",
      birthState: "",
      birthCity: "",
      photoDataUrl: "",
      email: "",
      sex: "",
      education: "",
      maritalStatus: "",
      raceColor: "",
      address: "",
      addressNumber: "",
      district: "",
      city: "",
      state: "",
      postalCode: "",
      companySourceId: selectedCompany === "all" ? "" : selectedCompany,
      admissionDate: today(),
      role: "",
      cboCode: "",
      weeklyHours: "44",
      employmentLinkCode: "",
      employmentLinkDescription: "",
      contractTerm: "indefinite",
      paymentType: "production",
      unionMember: false,
      unionDiscount: "",
      unionId: "",
      unionDiscountFrequency: "monthly",
      familyDependents: "0",
      irrfDependents: "0",
      employmentCondition: "first_job",
      contractType: "harvest",
    }),
    [form, setForm] = useState<Record<string, string>>({});
  const load = () =>
    fetch("/api/data")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setData({
          ...b,
          companies: Array.isArray(b.companies) ? b.companies : [],
          contracts: Array.isArray(b.contracts) ? b.contracts : [],
          dependents: Array.isArray(b.dependents) ? b.dependents : [],
          unions: Array.isArray(b.unions) ? b.unions : [],
          counts: b.counts || { people: 0, contracts: 0, active: 0, review: 0 },
        });
      })
      .catch((e) => setError(e.message || "Falha ao carregar."));
  useEffect(() => {
    load();
    fetch("/api/hr")
      .then((r) => r.json())
      .then((b) => setFunctions(Array.isArray(b.functions) ? b.functions : []))
      .catch(() => setFunctions([]));
  }, []);
  const companyName = (id: number) =>
    data?.companies.find((c) => c.sourceId === id)?.name || `Empresa ${id}`;
  const scoped = useMemo(
    () =>
      !data
        ? []
        : selectedCompany === "all"
          ? data.contracts
          : data.contracts.filter(
              (r) => String(r.companySourceId) === selectedCompany,
            ),
    [data, selectedCompany],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase(),
      digits = search.replace(/\D/g, "");
    return scoped.filter((r) => {
      const h =
        `${r.name} ${r.cpf || ""} ${r.registrationNumber || ""} ${r.legacyCode || ""} ${r.role || ""}`.toLowerCase();
      return (
        (status === "all" || r.status === status) &&
        (!term || h.includes(term) || (digits && h.includes(digits)))
      );
    });
  }, [scoped, search, status]);
  const openAdmission = (r: Contract) => {
    setAdmission(r);
    setNotice("");
    setNewForm({
      companySourceId: String(r.companySourceId),
      admissionDate: today(),
      role: "",
      cboCode: "",
      weeklyHours: "44",
      employmentLinkCode: "",
      employmentLinkDescription: "",
      contractTerm: "indefinite",
      employmentCondition: "reemployment",
      contractType: "harvest",
    });
  };
  const openEdit = (r: Contract) => {
    setEditing(r);
    setTab("person");
    setNotice("");
    setForm({
      name: r.name,
      cpf: formatCpf(r.cpf),
      pis: formatPis(r.pis),
      birthDate: r.birthDate || "",
      identityNumber: r.identityNumber || "",
      identityIssuer: r.identityIssuer || "",
      identityState: r.identityState || "",
      identityIssueDate: r.identityIssueDate || "",
      ctpsNumber: r.ctpsNumber || "",
      ctpsSeries: r.ctpsSeries || "",
      ctpsState: r.ctpsState || "",
      ctpsIssueDate: r.ctpsIssueDate || "",
      voterTitleNumber: r.voterTitleNumber || "",
      voterZone: r.voterZone || "",
      voterSection: r.voterSection || "",
      cnhNumber: r.cnhNumber || "",
      cnhCategory: r.cnhCategory || "",
      cnhExpirationDate: r.cnhExpirationDate || "",
      cnhFirstIssueDate: r.cnhFirstIssueDate || "",
      militaryCertificate: r.militaryCertificate || "",
      phone: formatPhone(r.phone),
      motherName: r.motherName || "",
      birthState: r.birthState || "",
      birthCity: r.birthCity || "",
      photoDataUrl: r.photoDataUrl || "",
      email: r.email || "",
      sex: r.sex || "",
      education: r.education || "",
      maritalStatus: r.maritalStatus || "",
      raceColor: r.raceColor || "",
      address: r.address || "",
      addressNumber: r.addressNumber || "",
      district: r.district || "",
      city: r.city || "",
      state: r.state || "",
      postalCode: formatCep(r.postalCode),
      admissionDate: r.admissionDate || "",
      role: r.role || "",
      cboCode: r.cboCode || "",
      weeklyHours: String(r.weeklyHours || 44),
      employmentLinkCode: r.employmentLinkCode || "",
      employmentLinkDescription: r.employmentLinkDescription || "",
      contractTerm: r.contractTerm || "indefinite",
      terminationDate: today(),
      paymentType: r.paymentType || "production",
      unionMember: r.unionMember ? "true" : "false",
      unionDiscount: String((r.unionDiscountCents || 0) / 100),
      unionId: String(r.unionId || ""),
      unionDiscountFrequency: r.unionDiscountFrequency || "monthly",
      familyDependents: String(r.familyDependents || 0),
      irrfDependents: String(r.irrfDependents || 0),
      employmentCondition: r.employmentCondition || "first_job",
      contractType: r.contractType || "harvest",
    });
  };
  const loadCities = async (state: string, setter: (v: string[]) => void) => {
    if (!state) return setter([]);
    try {
      const r = await fetch(`/api/locations?state=${state}`),
        b = await r.json();
      setter((b.cities || []).map((c: { name: string }) => c.name));
    } catch {
      setter([]);
    }
  };
  useEffect(() => {
    loadCities(createForm.birthState, setBirthCities);
  }, [createForm.birthState]);
  useEffect(() => {
    loadCities(form.birthState || "", setEditBirthCities);
  }, [form.birthState]);
  const lookupCep = async (kind: "create" | "edit") => {
    const current = kind === "create" ? createForm : form,
      cep = onlyDigits(current.postalCode);
    if (cep.length !== 8) return setCepStatus("Informe um CEP com 8 números.");
    setCepStatus("Consultando CEP…");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`),
        address = await response.json();
      if (!response.ok || address.erro) throw new Error("CEP não encontrado.");
      const next = {
        ...current,
        postalCode: formatCep(cep),
        address: address.logradouro || current.address,
        district: address.bairro || current.district,
        city: address.localidade || current.city,
        state: address.uf || current.state,
      };
      if (kind === "create") setCreateForm(next as typeof createForm);
      else setForm(next);
      setCepStatus("Endereço preenchido. Confira o número e o complemento.");
    } catch (error) {
      setCepStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar. Digite o endereço manualmente.",
      );
    }
  };
  const request = async (method: string, body: object) => {
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/data", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setNotice(b.message);
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      admission &&
      (await request("POST", {
        personId: admission.personId,
        companySourceId: Number(newForm.companySourceId),
        admissionDate: newForm.admissionDate,
        role: newForm.role,
        cboCode: newForm.cboCode,
        weeklyHours: Number(newForm.weeklyHours),
        employmentLinkCode: newForm.employmentLinkCode,
        employmentLinkDescription: newForm.employmentLinkDescription,
        contractTerm: newForm.contractTerm,
        employmentCondition: newForm.employmentCondition,
        contractType: newForm.contractType,
      }))
    )
      setTimeout(() => setAdmission(null), 900);
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      editing &&
      (await request("PUT", {
        ...form,
        unionMember: form.unionMember === "true",
        personId: editing.personId,
        contractId: editing.id,
      }))
    )
      setTimeout(() => setEditing(null), 900);
  };
  const saveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      await request("POST", {
        action: "create",
        ...createForm,
        companySourceId: Number(createForm.companySourceId),
        unionDiscount: Number(createForm.unionDiscount),
        familyDependents: Number(createForm.familyDependents),
        irrfDependents: Number(createForm.irrfDependents),
        dependents: createDependents,
      })
    )
      setTimeout(() => setCreating(false), 900);
  };
  const saveDependent = async () => {
    if (!editing) return;
    if (
      await request("POST", {
        action: "saveDependent",
        personId: editing.personId,
        ...dependentForm,
      })
    )
      setDependentForm({
        id: 0,
        dependentType: "child",
        name: "",
        cpf: "",
        birthDate: "",
        disabled: false,
        birthCertificate: "",
        vaccinationProof: false,
        schoolProof: false,
        salaryFamilyEligible: true,
        irrfDependent: true,
      });
  };
  const deleteDependent = async (id: number) => {
    if (editing && confirm("Excluir este dependente?"))
      await request("POST", {
        action: "deleteDependent",
        id,
        personId: editing.personId,
      });
  };
  const terminate = async () => {
    if (!editing || !confirm(`Confirma o desligamento de ${editing.name}?`))
      return;
    if (
      await request("PUT", {
        action: "terminate",
        personId: editing.personId,
        contractId: editing.id,
        terminationDate: form.terminationDate,
      })
    )
      setTimeout(() => setEditing(null), 900);
  };
  if (error)
    return (
      <section className="panel data-state">
        <b>Não foi possível abrir os dados</b>
        <p>{error}</p>
        <button className="secondary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </section>
    );
  if (!data)
    return (
      <section className="panel data-state">
        <span className="spinner" />
        <p>Carregando os dados…</p>
      </section>
    );
  const predictedRegistration =
    selectedCompany === "all"
      ? null
      : Math.max(
          0,
          ...data.contracts
            .filter((r) => String(r.companySourceId) === selectedCompany)
            .map((r) => r.registrationNumber || 0),
        ) + 1;
  if (mode === "Empresas")
    return (
      <section className="data-module">
        <div className="data-heading">
          <small>EMPRESAS EM PRODUÇÃO</small>
          <h2>{data.companies.length} empresas cadastradas</h2>
          <p>Selecione uma empresa para consultar seus colaboradores.</p>
        </div>
        <div className="company-grid">
          {data.companies.map((c) => {
            const rows = data.contracts.filter(
              (r) => r.companySourceId === c.sourceId,
            );
            return (
              <button
                className="company-card company-button"
                key={c.id}
                onClick={() => onSelectCompany?.(String(c.sourceId))}
              >
                <span>⌂</span>
                <div>
                  <small>EMPRESA {c.sourceId}</small>
                  <h3>{c.name}</h3>
                  <p>{c.document || "Documento não informado"}</p>
                  <p>
                    {[c.city, c.state].filter(Boolean).join(" · ") ||
                      "Localidade não informada"}
                  </p>
                </div>
                <footer>
                  <b>{rows.filter((r) => r.status === "active").length}</b>{" "}
                  ativos <i /> <b>{rows.length}</b> contratos{" "}
                  <strong>Consultar →</strong>
                </footer>
              </button>
            );
          })}
        </div>
      </section>
    );
  return (
    <section className="data-module">
      <div className="data-summary">
        <article>
          <strong>{new Set(scoped.map((r) => r.personId)).size}</strong>
          <span>pessoas nesta consulta</span>
        </article>
        <article>
          <strong>{scoped.length}</strong>
          <span>contratos</span>
        </article>
        <article>
          <strong>{scoped.filter((r) => r.status === "active").length}</strong>
          <span>contratos ativos</span>
        </article>
        <article>
          <strong>{scoped.filter((r) => r.needsReview).length}</strong>
          <span>cadastros para revisar</span>
        </article>
      </div>
      <div className="panel data-panel">
        <div className="data-heading">
          <small>COLABORADORES</small>
          <h2>
            {selectedCompany === "all"
              ? "Todos os contratos"
              : companyName(Number(selectedCompany))}
          </h2>
          <p>Edite a ficha para corrigir dados ou crie uma nova admissão.</p>
        </div>
        {notice && !admission && !editing && !creating && (
          <div className="inline-notice">{notice}</div>
        )}
        <div className="data-toolbar compact">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar nome, CPF, matrícula ou função…"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="terminated">Desligados</option>
          </select>
          <button
            className="primary"
            disabled={selectedCompany === "all"}
            onClick={() => {
              setNotice("");
              setCreateForm({
                ...createForm,
                companySourceId: selectedCompany,
              });
              setCreating(true);
            }}
          >
            ＋ Cadastrar colaborador
          </button>
        </div>
        {selectedCompany === "all" && (
          <p className="selection-help">
            Selecione uma empresa no topo para cadastrar um novo colaborador.
          </p>
        )}
        <p className="result-count">
          Exibindo {Math.min(filtered.length, 250)} de {filtered.length}{" "}
          contratos
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Matrícula / código</th>
                <th>CPF</th>
                <th>Colaborador</th>
                <th>Função</th>
                <th>Admissão</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 250).map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>
                      {r.registrationNumber
                        ? `MAT-${String(r.registrationNumber).padStart(4, "0")}`
                        : r.legacyCode}
                    </b>
                    <small>Origem: {r.sourceRegistration}</small>
                  </td>
                  <td>
                    <b className="cpf-main">{showCpf(r.cpf)}</b>
                  </td>
                  <td>
                    <b>{r.name}</b>
                    <small>
                      {companyName(r.companySourceId)}
                      {r.needsReview ? " · revisar cadastro" : ""}
                    </small>
                  </td>
                  <td>{r.role || "—"}</td>
                  <td>{showDate(r.admissionDate)}</td>
                  <td>
                    <span className={`status-chip ${r.status}`}>
                      {r.status === "active" ? "Ativo" : "Desligado"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="table-action"
                        onClick={() => openEdit(r)}
                      >
                        Editar ficha
                      </button>
                      <button
                        className="table-action"
                        onClick={() => openAdmission(r)}
                      >
                        ⧉ Clonar cadastro / novo contrato
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <div
            className="modal worker-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ModalHead
              title="Novo colaborador"
              close={() => setCreating(false)}
            />
            <div className="edit-tabs" role="tablist">
              {[
                ["person", "Pessoais"],
                ["address", "Endereço"],
                ["documents", "Documentos"],
                ["contract", "Contrato"],
                ["dependents", `Dependentes (${createDependents.length})`],
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={createTab === key ? "active" : ""}
                  disabled={key !== "person" && !isValidCpf(createForm.cpf)}
                  title={
                    key !== "person" && !isValidCpf(createForm.cpf)
                      ? "Valide o CPF para continuar"
                      : ""
                  }
                  onClick={() => {
                    if (key !== "person" && !isValidCpf(createForm.cpf)) {
                      setNotice(
                        "Informe um CPF válido para continuar o cadastro.",
                      );
                      return;
                    }
                    setNotice("");
                    setCreateTab(key as typeof createTab);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <form className="worker-form" onSubmit={saveCreate}>
              <div className="form-scroll">
                <div className="form-grid">
                  {createTab === "person" && (
                    <>
                      <div className="cpf-gate wide">
                        <Field
                          wide
                          label="CPF do colaborador · obrigatório"
                          value={createForm.cpf}
                          set={(v) =>
                            setCreateForm({ ...createForm, cpf: formatCpf(v) })
                          }
                        />
                        <span
                          className={
                            isValidCpf(createForm.cpf) ? "valid" : "invalid"
                          }
                        >
                          {isValidCpf(createForm.cpf)
                            ? "✓ CPF válido — cadastro liberado"
                            : "Digite e valide o CPF para liberar as demais abas"}
                        </span>
                      </div>
                      <PhotoField
                        value={createForm.photoDataUrl}
                        set={(v) =>
                          setCreateForm({ ...createForm, photoDataUrl: v })
                        }
                        error={setNotice}
                      />
                      <Field
                        wide
                        label="Nome completo"
                        value={createForm.name}
                        set={(v) => setCreateForm({ ...createForm, name: v })}
                      />
                      <Field
                        label="Nascimento"
                        type="date"
                        value={createForm.birthDate}
                        set={(v) =>
                          setCreateForm({ ...createForm, birthDate: v })
                        }
                      />
                      <Field
                        label="Telefone"
                        value={createForm.phone}
                        set={(v) =>
                          setCreateForm({
                            ...createForm,
                            phone: formatPhone(v),
                          })
                        }
                      />
                      <Field
                        wide
                        label="E-mail"
                        type="email"
                        value={createForm.email}
                        set={(v) => setCreateForm({ ...createForm, email: v })}
                      />
                      <SelectField
                        label="Sexo"
                        value={createForm.sex}
                        set={(v) => setCreateForm({ ...createForm, sex: v })}
                        options={[
                          ["female", "Feminino"],
                          ["male", "Masculino"],
                          ["not_informed", "Não informado"],
                        ]}
                      />
                      <SelectField
                        label="Escolaridade"
                        value={createForm.education}
                        set={(v) =>
                          setCreateForm({ ...createForm, education: v })
                        }
                        options={[
                          ["illiterate", "Analfabeto"],
                          ["elementary_incomplete", "Fundamental incompleto"],
                          ["elementary_complete", "Fundamental completo"],
                          ["high_school_incomplete", "Médio incompleto"],
                          ["high_school_complete", "Médio completo"],
                          ["higher_incomplete", "Superior incompleto"],
                          ["higher_complete", "Superior completo"],
                          ["postgraduate", "Pós-graduação"],
                        ]}
                      />
                      <SelectField
                        label="Estado civil"
                        value={createForm.maritalStatus}
                        set={(v) =>
                          setCreateForm({ ...createForm, maritalStatus: v })
                        }
                        options={[
                          ["single", "Solteiro(a)"],
                          ["married", "Casado(a)"],
                          ["stable_union", "União estável"],
                          ["separated", "Separado(a)"],
                          ["divorced", "Divorciado(a)"],
                          ["widowed", "Viúvo(a)"],
                        ]}
                      />
                      <SelectField
                        label="Cor/raça"
                        value={createForm.raceColor}
                        set={(v) =>
                          setCreateForm({ ...createForm, raceColor: v })
                        }
                        options={[
                          ["white", "Branca"],
                          ["black", "Preta"],
                          ["brown", "Parda"],
                          ["yellow", "Amarela"],
                          ["indigenous", "Indígena"],
                          ["not_informed", "Não informado"],
                        ]}
                      />
                      <label>
                        UF de nascimento
                        <select
                          value={createForm.birthState}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              birthState: e.target.value,
                              birthCity: "",
                            })
                          }
                        >
                          <option value="">Selecione…</option>
                          {states.map((uf) => (
                            <option key={uf}>{uf}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Município de nascimento
                        <input
                          list="birth-cities-new"
                          disabled={!createForm.birthState}
                          placeholder={
                            createForm.birthState
                              ? "Selecione ou digite…"
                              : "Escolha a UF"
                          }
                          value={createForm.birthCity}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              birthCity: e.target.value,
                            })
                          }
                        />
                        <datalist id="birth-cities-new">
                          {birthCities.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </label>
                    </>
                  )}
                  {createTab === "documents" && (
                    <DocumentFields form={createForm} setForm={setCreateForm} />
                  )}
                  {createTab === "address" && (
                    <>
                      <div className="cep-search wide">
                        <Field
                          label="CEP · informe primeiro"
                          value={createForm.postalCode}
                          set={(v) =>
                            setCreateForm({
                              ...createForm,
                              postalCode: formatCep(v),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => lookupCep("create")}
                        >
                          Buscar endereço
                        </button>
                        {cepStatus && <small>{cepStatus}</small>}
                      </div>
                      <Field
                        wide
                        label="Endereço"
                        value={createForm.address}
                        set={(v) =>
                          setCreateForm({ ...createForm, address: v })
                        }
                      />
                      <Field
                        label="Número"
                        value={createForm.addressNumber}
                        set={(v) =>
                          setCreateForm({ ...createForm, addressNumber: v })
                        }
                      />
                      <Field
                        label="Bairro"
                        value={createForm.district}
                        set={(v) =>
                          setCreateForm({ ...createForm, district: v })
                        }
                      />
                      <Field
                        label="Cidade"
                        value={createForm.city}
                        set={(v) => setCreateForm({ ...createForm, city: v })}
                      />
                      <Field
                        label="UF"
                        value={createForm.state}
                        set={(v) => setCreateForm({ ...createForm, state: v })}
                      />
                    </>
                  )}
                  {createTab === "contract" && (
                    <>
                      <div className="contract-summary wide">
                        <b>Nova matrícula: {predictedRegistration}</b>
                        <span>
                          Vínculo criado na empresa atualmente selecionada
                        </span>
                      </div>
                      <Field
                        label="Admissão"
                        type="date"
                        value={createForm.admissionDate}
                        set={(v) =>
                          setCreateForm({ ...createForm, admissionDate: v })
                        }
                      />
                      <FunctionField
                        functions={functions}
                        role={createForm.role}
                        cboCode={createForm.cboCode}
                        set={(role, cboCode) =>
                          setCreateForm({ ...createForm, role, cboCode })
                        }
                      />
                      <Field
                        label="Horas semanais"
                        type="number"
                        value={createForm.weeklyHours}
                        set={(v) =>
                          setCreateForm({ ...createForm, weeklyHours: v })
                        }
                      />
                      <Field
                        label="Código do vínculo"
                        value={createForm.employmentLinkCode}
                        set={(v) =>
                          setCreateForm({
                            ...createForm,
                            employmentLinkCode: v,
                          })
                        }
                      />
                      <Field
                        wide
                        label="Vínculo"
                        value={createForm.employmentLinkDescription}
                        set={(v) =>
                          setCreateForm({
                            ...createForm,
                            employmentLinkDescription: v,
                          })
                        }
                      />
                      <label>
                        Prazo do contrato
                        <select
                          value={createForm.contractTerm}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              contractTerm: e.target.value,
                            })
                          }
                        >
                          <option value="determined">Prazo determinado</option>
                          <option value="indefinite">Prazo indeterminado</option>
                        </select>
                      </label>
                      <label>
                        Tipo de apontamento
                        <select
                          value={createForm.paymentType}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              paymentType: e.target.value,
                            })
                          }
                        >
                          <option value="production">Produção</option>
                          <option value="monthly">Mensalista</option>
                        </select>
                      </label>
                      <label>
                        Histórico profissional
                        <select
                          value={createForm.employmentCondition}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              employmentCondition: e.target.value,
                            })
                          }
                        >
                          <option value="first_job">Primeiro emprego</option>
                          <option value="reemployment">Reemprego</option>
                        </select>
                      </label>
                      <label>
                        Tipo de contrato
                        <select
                          value={createForm.contractType}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              contractType: e.target.value,
                            })
                          }
                        >
                          <option value="harvest">Safra</option>
                          <option value="offseason">Entressafra</option>
                          <option value="indefinite">
                            Prazo indeterminado
                          </option>
                        </select>
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={createForm.unionMember}
                          onChange={(e) =>
                            setCreateForm({
                              ...createForm,
                              unionMember: e.target.checked,
                            })
                          }
                        />{" "}
                        Sindicalizado
                      </label>
                      {createForm.unionMember && (
                        <>
                          <label className="wide">
                            Sindicato
                            <select
                              required
                              value={createForm.unionId}
                              onChange={(e) =>
                                setCreateForm({
                                  ...createForm,
                                  unionId: e.target.value,
                                })
                              }
                            >
                              <option value="">Selecione…</option>
                              {data.unions
                                .filter((u) => u.active)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.code} · {u.description} —{" "}
                                    {new Intl.NumberFormat("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    }).format(u.contributionCents / 100)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div className="union-frequency wide">
                            <b>Periodicidade do desconto</b>
                            <label>
                              <input
                                type="radio"
                                name="create-union-frequency"
                                checked={
                                  createForm.unionDiscountFrequency ===
                                  "biweekly"
                                }
                                onChange={() =>
                                  setCreateForm({
                                    ...createForm,
                                    unionDiscountFrequency: "biweekly",
                                  })
                                }
                              />{" "}
                              Quinzenal · metade em cada folha
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="create-union-frequency"
                                checked={
                                  createForm.unionDiscountFrequency ===
                                  "monthly"
                                }
                                onChange={() =>
                                  setCreateForm({
                                    ...createForm,
                                    unionDiscountFrequency: "monthly",
                                  })
                                }
                              />{" "}
                              Mensal · integral no saldo mensal
                            </label>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {createTab === "dependents" && (
                    <div className="dependents-editor wide">
                      <div className="dependent-list">
                        {createDependents.map((d, index) => (
                          <article key={`${d.cpf}-${index}`}>
                            <div>
                              <b>{d.name}</b>
                              <small>
                                {d.dependentType === "child"
                                  ? "Filho(a)"
                                  : d.dependentType}{" "}
                                · CPF {showCpf(d.cpf)}
                              </small>
                            </div>
                            <span>
                              {d.salaryFamilyEligible
                                ? "Salário-família"
                                : "Sem salário-família"}
                            </span>
                            <button
                              type="button"
                              className="danger"
                              onClick={() =>
                                setCreateDependents(
                                  createDependents.filter(
                                    (_, i) => i !== index,
                                  ),
                                )
                              }
                            >
                              Excluir
                            </button>
                          </article>
                        ))}
                      </div>
                      <div className="dependent-form">
                        <h3>Adicionar dependente</h3>
                        <div className="form-grid">
                          <label>
                            Tipo
                            <select
                              value={createDependent.dependentType}
                              onChange={(e) =>
                                setCreateDependent({
                                  ...createDependent,
                                  dependentType: e.target.value,
                                })
                              }
                            >
                              <option value="child">Filho(a)</option>
                              <option value="spouse">Cônjuge</option>
                              <option value="stepchild">Enteado(a)</option>
                              <option value="father">Pai</option>
                              <option value="mother">Mãe</option>
                              <option value="other">Outro</option>
                            </select>
                          </label>
                          <Field
                            wide
                            label="Nome completo"
                            value={createDependent.name}
                            set={(v) =>
                              setCreateDependent({
                                ...createDependent,
                                name: v,
                              })
                            }
                          />
                          <Field
                            label="CPF obrigatório"
                            value={createDependent.cpf}
                            set={(v) =>
                              setCreateDependent({
                                ...createDependent,
                                cpf: formatCpf(v),
                              })
                            }
                          />
                          <Field
                            label="Nascimento"
                            type="date"
                            value={createDependent.birthDate}
                            set={(v) =>
                              setCreateDependent({
                                ...createDependent,
                                birthDate: v,
                              })
                            }
                          />
                          {createDependent.dependentType === "child" && (
                            <>
                              <Field
                                wide
                                label="Certidão de nascimento"
                                value={createDependent.birthCertificate}
                                set={(v) =>
                                  setCreateDependent({
                                    ...createDependent,
                                    birthCertificate: v,
                                  })
                                }
                              />
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={createDependent.vaccinationProof}
                                  onChange={(e) =>
                                    setCreateDependent({
                                      ...createDependent,
                                      vaccinationProof: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Vacinação apresentada
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={createDependent.schoolProof}
                                  onChange={(e) =>
                                    setCreateDependent({
                                      ...createDependent,
                                      schoolProof: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Frequência escolar apresentada
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={createDependent.disabled}
                                  onChange={(e) =>
                                    setCreateDependent({
                                      ...createDependent,
                                      disabled: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Dependente inválido
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={createDependent.salaryFamilyEligible}
                                  onChange={(e) =>
                                    setCreateDependent({
                                      ...createDependent,
                                      salaryFamilyEligible: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Salário-família
                              </label>
                            </>
                          )}
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={createDependent.irrfDependent}
                              onChange={(e) =>
                                setCreateDependent({
                                  ...createDependent,
                                  irrfDependent: e.target.checked,
                                })
                              }
                            />{" "}
                            Dependente para IRRF
                          </label>
                        </div>
                        <div className="actions">
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              setCreateDependents([
                                ...createDependents,
                                { ...createDependent },
                              ]);
                              setCreateDependent({
                                id: 0,
                                dependentType: "child",
                                name: "",
                                cpf: "",
                                birthDate: "",
                                disabled: false,
                                birthCertificate: "",
                                vaccinationProof: false,
                                schoolProof: false,
                                salaryFamilyEligible: true,
                                irrfDependent: true,
                              });
                            }}
                          >
                            Adicionar à ficha
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <Notice text={notice} />
              </div>
              <div className="sticky-actions">
                <Actions
                  saving={saving}
                  cancel={() => setCreating(false)}
                  label="Cadastrar colaborador"
                />
              </div>
            </form>
          </div>
        </div>
      )}
      {admission && (
        <div className="modal-backdrop" onMouseDown={() => setAdmission(null)}>
          <div
            className="modal admission-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ModalHead
              title="Clonar cadastro / novo contrato"
              close={() => setAdmission(null)}
            />
            <div className="person-copy">
              <span>
                {admission.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div>
                <b>{admission.name}</b>
                <small>
                  CPF {showCpf(admission.cpf)} · dados pessoais preservados
                </small>
              </div>
            </div>
            <form onSubmit={saveAdmission}>
              <div className="admission-note">
                Os dados pessoais serão preservados. Preencha somente o novo
                vínculo; a matrícula será sequencial na empresa escolhida.
              </div>
              <div className="form-grid">
                <label className="wide">
                  Empresa
                  <select
                    required
                    value={newForm.companySourceId}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        companySourceId: e.target.value,
                      })
                    }
                  >
                    {data.companies.map((c) => (
                      <option value={c.sourceId} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Data de admissão"
                  type="date"
                  value={newForm.admissionDate}
                  set={(v) => setNewForm({ ...newForm, admissionDate: v })}
                />
                <FunctionField
                  functions={functions}
                  role={newForm.role}
                  cboCode={newForm.cboCode}
                  set={(role, cboCode) =>
                    setNewForm({ ...newForm, role, cboCode })
                  }
                />
                <Field
                  label="Horas semanais"
                  type="number"
                  value={newForm.weeklyHours}
                  set={(v) => setNewForm({ ...newForm, weeklyHours: v })}
                />
                <Field
                  label="Código do vínculo"
                  value={newForm.employmentLinkCode}
                  set={(v) =>
                    setNewForm({ ...newForm, employmentLinkCode: v })
                  }
                />
                <Field
                  wide
                  label="Vínculo"
                  value={newForm.employmentLinkDescription}
                  set={(v) =>
                    setNewForm({ ...newForm, employmentLinkDescription: v })
                  }
                />
                <label>
                  Prazo do contrato
                  <select
                    value={newForm.contractTerm}
                    onChange={(e) =>
                      setNewForm({ ...newForm, contractTerm: e.target.value })
                    }
                  >
                    <option value="determined">Prazo determinado</option>
                    <option value="indefinite">Prazo indeterminado</option>
                  </select>
                </label>
                <label>
                  Histórico profissional
                  <select
                    value={newForm.employmentCondition}
                    onChange={(e) =>
                      setNewForm({
                        ...newForm,
                        employmentCondition: e.target.value,
                      })
                    }
                  >
                    <option value="first_job">Primeiro emprego</option>
                    <option value="reemployment">Reemprego</option>
                  </select>
                </label>
                <label>
                  Tipo de contrato
                  <select
                    value={newForm.contractType}
                    onChange={(e) =>
                      setNewForm({ ...newForm, contractType: e.target.value })
                    }
                  >
                    <option value="harvest">Safra</option>
                    <option value="offseason">Entressafra</option>
                    <option value="indefinite">Prazo indeterminado</option>
                  </select>
                </label>
              </div>
              <Notice text={notice} />
              <Actions
                saving={saving}
                cancel={() => setAdmission(null)}
                label="Criar nova admissão"
              />
            </form>
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <div
            className="modal worker-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ModalHead title={editing.name} close={() => setEditing(null)} />
            <div className="edit-tabs" role="tablist">
              <button
                className={tab === "person" ? "active" : ""}
                onClick={() => setTab("person")}
              >
                Pessoais
              </button>
              <button
                className={tab === "address" ? "active" : ""}
                onClick={() => setTab("address")}
              >
                Endereço
              </button>
              <button
                className={tab === "documents" ? "active" : ""}
                onClick={() => setTab("documents")}
              >
                Documentos
              </button>
              <button
                className={tab === "contract" ? "active" : ""}
                onClick={() => setTab("contract")}
              >
                Contrato
              </button>
              <button type="button" className={tab === "salary" ? "active" : ""} onClick={() => setTab("salary")}>
                Salário
              </button>
              <button type="button" className={tab === "vacation" ? "active" : ""} onClick={() => setTab("vacation")}>
                Férias
              </button>
              <button
                type="button"
                className={tab === "dependents" ? "active" : ""}
                onClick={() => setTab("dependents")}
              >
                Dependentes (
                {
                  data.dependents.filter((d) => d.personId === editing.personId)
                    .length
                }
                )
              </button>
            </div>
            <form className="worker-form" onSubmit={saveEdit}>
              <div className="form-scroll">
                <div className="form-grid">
                  {tab === "person" && (
                    <>
                      <Field
                        wide
                        label="CPF do colaborador · obrigatório"
                        value={form.cpf}
                        set={(v) => setForm({ ...form, cpf: formatCpf(v) })}
                      />
                      <PhotoField
                        value={form.photoDataUrl}
                        set={(v) => setForm({ ...form, photoDataUrl: v })}
                        error={setNotice}
                      />
                      <Field
                        wide
                        label="Nome completo"
                        value={form.name}
                        set={(v) => setForm({ ...form, name: v })}
                      />
                      <Field
                        label="Nascimento"
                        type="date"
                        value={form.birthDate}
                        set={(v) => setForm({ ...form, birthDate: v })}
                      />
                      <Field
                        label="Telefone"
                        value={form.phone}
                        set={(v) => setForm({ ...form, phone: formatPhone(v) })}
                      />
                      <Field
                        wide
                        label="E-mail"
                        type="email"
                        value={form.email}
                        set={(v) => setForm({ ...form, email: v })}
                      />
                      <SelectField
                        label="Sexo"
                        value={form.sex}
                        set={(v) => setForm({ ...form, sex: v })}
                        options={[
                          ["female", "Feminino"],
                          ["male", "Masculino"],
                          ["not_informed", "Não informado"],
                        ]}
                      />
                      <SelectField
                        label="Escolaridade"
                        value={form.education}
                        set={(v) => setForm({ ...form, education: v })}
                        options={[
                          ["illiterate", "Analfabeto"],
                          ["elementary_incomplete", "Fundamental incompleto"],
                          ["elementary_complete", "Fundamental completo"],
                          ["high_school_incomplete", "Médio incompleto"],
                          ["high_school_complete", "Médio completo"],
                          ["higher_incomplete", "Superior incompleto"],
                          ["higher_complete", "Superior completo"],
                          ["postgraduate", "Pós-graduação"],
                        ]}
                      />
                      <SelectField
                        label="Estado civil"
                        value={form.maritalStatus}
                        set={(v) => setForm({ ...form, maritalStatus: v })}
                        options={[
                          ["single", "Solteiro(a)"],
                          ["married", "Casado(a)"],
                          ["stable_union", "União estável"],
                          ["separated", "Separado(a)"],
                          ["divorced", "Divorciado(a)"],
                          ["widowed", "Viúvo(a)"],
                        ]}
                      />
                      <SelectField
                        label="Cor/raça"
                        value={form.raceColor}
                        set={(v) => setForm({ ...form, raceColor: v })}
                        options={[
                          ["white", "Branca"],
                          ["black", "Preta"],
                          ["brown", "Parda"],
                          ["yellow", "Amarela"],
                          ["indigenous", "Indígena"],
                          ["not_informed", "Não informado"],
                        ]}
                      />
                      <label>
                        UF de nascimento
                        <select
                          value={form.birthState}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              birthState: e.target.value,
                              birthCity: "",
                            })
                          }
                        >
                          <option value="">Selecione…</option>
                          {states.map((uf) => (
                            <option key={uf}>{uf}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Município de nascimento
                        <input
                          list="birth-cities-edit"
                          disabled={!form.birthState}
                          placeholder={
                            form.birthState
                              ? "Selecione ou digite…"
                              : "Escolha a UF"
                          }
                          value={form.birthCity}
                          onChange={(e) =>
                            setForm({ ...form, birthCity: e.target.value })
                          }
                        />
                        <datalist id="birth-cities-edit">
                          {editBirthCities.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </label>
                    </>
                  )}
                  {tab === "documents" && (
                    <DocumentFields form={form} setForm={setForm} />
                  )}
                  {tab === "address" && (
                    <>
                      <div className="cep-search wide">
                        <Field
                          label="CEP · informe primeiro"
                          value={form.postalCode}
                          set={(v) =>
                            setForm({ ...form, postalCode: formatCep(v) })
                          }
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => lookupCep("edit")}
                        >
                          Buscar endereço
                        </button>
                        {cepStatus && <small>{cepStatus}</small>}
                      </div>
                      <Field
                        wide
                        label="Endereço"
                        value={form.address}
                        set={(v) => setForm({ ...form, address: v })}
                      />
                      <Field
                        label="Número"
                        value={form.addressNumber}
                        set={(v) => setForm({ ...form, addressNumber: v })}
                      />
                      <Field
                        label="Bairro"
                        value={form.district}
                        set={(v) => setForm({ ...form, district: v })}
                      />
                      <Field
                        label="Cidade"
                        value={form.city}
                        set={(v) => setForm({ ...form, city: v })}
                      />
                      <Field
                        label="UF"
                        value={form.state}
                        set={(v) => setForm({ ...form, state: v })}
                      />
                    </>
                  )}
                  {tab === "contract" && (
                    <>
                      <div className="contract-summary wide">
                        <b>{companyName(editing.companySourceId)}</b>
                        <span>
                          {editing.registrationNumber
                            ? `Matrícula ${editing.registrationNumber}`
                            : editing.legacyCode}
                        </span>
                      </div>
                      <Field
                        label="Data de admissão"
                        type="date"
                        value={form.admissionDate}
                        set={(v) => setForm({ ...form, admissionDate: v })}
                      />
                      <FunctionField
                        functions={functions}
                        role={form.role}
                        cboCode={form.cboCode}
                        set={(role, cboCode) =>
                          setForm({ ...form, role, cboCode })
                        }
                      />
                      <Field
                        label="Horas semanais"
                        type="number"
                        value={form.weeklyHours}
                        set={(v) => setForm({ ...form, weeklyHours: v })}
                      />
                      <Field
                        label="Código do vínculo"
                        value={form.employmentLinkCode}
                        set={(v) =>
                          setForm({ ...form, employmentLinkCode: v })
                        }
                      />
                      <Field
                        wide
                        label="Vínculo"
                        value={form.employmentLinkDescription}
                        set={(v) =>
                          setForm({ ...form, employmentLinkDescription: v })
                        }
                      />
                      <label>
                        Prazo do contrato
                        <select
                          value={form.contractTerm}
                          onChange={(e) =>
                            setForm({ ...form, contractTerm: e.target.value })
                          }
                        >
                          <option value="determined">Prazo determinado</option>
                          <option value="indefinite">Prazo indeterminado</option>
                        </select>
                      </label>
                      <label>
                        Tipo de apontamento
                        <select
                          value={form.paymentType}
                          onChange={(e) =>
                            setForm({ ...form, paymentType: e.target.value })
                          }
                        >
                          <option value="production">Produção</option>
                          <option value="monthly">Mensalista</option>
                        </select>
                      </label>
                      <label>
                        Histórico profissional
                        <select
                          value={form.employmentCondition}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              employmentCondition: e.target.value,
                            })
                          }
                        >
                          <option value="first_job">Primeiro emprego</option>
                          <option value="reemployment">Reemprego</option>
                        </select>
                      </label>
                      <label>
                        Tipo de contrato
                        <select
                          value={form.contractType}
                          onChange={(e) =>
                            setForm({ ...form, contractType: e.target.value })
                          }
                        >
                          <option value="harvest">Safra</option>
                          <option value="offseason">Entressafra</option>
                          <option value="indefinite">
                            Prazo indeterminado
                          </option>
                        </select>
                      </label>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={form.unionMember === "true"}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              unionMember: e.target.checked ? "true" : "false",
                            })
                          }
                        />{" "}
                        Sindicalizado
                      </label>
                      {form.unionMember === "true" && (
                        <>
                          <label className="wide">
                            Sindicato
                            <select
                              required
                              value={form.unionId}
                              onChange={(e) =>
                                setForm({ ...form, unionId: e.target.value })
                              }
                            >
                              <option value="">Selecione…</option>
                              {data.unions
                                .filter(
                                  (u) =>
                                    u.active || String(u.id) === form.unionId,
                                )
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.code} · {u.description} —{" "}
                                    {new Intl.NumberFormat("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    }).format(u.contributionCents / 100)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div className="union-frequency wide">
                            <b>Periodicidade do desconto</b>
                            <label>
                              <input
                                type="radio"
                                name="edit-union-frequency"
                                checked={
                                  form.unionDiscountFrequency === "biweekly"
                                }
                                onChange={() =>
                                  setForm({
                                    ...form,
                                    unionDiscountFrequency: "biweekly",
                                  })
                                }
                              />{" "}
                              Quinzenal · metade em cada folha
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="edit-union-frequency"
                                checked={
                                  form.unionDiscountFrequency !== "biweekly"
                                }
                                onChange={() =>
                                  setForm({
                                    ...form,
                                    unionDiscountFrequency: "monthly",
                                  })
                                }
                              />{" "}
                              Mensal · integral no saldo mensal
                            </label>
                          </div>
                        </>
                      )}
                      {editing.status === "active" ? (
                        <div className="termination-box wide">
                          <Field
                            label="Data do desligamento"
                            type="date"
                            value={form.terminationDate}
                            set={(v) =>
                              setForm({ ...form, terminationDate: v })
                            }
                          />
                          <button
                            type="button"
                            className="danger"
                            onClick={terminate}
                            disabled={saving}
                          >
                            Encerrar contrato
                          </button>
                        </div>
                      ) : (
                        <div className="admission-note wide">
                          Contrato encerrado em{" "}
                          {showDate(editing.terminationDate)}.
                        </div>
                      )}
                    </>
                  )}
                  {tab === "salary" && (
                    <div className="wide"><WorkerHrTabs contractId={editing.id} kind="salary" /></div>
                  )}
                  {tab === "vacation" && (
                    <div className="wide"><WorkerHrTabs contractId={editing.id} kind="vacation" /></div>
                  )}
                  {tab === "dependents" && (
                    <div className="dependents-editor wide">
                      <div className="dependent-list">
                        {data.dependents
                          .filter((d) => d.personId === editing.personId)
                          .map((d) => (
                            <article key={d.id}>
                              <div>
                                <b>{d.name}</b>
                                <small>
                                  {d.dependentType === "child"
                                    ? "Filho(a)"
                                    : d.dependentType}{" "}
                                  · CPF {showCpf(d.cpf)} · Nasc.{" "}
                                  {showDate(d.birthDate)}
                                </small>
                              </div>
                              <span>
                                {d.salaryFamilyEligible
                                  ? "Salário-família"
                                  : "Sem salário-família"}
                              </span>
                              <button
                                type="button"
                                className="table-action"
                                onClick={() =>
                                  setDependentForm({
                                    ...d,
                                    birthCertificate: d.birthCertificate || "",
                                  })
                                }
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() => deleteDependent(d.id)}
                              >
                                Excluir
                              </button>
                            </article>
                          ))}
                      </div>
                      <div className="dependent-form">
                        <h3>
                          {dependentForm.id
                            ? "Editar dependente"
                            : "Novo dependente"}
                        </h3>
                        <div className="form-grid">
                          <label>
                            Tipo de dependente
                            <select
                              value={dependentForm.dependentType}
                              onChange={(e) =>
                                setDependentForm({
                                  ...dependentForm,
                                  dependentType: e.target.value,
                                })
                              }
                            >
                              <option value="child">Filho(a)</option>
                              <option value="spouse">Cônjuge</option>
                              <option value="stepchild">Enteado(a)</option>
                              <option value="father">Pai</option>
                              <option value="mother">Mãe</option>
                              <option value="other">Outro</option>
                            </select>
                          </label>
                          <Field
                            wide
                            label="Nome completo"
                            value={dependentForm.name}
                            set={(v) =>
                              setDependentForm({ ...dependentForm, name: v })
                            }
                          />
                          <Field
                            label="CPF obrigatório"
                            value={dependentForm.cpf}
                            set={(v) =>
                              setDependentForm({
                                ...dependentForm,
                                cpf: formatCpf(v),
                              })
                            }
                          />
                          <Field
                            label="Nascimento"
                            type="date"
                            value={dependentForm.birthDate}
                            set={(v) =>
                              setDependentForm({
                                ...dependentForm,
                                birthDate: v,
                              })
                            }
                          />
                          {dependentForm.dependentType === "child" && (
                            <>
                              <Field
                                wide
                                label="Número da certidão de nascimento"
                                value={dependentForm.birthCertificate}
                                set={(v) =>
                                  setDependentForm({
                                    ...dependentForm,
                                    birthCertificate: v,
                                  })
                                }
                              />
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={dependentForm.vaccinationProof}
                                  onChange={(e) =>
                                    setDependentForm({
                                      ...dependentForm,
                                      vaccinationProof: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Comprovante de vacinação apresentado
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={dependentForm.schoolProof}
                                  onChange={(e) =>
                                    setDependentForm({
                                      ...dependentForm,
                                      schoolProof: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Frequência escolar apresentada
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={dependentForm.disabled}
                                  onChange={(e) =>
                                    setDependentForm({
                                      ...dependentForm,
                                      disabled: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Dependente inválido
                              </label>
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={dependentForm.salaryFamilyEligible}
                                  onChange={(e) =>
                                    setDependentForm({
                                      ...dependentForm,
                                      salaryFamilyEligible: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Considerar para salário-família
                              </label>
                            </>
                          )}
                          <label className="check-field">
                            <input
                              type="checkbox"
                              checked={dependentForm.irrfDependent}
                              onChange={(e) =>
                                setDependentForm({
                                  ...dependentForm,
                                  irrfDependent: e.target.checked,
                                })
                              }
                            />{" "}
                            Dependente para IRRF
                          </label>
                        </div>
                        <div className="actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setDependentForm({
                                id: 0,
                                dependentType: "child",
                                name: "",
                                cpf: "",
                                birthDate: "",
                                disabled: false,
                                birthCertificate: "",
                                vaccinationProof: false,
                                schoolProof: false,
                                salaryFamilyEligible: true,
                                irrfDependent: true,
                              })
                            }
                          >
                            Limpar
                          </button>
                          <button
                            type="button"
                            className="primary"
                            disabled={saving}
                            onClick={saveDependent}
                          >
                            Salvar dependente
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <Notice text={notice} />
              </div>
              <div className="sticky-actions">
                <Actions
                  saving={saving}
                  cancel={() => setEditing(null)}
                  label="Salvar alterações"
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
function FunctionField({
  functions,
  role,
  cboCode,
  set,
}: {
  functions: JobFunction[];
  role?: string;
  cboCode?: string;
  set: (role: string, cboCode: string) => void;
}) {
  const select = (value: string) => {
    const fn = functions.find((item) => String(item.id) === value);
    if (!fn) return set("", "");
    set(fn.local_description || fn.official_description, fn.cbo_code);
  };
  const selected =
    functions.find(
      (item) =>
        item.cbo_code === cboCode &&
        (item.local_description || item.official_description) === role,
    )?.id || "";
  return (
    <>
      <label className="wide">
        Função
        <select
          value={selected}
          onChange={(event) => select(event.target.value)}
        >
          <option value="">Selecione uma função cadastrada…</option>
          {functions
            .filter((item) => item.active !== false)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.local_description || item.official_description}
              </option>
            ))}
        </select>
      </label>
      <label>
        CBO
        <input value={cboCode || ""} readOnly placeholder="Preenchido pela função" />
      </label>
    </>
  );
}
function Field({
  label,
  value,
  set,
  type = "text",
  wide = false,
}: {
  label: string;
  value?: string;
  set: (v: string) => void;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      {label}
      <input
        type={type}
        value={value || ""}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
function DocumentFields({
  form,
  setForm,
}: {
  form: any;
  setForm: (v: any) => void;
}) {
  const set = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  const digits = (value: string, max: number) =>
    onlyDigits(value).slice(0, max);
  return (
    <div className="document-sections wide">
      <div className="document-guidance">
        <b>Documentação cadastral</b>
        <span>
          <strong>CPF</strong> é obrigatório. Os demais documentos são
          complementares ou condicionais à função e à documentação apresentada.
        </span>
      </div>
      <section>
        <h3>Identificação principal</h3>
        <div className="form-grid">
          <Field
            label="CPF · obrigatório"
            value={form.cpf}
            set={(v) => set("cpf", formatCpf(v))}
          />
          <Field
            label="PIS/PASEP · legado"
            value={form.pis}
            set={(v) => set("pis", formatPis(v))}
          />
        </div>
      </section>
      <section>
        <h3>RG / documento de identidade</h3>
        <div className="form-grid">
          <Field
            label="Número"
            value={form.identityNumber}
            set={(v) => set("identityNumber", v)}
          />
          <Field
            label="Órgão emissor"
            value={form.identityIssuer}
            set={(v) => set("identityIssuer", v.toUpperCase().slice(0, 12))}
          />
          <label>
            UF de emissão
            <select
              value={form.identityState || ""}
              onChange={(e) => set("identityState", e.target.value)}
            >
              <option value="">Selecione…</option>
              {states.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </label>
          <Field
            label="Data de emissão"
            type="date"
            value={form.identityIssueDate}
            set={(v) => set("identityIssueDate", v)}
          />
        </div>
      </section>
      <section>
        <h3>Carteira de Trabalho</h3>
        <p className="document-hint">
          Na CTPS Digital, o CPF é o identificador principal. Estes campos
          preservam documentos físicos e históricos.
        </p>
        <div className="form-grid">
          <Field
            label="Número da CTPS"
            value={form.ctpsNumber}
            set={(v) => set("ctpsNumber", digits(v, 12))}
          />
          <Field
            label="Série"
            value={form.ctpsSeries}
            set={(v) => set("ctpsSeries", v.slice(0, 8))}
          />
          <label>
            UF
            <select
              value={form.ctpsState || ""}
              onChange={(e) => set("ctpsState", e.target.value)}
            >
              <option value="">Selecione…</option>
              {states.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </label>
          <Field
            label="Data de emissão"
            type="date"
            value={form.ctpsIssueDate}
            set={(v) => set("ctpsIssueDate", v)}
          />
        </div>
      </section>
      <section>
        <h3>Título de eleitor</h3>
        <p className="document-hint">
          Cadastro complementar; não é obrigatório para a admissão no eSocial.
        </p>
        <div className="form-grid">
          <Field
            label="Número do título"
            value={form.voterTitleNumber}
            set={(v) => set("voterTitleNumber", digits(v, 12))}
          />
          <Field
            label="Zona"
            value={form.voterZone}
            set={(v) => set("voterZone", digits(v, 4))}
          />
          <Field
            label="Seção"
            value={form.voterSection}
            set={(v) => set("voterSection", digits(v, 4))}
          />
        </div>
      </section>
      <section>
        <h3>CNH · quando aplicável à função</h3>
        <div className="form-grid">
          <Field
            label="Número da CNH"
            value={form.cnhNumber}
            set={(v) => set("cnhNumber", digits(v, 11))}
          />
          <Field
            label="Categoria"
            value={form.cnhCategory}
            set={(v) =>
              set(
                "cnhCategory",
                v
                  .toUpperCase()
                  .replace(/[^A-E]/g, "")
                  .slice(0, 5),
              )
            }
          />
          <Field
            label="Primeira habilitação"
            type="date"
            value={form.cnhFirstIssueDate}
            set={(v) => set("cnhFirstIssueDate", v)}
          />
          <Field
            label="Validade"
            type="date"
            value={form.cnhExpirationDate}
            set={(v) => set("cnhExpirationDate", v)}
          />
        </div>
      </section>
      <section>
        <h3>Documento militar · quando aplicável</h3>
        <div className="form-grid">
          <Field
            wide
            label="Certificado de reservista / documento militar"
            value={form.militaryCertificate}
            set={(v) => set("militaryCertificate", v.slice(0, 30))}
          />
        </div>
      </section>
    </div>
  );
}
function SelectField({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value?: string;
  set: (v: string) => void;
  options: string[][];
}) {
  return (
    <label>
      {label}
      <select value={value || ""} onChange={(e) => set(e.target.value)}>
        <option value="">Selecione…</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
async function preparePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("A foto original deve ter no máximo 8 MB.");
  const bitmap = await createImageBitmap(file),
    size = 640,
    scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
function PhotoField({
  value,
  set,
  error,
}: {
  value?: string;
  set: (v: string) => void;
  error: (v: string) => void;
}) {
  return (
    <div className="photo-field wide">
      <div className="photo-preview">
        {value ? <img src={value} alt="Foto do colaborador" /> : <span>♙</span>}
      </div>
      <div>
        <b>Foto do colaborador</b>
        <p>JPG, PNG ou WebP. A imagem será ajustada automaticamente.</p>
        <label className="secondary photo-button">
          Escolher foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                set(await preparePhoto(file));
                error("");
              } catch (err) {
                error(
                  err instanceof Error
                    ? err.message
                    : "Não foi possível carregar a foto.",
                );
              }
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            className="table-action"
            onClick={() => set("")}
          >
            Remover foto
          </button>
        )}
      </div>
    </div>
  );
}
function ModalHead({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="modal-head">
      <div>
        <small>FICHA DO COLABORADOR</small>
        <h2>{title}</h2>
      </div>
      <button onClick={close}>×</button>
    </div>
  );
}
function Notice({ text }: { text: string }) {
  return text ? (
    <div
      className={`form-notice ${text.includes("sucesso") || text.includes("criada") ? "ok" : "error"}`}
    >
      {text}
    </div>
  ) : null;
}
function Actions({
  saving,
  cancel,
  label,
}: {
  saving: boolean;
  cancel: () => void;
  label: string;
}) {
  return (
    <div className="actions">
      <button type="button" className="secondary" onClick={cancel}>
        Cancelar
      </button>
      <button className="primary" disabled={saving}>
        {saving ? "Salvando…" : label}
      </button>
    </div>
  );
}
