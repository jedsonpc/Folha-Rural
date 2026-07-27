"use client";
import { useEffect, useRef, useState } from "react";
import "./companies-module.css";

type Company = {
  id: number;
  sourceId: number;
  name: string;
  document: string | null;
  documentType: string;
  ownerCpf: string | null;
  cei: string | null;
  legalName: string | null;
  tradeName: string | null;
  registrationStatus: string | null;
  email: string | null;
  phone: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  checkedAt: string | null;
  active: boolean;
  contractsCount: number;
  entriesCount: number;
};
const empty = {
  id: 0,
  documentType: "cnpj",
  document: "",
  ownerCpf: "",
  cei: "",
  name: "",
  legalName: "",
  tradeName: "",
  registrationStatus: "",
  email: "",
  phone: "",
  postalCode: "",
  address: "",
  addressNumber: "",
  addressComplement: "",
  district: "",
  city: "",
  state: "",
  checkedAt: "",
  active: true,
};
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 14);
const mask = (v: string) =>
  digits(v).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
const cpfMask = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const ceiMask = (v: string) =>
  v.replace(/\D/g, "").slice(0, 12).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{5})(\d{1,2})$/, "$1/$2");
const cepMask = (v: string) =>
  v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

export default function CompaniesModule({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Company[]>([]),
    [form, setForm] = useState({ ...empty }),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    lookup = useRef(""),
    cepLookup = useRef(""),
    touched = useRef(new Set<string>()),
    editorGeneration = useRef(0),
    formElement = useRef<HTMLFormElement>(null);
  const load = () =>
    fetch(`/api/companies?fresh=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then((r) => r.json())
      .then((b) => {
        if (b.error) throw new Error(b.error);
        setRows(b.companies || []);
      })
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const document = digits(form.document);
    if (!editing || form.documentType !== "cnpj" || document.length !== 14 || lookup.current === document)
      return;
    lookup.current = document;
    const generation = editorGeneration.current;
    setMessage("Consultando dados públicos do CNPJ…");
    const timer = window.setTimeout(() => {
      fetch(`/api/cnpj?cnpj=${document}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          if (generation !== editorGeneration.current) return;
          setForm((f) => ({
            ...f,
            document,
            name: touched.current.has("name") ? f.name : b.tradeName || b.legalName || f.name,
            legalName: touched.current.has("legalName") ? f.legalName : b.legalName || f.legalName,
            tradeName: touched.current.has("tradeName") ? f.tradeName : b.tradeName || f.tradeName,
            registrationStatus: touched.current.has("registrationStatus") ? f.registrationStatus : b.registrationStatus || "",
            email: touched.current.has("email") ? f.email : b.email || f.email,
            phone: touched.current.has("phone") ? f.phone : b.phone || f.phone,
            postalCode: touched.current.has("postalCode") ? f.postalCode : b.postalCode || f.postalCode,
            address: touched.current.has("address") ? f.address : b.address || f.address,
            addressNumber: touched.current.has("addressNumber") ? f.addressNumber : b.addressNumber || f.addressNumber,
            addressComplement: touched.current.has("addressComplement") ? f.addressComplement : b.addressComplement || f.addressComplement,
            district: touched.current.has("district") ? f.district : b.district || f.district,
            city: touched.current.has("city") ? f.city : b.city || f.city,
            state: touched.current.has("state") ? f.state : b.state || f.state,
            checkedAt: b.checkedAt || "",
          }));
          setMessage("Dados do CNPJ preenchidos. Revise e complemente se necessário.");
        })
        .catch((e) => setMessage(e.message));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.document, form.documentType, editing]);
  useEffect(() => {
    const cep = form.postalCode.replace(/\D/g, "").slice(0, 8);
    if (!editing || cep.length !== 8 || cepLookup.current === cep) return;
    cepLookup.current = cep;
    const generation = editorGeneration.current;
    setMessage("Consultando endereço pelo CEP…");
    const timer = window.setTimeout(() => {
      fetch(`/api/cep?cep=${cep}`)
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          if (generation !== editorGeneration.current) return;
          setForm((f) => ({
            ...f,
            postalCode: cep,
            address: touched.current.has("address") ? f.address : b.address || f.address,
            addressComplement: touched.current.has("addressComplement") ? f.addressComplement : b.addressComplement || f.addressComplement,
            district: touched.current.has("district") ? f.district : b.district || f.district,
            city: touched.current.has("city") ? f.city : b.city || f.city,
            state: touched.current.has("state") ? f.state : b.state || f.state,
          }));
          setMessage(
            "Endereço localizado. Informe o número e complemente ou corrija os dados se necessário.",
          );
        })
        .catch((e) => setMessage(e.message));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.postalCode, editing]);
  const set = (key: string, value: string | boolean) => {
    touched.current.add(key);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const edit = (row?: Company) => {
    editorGeneration.current += 1;
    touched.current.clear();
    const importedDigits = row ? digits(row.document || "") : "",
      legacyCei =
        Boolean(row) &&
        importedDigits.length === 12 &&
        row?.documentType !== "caepf";
    // Não consulte novamente ao reabrir: isso preserva os complementos salvos.
    // Uma nova busca só ocorrerá quando CNPJ ou CEP forem realmente alterados.
    lookup.current = row && !legacyCei ? importedDigits : "";
    cepLookup.current = row
      ? String(row.postalCode || "").replace(/\D/g, "").slice(0, 8)
      : "";
    const initial = row
      ? (Object.fromEntries(
          Object.entries({ ...empty, ...row }).map(([k, v]) => [k, v ?? ""]),
        ) as typeof empty)
      : { ...empty };
    if (legacyCei) {
      initial.documentType = "caepf";
      initial.document = "";
      initial.cei = importedDigits;
    }
    setForm(initial);
    setMessage(
      legacyCei
        ? "O número importado foi identificado como CEI e transferido para o campo correto. Informe o CAEPF de 14 dígitos e o CPF válido do titular antes de salvar."
        : "",
    );
    setEditing(true);
  };
  async function save() {
    editorGeneration.current += 1;
    const visible = formElement.current
      ? Object.fromEntries(new FormData(formElement.current).entries())
      : {};
    const payload = {
      action: "save",
      ...form,
      ...visible,
      id: form.id,
      document: digits(String(visible.document ?? form.document)),
      ownerCpf: String(visible.ownerCpf ?? form.ownerCpf).replace(/\D/g, ""),
      cei: String(visible.cei ?? form.cei).replace(/\D/g, ""),
      postalCode: String(visible.postalCode ?? form.postalCode).replace(/\D/g, ""),
      active: visible.active === "true",
    };
    setLoading(true);
    setMessage("Gravando e conferindo os dados no banco…");
    try {
      const response = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        body = await response.json();
      if (!response.ok)
        return setMessage(
          `Não foi possível gravar: ${body.error || "verifique os campos obrigatórios."}`,
        );
      if (!body.company)
        return setMessage(
          "O banco não confirmou a gravação. Os dados continuam abertos para nova tentativa.",
        );
      const saved = body.company as Company;
      setForm(
        Object.fromEntries(
          Object.entries({ ...empty, ...saved }).map(([key, value]) => [
            key,
            value ?? "",
          ]),
        ) as typeof empty,
      );
      setRows((current) => {
        const next = current.some((row) => row.id === saved.id)
          ? current.map((row) =>
              row.id === saved.id ? { ...row, ...saved } : row,
            )
          : [...current, { ...saved, contractsCount: 0, entriesCount: 0 }];
        return next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      setMessage(
        "✓ Dados gravados e conferidos no banco. Você já pode concluir e voltar à lista.",
      );
      onChanged();
      await load();
    } catch (error) {
      setMessage(
        `Não foi possível gravar: ${
          error instanceof Error ? error.message : "falha de comunicação local."
        }`,
      );
    } finally {
      setLoading(false);
    }
  }
  async function remove(row: Company) {
    if (!confirm(`Excluir definitivamente a empresa ${row.name}?`)) return;
    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: row.id }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error);
    await load();
    onChanged();
  }
  if (editing)
    return (
      <section className="company-editor">
        <div className="company-editor-head">
          <div><small>CADASTRO</small><h2>{form.id ? "Editar empresa" : "Nova empresa"}</h2></div>
          <button onClick={() => setEditing(false)}>Concluir e voltar</button>
        </div>
        <form
          ref={formElement}
          className="company-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>Documento<select name="documentType" value={form.documentType} onChange={(e) => set("documentType", e.target.value)}><option value="cnpj">CNPJ</option><option value="caepf">CAEPF</option></select></label>
          <label>Número<input name="document" autoFocus value={mask(form.document)} onChange={(e) => set("document", digits(e.target.value))} placeholder="00.000.000/0000-00" /></label>
          {form.documentType === "caepf" && <>
            <label>CPF do titular<input name="ownerCpf" value={cpfMask(form.ownerCpf)} onChange={(e) => set("ownerCpf", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="000.000.000-00" inputMode="numeric" /></label>
            <label>CEI<input name="cei" value={ceiMask(form.cei)} onChange={(e) => set("cei", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="00.000.00000/00" inputMode="numeric" /></label>
          </>}
          <label className="wide">Nome de exibição<input name="name" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
          {form.documentType === "caepf" && <p className="wide company-note">A consulta pública automática do CAEPF não está disponível sem acesso autenticado à Receita Federal. O número é validado e os demais dados podem ser preenchidos e editados normalmente.</p>}
          <label className="wide">Razão social / titular<input name="legalName" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} /></label>
          <label>Nome fantasia<input name="tradeName" value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} /></label>
          <label>Situação cadastral<input name="registrationStatus" value={form.registrationStatus} onChange={(e) => set("registrationStatus", e.target.value)} /></label>
          <label>E-mail<input name="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label>Telefone<input name="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label>CEP<input name="postalCode" value={cepMask(form.postalCode)} onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000-000" inputMode="numeric" /></label>
          <label className="wide">Endereço<input name="address" value={form.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label>Número<input name="addressNumber" value={form.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} /></label>
          <label>Complemento<input name="addressComplement" value={form.addressComplement} onChange={(e) => set("addressComplement", e.target.value)} /></label>
          <label>Bairro<input name="district" value={form.district} onChange={(e) => set("district", e.target.value)} /></label>
          <label>Cidade<input name="city" value={form.city} onChange={(e) => set("city", e.target.value)} /></label>
          <label>UF<input name="state" maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} /></label>
          <label className="check"><input name="active" value="true" type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Empresa ativa</label>
        </form>
        {message && <p className="company-message" role="status">{message}</p>}
        <div className="company-actions"><button onClick={() => setEditing(false)}>Cancelar</button><button className="primary" disabled={loading} onClick={save}>{loading ? "Salvando…" : "Salvar empresa"}</button></div>
      </section>
    );
  return (
    <section className="companies-module">
      <div className="companies-head"><div><small>CADASTRO EMPRESARIAL</small><h2>{rows.length} empresas cadastradas</h2></div><button className="primary" onClick={() => edit()}>＋ Nova empresa</button></div>
      {message && <p className="company-message">{message}</p>}
      <div className="company-list">
        {rows.map((row) => <article key={row.id}><div className="company-id"><span>{row.name.slice(0, 2).toUpperCase()}</span><div><h3>{row.name}</h3><p>{row.documentType?.toUpperCase()} {mask(row.document || "")}</p></div></div><div className="company-location"><b>{row.city || "Cidade não informada"}{row.state ? ` / ${row.state}` : ""}</b><small>{row.contractsCount} contratos · {row.entriesCount} lançamentos</small></div><span className={row.active ? "status active" : "status"}>{row.active ? "Ativa" : "Inativa"}</span><div className="row-actions"><button onClick={() => edit(row)}>Editar</button><button disabled={Boolean(row.contractsCount || row.entriesCount)} title={row.contractsCount || row.entriesCount ? "Há histórico vinculado" : "Excluir"} onClick={() => remove(row)}>Excluir</button></div></article>)}
        {!rows.length && <div className="empty-company">Nenhuma empresa cadastrada.</div>}
      </div>
    </section>
  );
}
