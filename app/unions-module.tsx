"use client";
import { useEffect, useRef, useState } from "react";
import "./unions.css";
type Union = {
  id: number;
  code: string;
  cnpj: string | null;
  description: string;
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
  cnpjCheckedAt: string | null;
  contributionCents: number;
  active: boolean;
  rates: Array<{
    id: number;
    effectiveFrom: string;
    contributionCents: number;
  }>;
};
const empty = {
    code: "",
    cnpj: "",
    description: "",
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
    cnpjCheckedAt: "",
    contribution: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    active: true,
  },
  money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100),
  digits = (value: string) => value.replace(/\D/g, ""),
  formatCnpj = (value: string) =>
    digits(value)
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
export default function UnionsModule() {
  const [rows, setRows] = useState<Union[]>([]),
    [editing, setEditing] = useState<Union | null | undefined>(),
    [form, setForm] = useState(empty),
    [message, setMessage] = useState(""),
    [lookupBusy, setLookupBusy] = useState(false),
    [cnpjStatus, setCnpjStatus] = useState(""),
    lastCnpjLookup = useRef("");
  const duplicateCode = rows.find(
    (row) =>
      row.code.toUpperCase() === form.code.trim().toUpperCase() &&
      row.id !== editing?.id,
  );
  const load = () =>
    fetch("/api/unions")
      .then((r) => r.json())
      .then((b) => setRows(b.unions || []));
  useEffect(() => {
    load();
  }, []);
  const lookupCnpj = async (cnpj: string) => {
    setLookupBusy(true);
    setCnpjStatus("Consultando dados cadastrais…");
    try {
      const response = await fetch(`/api/cnpj?cnpj=${cnpj}`),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setForm((current) => ({
        ...current,
        cnpj: formatCnpj(data.cnpj),
        description: data.tradeName || data.legalName || current.description,
        legalName: data.legalName,
        tradeName: data.tradeName,
        registrationStatus: data.registrationStatus,
        email: data.email,
        phone: data.phone,
        postalCode: data.postalCode,
        address: data.address,
        addressNumber: data.addressNumber,
        addressComplement: data.addressComplement,
        district: data.district,
        city: data.city,
        state: data.state,
        cnpjCheckedAt: data.checkedAt,
      }));
      setCnpjStatus("✓ Dados cadastrais preenchidos automaticamente.");
    } catch (error) {
      setCnpjStatus(
        error instanceof Error ? error.message : "Falha na consulta do CNPJ.",
      );
    } finally {
      setLookupBusy(false);
    }
  };
  useEffect(() => {
    const cnpj = digits(form.cnpj);
    if (cnpj.length < 14) {
      lastCnpjLookup.current = "";
      setCnpjStatus("");
      return;
    }
    if (cnpj === lastCnpjLookup.current) return;
    lastCnpjLookup.current = cnpj;
    const timer = window.setTimeout(() => lookupCnpj(cnpj), 500);
    return () => window.clearTimeout(timer);
    // A consulta deve reagir somente ao CNPJ totalmente digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cnpj]);
  const remove = async (id: number) => {
    if (!confirm("Excluir este sindicato?")) return;
    const response = await fetch("/api/unions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      }),
      data = await response.json();
    setMessage(data.message || data.error);
    if (response.ok) {
      if (editing?.id === id) setEditing(undefined);
      load();
    }
  };
  const save = async (action = "save") => {
    if (duplicateCode)
      return setMessage(
        `O código ${form.code.toUpperCase()} já está cadastrado.`,
      );
    const r = await fetch("/api/unions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "delete"
            ? { action, id: editing?.id }
            : {
                ...form,
                id: editing?.id,
                contribution: Number(form.contribution),
              },
        ),
      }),
      b = await r.json();
    setMessage(b.message || b.error);
    if (r.ok) {
      setEditing(undefined);
      load();
    }
  };
  return (
    <section className="module unions-module">
      <div className="module-hero">
        <span>♢</span>
        <div>
          <small>CADASTROS AUXILIARES</small>
          <h2>Sindicatos</h2>
          <p>
            Código próprio e contribuição aplicada somente aos colaboradores
            associados.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(empty);
            lastCnpjLookup.current = "";
            setCnpjStatus("");
          }}
        >
          ＋ Novo sindicato
        </button>
      </div>
      {message && <div className="inline-notice">{message}</div>}
      <div className="table-scroll union-list">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>CNPJ</th>
              <th>Descrição</th>
              <th>Contribuição</th>
              <th>Vigência</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <b>{row.code}</b>
                </td>
                <td>{row.cnpj ? formatCnpj(row.cnpj) : "Não informado"}</td>
                <td>{row.description}</td>
                <td>
                  {money(
                    row.rates.at(-1)?.contributionCents ??
                      row.contributionCents,
                  )}
                </td>
                <td>
                  {row.rates
                    .at(-1)
                    ?.effectiveFrom.split("-")
                    .reverse()
                    .join("/") || "Valor legado"}
                </td>
                <td>{row.active ? "Ativo" : "Inativo"}</td>
                <td>
                  <button
                    className="table-action"
                    onClick={() => {
                      setEditing(row);
                      setForm({
                        code: row.code,
                        cnpj: formatCnpj(row.cnpj || ""),
                        description: row.description,
                        legalName: row.legalName || "",
                        tradeName: row.tradeName || "",
                        registrationStatus: row.registrationStatus || "",
                        email: row.email || "",
                        phone: row.phone || "",
                        postalCode: row.postalCode || "",
                        address: row.address || "",
                        addressNumber: row.addressNumber || "",
                        addressComplement: row.addressComplement || "",
                        district: row.district || "",
                        city: row.city || "",
                        state: row.state || "",
                        cnpjCheckedAt: row.cnpjCheckedAt || "",
                        contribution: String(
                          (row.rates.at(-1)?.contributionCents ??
                            row.contributionCents) / 100,
                        ),
                        effectiveFrom:
                          row.rates.at(-1)?.effectiveFrom ||
                          new Date().toISOString().slice(0, 10),
                        active: row.active,
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="table-action danger-link"
                    onClick={() => remove(row.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && (
        <div className="union-editor panel">
          <div className="union-form">
            <div className="modal-head">
              <div>
                <small>CADASTRO DE SINDICATO</small>
                <h2>{editing ? "Editar sindicato" : "Novo sindicato"}</h2>
              </div>
              <button onClick={() => setEditing(undefined)}>×</button>
            </div>
            <div className="form-grid">
              <label>
                Código
                <input
                  required
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                />
                {duplicateCode && (
                  <small className="field-error">Código já cadastrado.</small>
                )}
              </label>
              <div className="cnpj-lookup wide">
                <label>
                  CNPJ · obrigatório
                  <input
                    required
                    value={form.cnpj}
                    onChange={(e) =>
                      setForm({ ...form, cnpj: formatCnpj(e.target.value) })
                    }
                    placeholder="00.000.000/0000-00"
                  />
                  <small
                    className={
                      cnpjStatus.startsWith("✓") ? "lookup-ok" : "lookup-status"
                    }
                  >
                    {lookupBusy ? "Consultando dados cadastrais…" : cnpjStatus}
                  </small>
                </label>
              </div>
              <label className="wide">
                Descrição
                <input
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label className="wide">
                Razão social
                <input
                  value={form.legalName}
                  onChange={(e) =>
                    setForm({ ...form, legalName: e.target.value })
                  }
                />
              </label>
              <label>
                Nome fantasia
                <input
                  value={form.tradeName}
                  onChange={(e) =>
                    setForm({ ...form, tradeName: e.target.value })
                  }
                />
              </label>
              <label>
                Situação cadastral
                <input
                  value={form.registrationStatus}
                  onChange={(e) =>
                    setForm({ ...form, registrationStatus: e.target.value })
                  }
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Telefone
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                CEP
                <input
                  value={form.postalCode}
                  onChange={(e) =>
                    setForm({ ...form, postalCode: e.target.value })
                  }
                />
              </label>
              <label className="wide">
                Endereço
                <input
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                />
              </label>
              <label>
                Número
                <input
                  value={form.addressNumber}
                  onChange={(e) =>
                    setForm({ ...form, addressNumber: e.target.value })
                  }
                />
              </label>
              <label>
                Complemento
                <input
                  value={form.addressComplement}
                  onChange={(e) =>
                    setForm({ ...form, addressComplement: e.target.value })
                  }
                />
              </label>
              <label>
                Bairro
                <input
                  value={form.district}
                  onChange={(e) =>
                    setForm({ ...form, district: e.target.value })
                  }
                />
              </label>
              <label>
                Cidade
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label>
                UF
                <input
                  maxLength={2}
                  value={form.state}
                  onChange={(e) =>
                    setForm({ ...form, state: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                Desconto mensal (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.contribution}
                  onChange={(e) =>
                    setForm({ ...form, contribution: e.target.value })
                  }
                />
              </label>
              <label>
                Vigente a partir de
                <input
                  type="date"
                  required={Number(form.contribution) > 0}
                  value={form.effectiveFrom}
                  onChange={(e) =>
                    setForm({ ...form, effectiveFrom: e.target.value })
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />{" "}
                Sindicato ativo
              </label>
            </div>
            {editing?.rates?.length ? (
              <div className="union-history">
                <b>Histórico de valores</b>
                {editing.rates
                  .slice()
                  .reverse()
                  .map((rate) => (
                    <span key={rate.id}>
                      {rate.effectiveFrom.split("-").reverse().join("/")} ·{" "}
                      {money(rate.contributionCents)}
                    </span>
                  ))}
              </div>
            ) : null}
            <div className="actions">
              {editing && (
                <button className="danger" onClick={() => remove(editing.id)}>
                  Excluir
                </button>
              )}
              <button
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                Cancelar
              </button>
              <button className="primary" onClick={() => save()}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
