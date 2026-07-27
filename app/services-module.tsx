"use client";
import { useEffect, useMemo, useState } from "react";
import "./services.css";
type S = {
  id: number;
  sourceId: number;
  description: string;
  groupName: string | null;
  unitName: string | null;
  entryType: "earning" | "deduction";
  nature?: "earning" | "deduction";
  fgts: boolean;
  fgts13: boolean;
  inss: boolean;
  inss13: boolean;
  irrf: boolean;
  rais: boolean;
  affectsDsr: boolean;
  active: boolean;
  usageCount: number;
  [k: string]: unknown;
};
const natureOf = (service: Partial<S> & Record<string, unknown>) => {
  const raw = String(
    service.nature ?? service.entryType ?? service.natureza ?? "earning",
  )
    .trim()
    .toLowerCase();
  return ["deduction", "desconto", "discount", "d", "2"].includes(raw)
    ? "deduction"
    : "earning";
};
const empty = {
  description: "",
  groupName: "",
  unitName: "",
  entryType: "earning",
  fgts: false,
  fgts13: false,
  inss: false,
  inss13: false,
  irrf: false,
  rais: false,
  affectsDsr: true,
  active: true,
};
export default function ServicesModule() {
  const [rows, setRows] = useState<S[]>([]),
    [centers, setCenters] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [sortBy, setSortBy] = useState<"alpha" | "numeric">("numeric"),
    [entryFilter, setEntryFilter] = useState<"all" | "earning" | "deduction">(
      "all",
    ),
    [edit, setEdit] = useState<S | null | undefined>(),
    [form, setForm] = useState<any>(empty),
    [msg, setMsg] = useState("");
  const load = () =>
    fetch("/api/services")
      .then((r) => r.json())
      .then((b) => setRows(b.services || []));
  useEffect(() => {
    load();
    fetch("/api/hr").then((r) => r.json()).then((b) => setCenters(b.centers || []));
  }, []);
  const shown = useMemo(() => {
    const filtered = rows.filter(
      (s) =>
        (entryFilter === "all" || natureOf(s) === entryFilter) &&
        `${s.description} ${s.groupName}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    );
    return filtered.sort((a, b) =>
      sortBy === "numeric"
        ? a.sourceId - b.sourceId
        : a.description.localeCompare(b.description, "pt-BR", {
            sensitivity: "base",
          }),
    );
  }, [rows, q, sortBy, entryFilter]);
  const save = async (action = "save") => {
    const r = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "delete"
            ? { action, id: edit?.id }
            : {
                ...form,
                entryType: natureOf(form),
                nature: natureOf(form),
                id: edit?.id,
              },
        ),
      }),
      b = await r.json();
    if (!r.ok) return setMsg(b.error);
    setEdit(undefined);
    setMsg("Serviço salvo.");
    load();
  };
  const flags = [
    ["fgts", "FGTS mensal"],
    ["fgts13", "FGTS sobre 13º"],
    ["inss", "INSS mensal"],
    ["inss13", "INSS sobre 13º"],
    ["irrf", "IRRF mensal"],
    ["rais", "Informar na RAIS"],
    ["affectsDsr", "Compõe média do DSR"],
    ["active", "Serviço ativo"],
  ];
  return (
    <section className="module services-module">
      <div className="module-hero">
        <span>⚙</span>
        <div>
          <small>RUBRICAS E INCIDÊNCIAS</small>
          <h2>Cadastro de serviços</h2>
          <p>
            Parâmetros tributários editáveis conforme a natureza de cada verba.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEdit(null);
            setForm(empty);
          }}
        >
          ＋ Novo serviço
        </button>
      </div>
      {msg && <div className="inline-notice">{msg}</div>}
      <div className="service-toolbar">
        <input
          placeholder="Buscar serviço…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label>
          Ordenar por
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "alpha" | "numeric")}
          >
            <option value="numeric">Sequência numérica</option>
            <option value="alpha">Ordem alfabética</option>
          </select>
        </label>
        <b>{shown.length} serviços</b>
      </div>
      <div
        className="service-tabs"
        role="tablist"
        aria-label="Natureza dos serviços"
      >
        {(
          [
            ["all", "Todos"],
            ["earning", "Proventos"],
            ["deduction", "Descontos"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={entryFilter === value}
            className={entryFilter === value ? "active" : ""}
            onClick={() => setEntryFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="table-scroll">
        <table className="data-table service-table">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Centro de custo</th>
              <th>Unidade</th>
              <th>Incidências</th>
              <th>Uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>
                  <small>SRV {s.sourceId}</small>
                  <b>{s.description}</b>
                </td>
                <td>{s.groupName || "—"}</td>
                <td>{s.unitName || "—"}</td>
                <td>
                  <div className="incidences">
                    {flags
                      .slice(0, 7)
                      .filter(([k]) => s[k])
                      .map(([, l]) => (
                        <i key={l}>{l}</i>
                      ))}
                  </div>
                </td>
                <td>{s.usageCount} lanç.</td>
                <td>
                  <button
                    className="table-action"
                    onClick={() => {
                      setEdit(s);
                      setForm({ ...s, entryType: natureOf(s) });
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit !== undefined && (
        <div className="modal-backdrop">
          <div className="modal service-modal">
            <div className="modal-head">
              <div>
                <small>PARÂMETROS LEGAIS</small>
                <h2>{edit ? "Editar serviço" : "Novo serviço"}</h2>
              </div>
              <button onClick={() => setEdit(undefined)}>×</button>
            </div>
            <div className="form-grid">
              <label className="wide">
                Descrição
                <input
                  value={form.description || ""}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Centro de custo
                <select value={form.groupSourceId || ""} onChange={(e) => {
                  const selected=centers.find((c:any)=>String(c.id)===e.target.value);
                  setForm({ ...form, groupSourceId:e.target.value, groupName:selected?.description || "" });
                }}>
                  <option value="">Sem centro de custo</option>
                  {centers.filter((c:any)=>c.active).map((c:any)=><option key={c.id} value={c.id}>{c.description}</option>)}
                </select>
              </label>
              <label>
                Unidade
                <input
                  value={form.unitName || ""}
                  onChange={(e) =>
                    setForm({ ...form, unitName: e.target.value })
                  }
                />
              </label>
              <label>
                Natureza
                <select
                  value={natureOf(form)}
                  onChange={(e) =>
                    setForm({ ...form, entryType: e.target.value })
                  }
                >
                  <option value="earning">Provento</option>
                  <option value="deduction">Desconto</option>
                </select>
              </label>
            </div>
            <div className="check-grid">
              {flags.map(([k, l]) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={!!form[k]}
                    onChange={(e) =>
                      setForm({ ...form, [k]: e.target.checked })
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
            <div className="actions">
              {edit && (
                <button
                  className="danger"
                  disabled={edit.usageCount > 0}
                  onClick={() =>
                    confirm("Excluir este serviço?") && save("delete")
                  }
                >
                  Excluir
                </button>
              )}
              <button className="secondary" onClick={() => setEdit(undefined)}>
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
