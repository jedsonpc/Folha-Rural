"use client";
import { useEffect, useMemo, useState } from "react";

type Payload = {
  companies: Array<{ sourceId: number; name: string }>;
  contracts: Array<{
    id: number;
    personId: number;
    companySourceId: number;
    name: string;
    role: string | null;
    admissionDate: string | null;
    status: string;
    registrationNumber: number | null;
    legacyCode: string | null;
  }>;
  counts: { people: number; contracts: number; active: number; review: number };
};
export default function ProductionDashboard({
  selectedCompany,
  onOpenWorkers,
}: {
  selectedCompany: string;
  onOpenWorkers: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then(setData);
  }, []);
  const rows = useMemo(
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
  if (!data)
    return (
      <section className="panel data-state">
        <span className="spinner" />
        <p>Preparando o painel…</p>
      </section>
    );
  const people = new Set(rows.map((r) => r.personId)).size,
    active = rows.filter((r) => r.status === "active").length,
    ended = rows.filter((r) => r.status !== "active").length,
    recent = [...rows]
      .sort((a, b) =>
        (b.admissionDate || "").localeCompare(a.admissionDate || ""),
      )
      .slice(0, 3);
  return (
    <>
      <section className="kpis production-kpis">
        <article>
          <span className="ico terra">♙</span>
          <div>
            <strong>{people}</strong>
            <p>pessoas cadastradas</p>
          </div>
        </article>
        <article>
          <span className="ico oliva">✓</span>
          <div>
            <strong>{active}</strong>
            <p>contratos ativos</p>
          </div>
        </article>
        <article>
          <span className="ico amber">↪</span>
          <div>
            <strong>{ended}</strong>
            <p>contratos encerrados</p>
          </div>
        </article>
        <article>
          <span className="ico terra">⌂</span>
          <div>
            <strong>
              {selectedCompany === "all" ? data.companies.length : 1}
            </strong>
            <p>empresas na consulta</p>
          </div>
        </article>
      </section>
      <section className="panel dashboard-real">
        <div className="panel-title">
          <div>
            <small>ÚLTIMAS ADMISSÕES</small>
            <h2>Movimentação de contratos</h2>
          </div>
          <button className="secondary" onClick={onOpenWorkers}>
            Consultar colaboradores →
          </button>
        </div>
        {recent.length ? (
          <div className="recent-contracts">
            {recent.map((row) => (
              <div key={row.id}>
                <span>
                  {row.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <div>
                  <b>{row.name}</b>
                  <small>{row.role || "Função não informada"}</small>
                </div>
                <em>
                  {row.registrationNumber
                    ? `Matrícula ${row.registrationNumber}`
                    : row.legacyCode}
                </em>
                <strong className={row.status}>
                  {row.status === "active" ? "Ativo" : "Desligado"}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="data-state">
            <p>Nenhum contrato nesta empresa.</p>
          </div>
        )}
      </section>
    </>
  );
}
