"use client";
import { useEffect, useState } from "react";
import "./tax-tables.css";
type Row = {
  id: number;
  taxType: string;
  lowerCents: number;
  upperCents: number | null;
  rateBasisPoints: number;
  deductionCents: number;
  effectiveFrom: string;
  sourceName: string;
  sourceUrl: string;
};
const money = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
const taxLabel = (taxType: string) =>
  taxType === "SALARY_FAMILY" ? "SAL. FAMÍLIA" : taxType;
const taxTitle = (taxType: string) =>
  taxType === "SALARY_FAMILY" ? "SALÁRIO-FAMÍLIA" : taxType;
export default function TaxTablesModule() {
  const [rows, setRows] = useState<Row[]>([]),
    [parameters, setParameters] = useState<any>(null),
    [msg, setMsg] = useState("");
  const load = () =>
    fetch("/api/tax-tables")
      .then((r) => r.json())
      .then((b) => {
        setRows(b.rows || []);
        setParameters(b);
      });
  useEffect(() => {
    load();
  }, []);
  const update = async () => {
    const r = await fetch("/api/tax-tables", { method: "POST" }),
      b = await r.json();
    setMsg(b.message || b.error);
    load();
  };
  return (
    <section className="module tax-tables-module">
      <div className="module-hero">
        <span>％</span>
        <div>
          <small>PARÂMETROS OFICIAIS VERSIONADOS</small>
          <h2>Tabelas de INSS e IRRF</h2>
          <p>
            Faixas válidas por competência, preservando cálculos históricos.
          </p>
        </div>
        <button className="primary" onClick={update}>
          Atualizar tabelas
        </button>
      </div>
      {msg && <div className="inline-notice">{msg}</div>}
      {parameters && (
        <div className="tax-parameter-grid">
          <article>
            <small>DEDUÇÃO SIMPLIFICADA IRRF</small>
            <b>{money(parameters.irrfSimplifiedDeductionCents)}</b>
          </article>
          <article>
            <small>DEDUÇÃO POR DEPENDENTE</small>
            <b>{money(parameters.dependentDeductionCents)}</b>
          </article>
          <article>
            <small>REDUÇÃO INTEGRAL 2026</small>
            <b>Até {money(parameters.irrfReduction.fullExemptionUntilCents)}</b>
          </article>
          <article>
            <small>REDUÇÃO PARCIAL 2026</small>
            <b>
              Até {money(parameters.irrfReduction.partialReductionUntilCents)}
            </b>
            <span>{parameters.irrfReduction.formula}</span>
          </article>
        </div>
      )}
      <div className="table-scroll tax-table-scroll">
        <table className="data-table tax-table">
          <thead>
            <tr>
              <th>Tributo</th>
              <th>Vigência</th>
              <th>Faixa inicial</th>
              <th>Faixa final</th>
              <th>Alíquota</th>
              <th>Dedução</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b title={taxTitle(r.taxType)}>{taxLabel(r.taxType)}</b>
                </td>
                <td>{r.effectiveFrom.split("-").reverse().join("/")}</td>
                <td>{money(r.lowerCents)}</td>
                <td>
                  {r.upperCents == null ? "Sem limite" : money(r.upperCents)}
                </td>
                <td>{(r.rateBasisPoints / 100).toFixed(2)}%</td>
                <td>{money(r.deductionCents)}</td>
                <td>
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                    {r.sourceName}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dsr-rule">
        No fechamento da folha, apenas lançamentos novos serão recalculados.
        Valores e descontos importados do Access permanecem fechados e não serão
        substituídos.
      </p>
    </section>
  );
}
