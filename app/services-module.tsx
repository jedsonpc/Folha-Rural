"use client";
import { useEffect, useMemo, useState } from "react";
import "./services.css";
type S = {
  id: number;
  sourceId: number;
  description: string;
  groupName: string | null;
  unitName: string | null;
  entryType: "earning" | "deduction" | "special";
  nature?: "earning" | "deduction" | "special";
  formulaCode?: string | null;
  fgts: boolean;
  fgts13: boolean;
  inss: boolean;
  inss13: boolean;
  irrf: boolean;
  rais: boolean;
  affectsDsr: boolean;
  composesProductionAverage: boolean;
  active: boolean;
  usageCount: number;
  [k: string]: unknown;
};
const natureOf = (service: Partial<S> & Record<string, unknown>) => {
  const raw = String(
    service.entryType ?? service.nature ?? service.natureza ?? "earning",
  )
    .trim()
    .toLowerCase();
  if (["special", "especial", "e", "3"].includes(raw)) return "special";
  return ["deduction", "desconto", "discount", "d", "2"].includes(raw)
    ? "deduction"
    : "earning";
};
const empty = {
  description: "",
  groupName: "",
  unitName: "",
  formulaCode: "",
  entryType: "earning",
  fgts: false,
  fgts13: false,
  inss: false,
  inss13: false,
  irrf: false,
  rais: false,
  affectsDsr: true,
  composesProductionAverage: false,
  active: true,
};
const centerLabel = (value: unknown) =>
  String(value || "").trim().toLocaleLowerCase("pt-BR") === "entressafra"
    ? "Tratos Culturais"
    : String(value || "");
export default function ServicesModule({ company }: { company: string }) {
  const [rows, setRows] = useState<S[]>([]),
    [centers, setCenters] = useState<any[]>([]),
    [q, setQ] = useState(""),
    [sortBy, setSortBy] = useState<"alpha" | "numeric">("numeric"),
    [entryFilter, setEntryFilter] = useState<"all" | "earning" | "deduction" | "special">(
      "all",
    ),
    [edit, setEdit] = useState<S | null | undefined>(),
    [form, setForm] = useState<any>(empty),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const centerOptions = useMemo(() => {
    const active = centers
      .filter((c: any) => c.active)
      .map((c: any) => ({ ...c, description: centerLabel(c.description) }));
    if (!active.some((c: any) => c.description.toLocaleLowerCase("pt-BR") === "plantio"))
      active.push({ id: -2, description: "Plantio", active: true });
    return active.sort((a: any, b: any) => a.description.localeCompare(b.description, "pt-BR"));
  }, [centers]);
  const load = () =>
    fetch(`/api/services?company=${company}`)
      .then((r) => r.json())
      .then((b) => setRows(b.services || []));
  useEffect(() => {
    load();
    fetch("/api/hr").then((r) => r.json()).then((b) => setCenters(b.centers || []));
  }, [company]);
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
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "delete"
            ? { action, id: edit?.id, companySourceId: Number(company) }
            : {
                ...form,
                entryType: natureOf(form),
                nature: natureOf(form),
                id: edit?.id,
                companySourceId: Number(company),
              },
        ),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Falha ao salvar o serviço.");
      setEdit(undefined);
      setMsg(action === "delete" ? "Serviço excluído." : "Serviço salvo.");
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Falha ao salvar o serviço.");
    } finally {
      setBusy(false);
    }
  };
  const flags = [
    ["fgts13", "FGTS sobre 13º"],
    ["inss13", "INSS sobre 13º"],
    ["affectsDsr", "Compõe média do DSR"],
    ["composesProductionAverage", "Compõe média de produção"],
    ["fgts", "FGTS mensal"],
    ["rais", "Informar na RAIS"],
    ["inss", "INSS mensal"],
    ["irrf", "IRRF mensal"],
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
            ["special", "Especiais"],
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
                <td>{centerLabel(s.groupName) || "—"}</td>
                <td>{s.unitName || "—"}</td>
                <td>
                  <div className="incidences">
                    {flags
                      .slice(0, 8)
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
                      const nature = natureOf(s);
                      setForm({ ...s, entryType: nature, nature });
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
                Código do serviço
                <input value={edit?.sourceId || "Automático"} readOnly />
              </label>
              <label>
                Centro de custo
                <select value={form.groupSourceId || ""} onChange={(e) => {
                  const selected=centerOptions.find((c:any)=>String(c.id)===e.target.value);
                  setForm({ ...form, groupSourceId:e.target.value, groupName:selected?.description || (e.target.value==="-1" ? "Pecuária" : "") });
                }}>
                  <option value="">Sem centro de custo</option>
                  {!centerOptions.some((c:any)=>c.description?.trim().toLocaleLowerCase("pt-BR")==="pecuária") && <option value="-1">Pecuária</option>}
                  {centerOptions.map((c:any)=><option key={c.id} value={c.id}>{c.description}</option>)}
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
                  onChange={(e) => {
                    const nature = e.target.value;
                    setForm({ ...form, entryType: nature, nature });
                  }}
                >
                  <option value="earning">Provento</option>
                  <option value="deduction">Desconto</option>
                  <option value="special">Especial</option>
                </select>
              </label>
              <label className="wide">
                Fórmula
                <input
                  value={form.formulaCode || ""}
                  placeholder="Ex.: quantidade * valor_unitario"
                  onChange={(e) => setForm({ ...form, formulaCode: e.target.value })}
                />
                <small>A fórmula será exibida nos lançamentos e relatórios deste evento.</small>
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
                  disabled={busy || edit.usageCount > 0}
                  onClick={() =>
                    confirm("Excluir este serviço?") && save("delete")
                  }
                >
                  Excluir
                </button>
              )}
              <button className="secondary" disabled={busy} onClick={() => setEdit(undefined)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy} onClick={() => save()}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
