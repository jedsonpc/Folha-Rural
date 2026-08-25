"use client";
import { useState } from "react";
import "./closing.css";
type Row = {
  id: number;
  name: string;
  registrationNumber: number | null;
  gross: number;
  inssBase: number;
  irrfBase: number;
  inss: number;
  irrf: number;
  salaryFamily: number;
  union: number;
  existingDiscounts: number;
  net: number;
};
type Result = {
  rows: Row[];
  officialTables: { inss: boolean; irrf: boolean; salaryFamily: boolean };
  start: string;
  end: string;
};
const money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100),
  todayMonth = () => new Date().toISOString().slice(0, 7);
export default function ClosingModule({ company }: { company: string }) {
  const [month, setMonth] = useState(todayMonth()),
    [period, setPeriod] = useState("monthly"),
    [result, setResult] = useState<Result | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (close = false) => {
    if (company === "all") {
      setMessage("Selecione uma empresa para realizar o fechamento.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const url = `/api/closing?company=${company}&month=${month}&period=${period}`,
        r = await fetch(
          close ? "/api/closing" : url,
          close
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  companySourceId: Number(company),
                  month,
                  period,
                }),
              }
            : undefined,
        ),
        b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setResult(b.result || b);
      setMessage(b.message || "Prévia calculada.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha no fechamento.");
    } finally {
      setBusy(false);
    }
  };
  if (company === "all")
    return (
      <section className="module launch-empty">
        <h2>Selecione uma empresa</h2>
        <p>O fechamento é processado separadamente para cada empresa.</p>
      </section>
    );
  const totals = result?.rows.reduce(
    (a, r) => ({
      gross: a.gross + r.gross,
      inss: a.inss + r.inss,
      irrf: a.irrf + r.irrf,
      family: a.family + r.salaryFamily,
      union: a.union + r.union,
      net: a.net + r.net,
    }),
    { gross: 0, inss: 0, irrf: 0, family: 0, union: 0, net: 0 },
  );
  return (
    <section className="closing-module">
      <div className="module closing-controls">
        <div className="module-hero">
          <span>✓</span>
          <div>
            <small>PROCESSAMENTO DA COMPETÊNCIA</small>
            <h2>Gerar tributos e descontos da folha</h2>
            <p>
              Gere INSS, IRPF e contribuição sindical até o dia 15 ou até o último dia da competência.
            </p>
          </div>
        </div>
        <div className="closing-filters">
          <label>
            Competência
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label>
            Período
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="advance">Quinzenal — lançamentos até o dia 15</option>
              <option value="monthly">Mensal — até o último dia, compensando a quinzena</option>
            </select>
          </label>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => run(false)}
          >
            Calcular prévia
          </button>
          <button
            className="primary"
            disabled={busy || !result}
            onClick={() => run(true)}
          >
            Gerar e confirmar descontos
          </button>
        </div>
        {message && <div className="inline-notice">{message}</div>}
      </div>
      {result && (
        <>
          <div className="closing-cards">
            <article>
              <small>Bruto</small>
              <b>{money(totals?.gross || 0)}</b>
            </article>
            <article>
              <small>INSS</small>
              <b>{money(totals?.inss || 0)}</b>
            </article>
            <article>
              <small>IRRF</small>
              <b>{money(totals?.irrf || 0)}</b>
            </article>
            <article>
              <small>Salário-família</small>
              <b>{money(totals?.family || 0)}</b>
            </article>
            <article>
              <small>Sindicato</small>
              <b>{money(totals?.union || 0)}</b>
            </article>
            <article className="net">
              <small>Líquido</small>
              <b>{money(totals?.net || 0)}</b>
            </article>
          </div>
          <article className="panel">
            <div className="panel-title">
              <div>
                <small>MEMÓRIA DE CÁLCULO</small>
                <h2>{result.rows.length} colaboradores processados</h2>
              </div>
              <span className="tag">
                Tabelas oficiais{" "}
                {result.officialTables.inss && result.officialTables.irrf
                  ? "carregadas"
                  : "incompletas"}
              </span>
            </div>
            <div className="table-scroll">
              <table className="data-table closing-table">
                <thead>
                  <tr>
                    <th>Matrícula</th>
                    <th>Colaborador</th>
                    <th>Bruto</th>
                    <th>Base INSS</th>
                    <th>INSS</th>
                    <th>Base IRRF</th>
                    <th>IRRF</th>
                    <th>Salário-família</th>
                    <th>Sindicato</th>
                    <th>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.registrationNumber || "—"}</td>
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td>{money(r.gross)}</td>
                      <td>{money(r.inssBase)}</td>
                      <td>{money(r.inss)}</td>
                      <td>{money(r.irrfBase)}</td>
                      <td>{money(r.irrf)}</td>
                      <td>{money(r.salaryFamily)}</td>
                      <td>{money(r.union)}</td>
                      <td>
                        <b>{money(r.net)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
