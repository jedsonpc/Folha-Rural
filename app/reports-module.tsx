"use client";
import { useEffect, useMemo, useState } from "react";
import "./reports.css";
import "./reports-print111.css";
import "./reports-compact112.css";
import "./reports-period113.css";
type Company = {
  sourceId: number;
  name: string;
  document: string | null;
  city: string | null;
  state: string | null;
};
type Contract = {
  id: number;
  name: string;
  registrationNumber: number | null;
  legacyCode: string | null;
  status: string;
};
type Service = { id: number; description: string };
type Entry = {
  id: number;
  contractId: number;
  serviceId: number;
  quantity: string;
  unitPriceCents: number;
  amountCents: number;
  discountCents: number;
};
type Pack = {
  company: Company;
  contracts: Contract[];
  services: Service[];
  entries: Entry[];
};
const money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100),
  nowMonth = () => new Date().toISOString().slice(0, 7);
export default function ReportsModule() {
  const [companies, setCompanies] = useState<Company[]>([]),
    [company, setCompany] = useState("all"),
    [month, setMonth] = useState(nowMonth()),
    [period, setPeriod] = useState("advance"),
    [status, setStatus] = useState("active"),
    [order, setOrder] = useState("registration"),
    [type, setType] = useState("receipts"),
    [packs, setPacks] = useState<Pack[]>([]),
    [selected, setSelected] = useState<Set<number>>(new Set()),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((b) => setCompanies(b.companies || []));
  }, []);
  async function load() {
    setBusy(true);
    const targets =
        company === "all"
          ? companies
          : companies.filter((c) => String(c.sourceId) === company),
      loaded: Pack[] = [];
    for (const c of targets) {
      const r = await fetch(
          `/api/launches?company=${c.sourceId}&month=${month}`,
        ),
        b = await r.json();
      if (r.ok)
        loaded.push({
          company: c,
          contracts: b.contracts || [],
          services: b.services || [],
          entries: (b.entries || []).filter((entry: { entryDate: string }) =>
            entryMatchesPeriod(entry.entryDate, period),
          ),
        });
    }
    setPacks(loaded);
    const ids = new Set<number>();
    loaded.forEach((p) =>
      p.contracts
        .filter(
          (c) =>
            matchesStatus(c, status) &&
            p.entries.some((e) => e.contractId === c.id),
        )
        .forEach((c) => ids.add(c.id)),
    );
    setSelected(ids);
    setBusy(false);
  }
  const workers = useMemo(
    () =>
      packs
        .flatMap((p) =>
          p.contracts
            .filter(
              (c) =>
                matchesStatus(c, status) &&
                p.entries.some((e) => e.contractId === c.id),
            )
            .map((c) => ({ c, p })),
        )
        .sort((a, b) =>
          order === "name"
            ? a.c.name.localeCompare(b.c.name)
            : (a.c.registrationNumber || 999999) -
              (b.c.registrationNumber || 999999),
        ),
    [packs, status, order],
  );
  const chosen = workers.filter((x) => selected.has(x.c.id));
  const toggleAll = () =>
    setSelected(
      selected.size === workers.length
        ? new Set()
        : new Set(workers.map((x) => x.c.id)),
    );
  return (
    <section className="reports-module">
      <div className="module report-controls">
        <div className="module-hero">
          <span>▥</span>
          <div>
            <small>CENTRAL DE DOCUMENTOS</small>
            <h2>Relatórios e recibos</h2>
            <p>Documentos gerados a partir dos eventos reais da competência.</p>
          </div>
        </div>
        <div className="report-filters">
          <label>
            Competência
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label>
            Período da folha
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPacks([]);
              }}
            >
              <option value="advance">Adiantamento — dias 01 a 15</option>
              <option value="balance">Saldo mensal — dia 16 ao final</option>
            </select>
          </label>
          <label>
            Empresa
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c.sourceId} value={c.sourceId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Ativos</option>
              <option value="terminated">Demitidos</option>
              <option value="all">Todos</option>
            </select>
          </label>
          <label>
            Classificação
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="registration">Matrícula</option>
              <option value="name">Alfabética</option>
            </select>
          </label>
          <button className="primary" onClick={load} disabled={busy}>
            {busy ? "Carregando…" : "Gerar prévia"}
          </button>
        </div>
        <div className="report-types">
          {[
            ["receipts", "Recibos de pagamento"],
            ["detailed", "Folha detalhada"],
            ["summary", "Folha resumida"],
            ["management", "Resumo gerencial"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={type === k ? "active" : ""}
              onClick={() => setType(k)}
            >
              {l}
            </button>
          ))}
        </div>
        {workers.length > 0 && (
          <div className="employee-selection">
            <div>
              <b>Colaboradores</b>
              <span>
                {selected.size} de {workers.length} selecionados
              </span>
            </div>
            <button className="secondary" onClick={toggleAll}>
              {selected.size === workers.length
                ? "Desmarcar todos"
                : "Selecionar todos"}
            </button>
            <div className="selection-grid">
              {workers.map(({ c }) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const n = new Set(prev);
                        n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    {c.registrationNumber
                      ? `MAT ${c.registrationNumber}`
                      : c.legacyCode}{" "}
                    · {c.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="report-actions">
          <span>
            O comprovante de depósito bancário também pode ter força de recibo,
            conforme art. 464 da CLT.
          </span>
          <button
            className="primary"
            disabled={!chosen.length}
            onClick={() => window.print()}
          >
            Imprimir selecionados
          </button>
        </div>
      </div>
      <div className="print-area">
        {!packs.length ? (
          <div className="module report-empty">
            <h3>Escolha os filtros e gere a prévia</h3>
            <p>Nenhum documento será criado com dados de demonstração.</p>
          </div>
        ) : type === "receipts" ? (
          chosen.map((x) => (
            <Receipt
              key={`${x.p.company.sourceId}-${x.c.id}`}
              {...x}
              month={month}
              period={period}
            />
          ))
        ) : type === "detailed" ? (
          <Detailed chosen={chosen} month={month} period={period} />
        ) : type === "summary" ? (
          <Summary
            packs={packs}
            chosen={chosen}
            month={month}
            period={period}
          />
        ) : (
          <Management
            packs={packs}
            chosen={chosen}
            month={month}
            period={period}
          />
        )}
      </div>
    </section>
  );
}
function matchesStatus(c: Contract, status: string) {
  return status === "all" || c.status === status;
}
function entryMatchesPeriod(entryDate: string, period: string) {
  const day = Number(entryDate.slice(8, 10));
  return period === "advance" ? day >= 1 && day <= 15 : day >= 16;
}
function periodLabel(month: string, period: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return period === "advance"
    ? `Período de 01 a 15/${String(monthNumber).padStart(2, "0")}/${year} — Adiantamento`
    : `Período de 16 a ${lastDay}/${String(monthNumber).padStart(2, "0")}/${year} — Saldo Mensal`;
}
function totals(p: Pack, id: number) {
  const es = p.entries.filter((e) => e.contractId === id);
  return {
    es,
    gross: es.reduce((a, e) => a + e.amountCents, 0),
    discount: es.reduce((a, e) => a + (e.discountCents || 0), 0),
  };
}
function Header({
  company,
  month,
  title,
  period,
}: {
  company: Company;
  month: string;
  title: string;
  period: string;
}) {
  return (
    <header className="print-head">
      <div>
        <h1>{company.name}</h1>
        <p>
          <strong>
            {company.document || "Documento não informado"} ·{" "}
            {company.city || ""}/{company.state || ""}
          </strong>
        </p>
      </div>
      <div>
        <b>{title}</b>
        <span className="pay-period">{periodLabel(month, period)}</span>
      </div>
    </header>
  );
}
function Receipt({
  c,
  p,
  month,
  period,
}: {
  c: Contract;
  p: Pack;
  month: string;
  period: string;
}) {
  const t = totals(p, c.id);
  return (
    <article className="receipt print-page">
      <Header
        company={p.company}
        month={month}
        period={period}
        title="RECIBO DE PAGAMENTO"
      />
      <section className="worker-line">
        <div>
          <small>COLABORADOR</small>
          <b>{c.name}</b>
        </div>
        <div>
          <small>MATRÍCULA</small>
          <b>{c.registrationNumber || c.legacyCode}</b>
        </div>
      </section>
      <EventTable entries={t.es} services={p.services} />
      <div className="receipt-totals">
        <div>
          <small>Total bruto</small>
          <b>{money(t.gross)}</b>
        </div>
        <div>
          <small>Descontos</small>
          <b>{money(t.discount)}</b>
        </div>
        <div className="net">
          <small>Valor líquido</small>
          <b>{money(t.gross - t.discount)}</b>
        </div>
      </div>
      <p className="receipt-text">
        Recebi da empresa acima identificada o valor líquido discriminado neste
        demonstrativo, referente à competência indicada.
      </p>
      <div className="signatures">
        <span>Data: ____/____/________</span>
        <span>Assinatura do colaborador</span>
      </div>
      <small className="copy-note">
        Via do empregado / empregador — imprimir em duas vias quando houver
        assinatura física.
      </small>
    </article>
  );
}
function EventTable({
  entries,
  services,
}: {
  entries: Entry[];
  services: Service[];
}) {
  const grouped = new Map<
    number,
    { q: number; gross: number; discount: number }
  >();
  entries.forEach((e) => {
    const r = grouped.get(e.serviceId) || { q: 0, gross: 0, discount: 0 };
    r.q += Number(e.quantity);
    r.gross += e.amountCents;
    r.discount += e.discountCents || 0;
    grouped.set(e.serviceId, r);
  });
  return (
    <table className="pay-table">
      <thead>
        <tr>
          <th>Evento</th>
          <th>Referência</th>
          <th>Proventos</th>
          <th>Descontos</th>
        </tr>
      </thead>
      <tbody>
        {[...grouped].map(([id, r]) => (
          <tr key={id}>
            <td>
              {services.find((s) => s.id === id)?.description || `Evento ${id}`}
            </td>
            <td>{r.q || "—"}</td>
            <td>{r.gross ? money(r.gross) : "—"}</td>
            <td>{r.discount ? money(r.discount) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Detailed({
  chosen,
  month,
  period,
}: {
  chosen: { c: Contract; p: Pack }[];
  month: string;
  period: string;
}) {
  const companies = [
    ...new Map(chosen.map((x) => [x.p.company.sourceId, x.p])).values(),
  ];
  return (
    <>
      {companies.map((p) => (
        <article
          className="detailed-report print-page"
          key={p.company.sourceId}
        >
          <Header
            company={p.company}
            month={month}
            period={period}
            title="FOLHA DETALHADA"
          />
          <div className="detailed-workers">
            {chosen
              .filter((x) => x.p.company.sourceId === p.company.sourceId)
              .map(({ c }) => {
                const t = totals(p, c.id);
                return (
                  <section className="detail-worker" key={c.id}>
                    <h3>
                      <span>{c.registrationNumber || c.legacyCode}</span>
                      {c.name}
                    </h3>
                    <EventTable entries={t.es} services={p.services} />
                    <footer>
                      Bruto: <b>{money(t.gross)}</b> · Descontos:{" "}
                      <b>{money(t.discount)}</b> · Líquido:{" "}
                      <b>{money(t.gross - t.discount)}</b>
                    </footer>
                  </section>
                );
              })}
          </div>
          <div className="page-counter">
            Página <span className="current-page" /> de{" "}
            <span className="total-pages" />
          </div>
        </article>
      ))}
    </>
  );
}
function Summary({
  packs,
  chosen,
  month,
  period,
}: {
  packs: Pack[];
  chosen: { c: Contract; p: Pack }[];
  month: string;
  period: string;
}) {
  const rows = new Map<
    string,
    { quantity: number; gross: number; discount: number }
  >();
  chosen.forEach((x) =>
    totals(x.p, x.c.id).es.forEach((e) => {
      const name =
          x.p.services.find((s) => s.id === e.serviceId)?.description ||
          `Evento ${e.serviceId}`,
        r = rows.get(name) || { quantity: 0, gross: 0, discount: 0 };
      r.quantity += Number(e.quantity) || 0;
      r.gross += e.amountCents;
      r.discount += e.discountCents || 0;
      rows.set(name, r);
    }),
  );
  const sorted = [...rows].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    earnings = sorted.filter(([, r]) => r.gross > 0),
    deductions = sorted.filter(([, r]) => r.discount > 0),
    gross = sorted.reduce((a, [, r]) => a + r.gross, 0),
    discount = sorted.reduce((a, [, r]) => a + r.discount, 0),
    qty = (n: number) =>
      new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
  return (
    <article className="summary-report">
      <h1>Folha resumida</h1>
      <h2 className="report-period">{periodLabel(month, period)}</h2>
      <table className="pay-table summary-events">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Soma da produção</th>
            <th>Valor total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="event-group">
            <th colSpan={3}>PROVENTOS</th>
          </tr>
          {earnings.map(([n, r]) => (
            <tr key={`p-${n}`}>
              <td>{n}</td>
              <td>{qty(r.quantity)}</td>
              <td>{money(r.gross)}</td>
            </tr>
          ))}
          <tr className="event-group">
            <th colSpan={3}>DESCONTOS</th>
          </tr>
          {deductions.map(([n, r]) => (
            <tr key={`d-${n}`}>
              <td>{n}</td>
              <td>{qty(r.quantity)}</td>
              <td>{money(r.discount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>TOTAL BRUTO</th>
            <th>{money(gross)}</th>
          </tr>
          <tr>
            <th colSpan={2}>TOTAL DESCONTOS</th>
            <th>{money(discount)}</th>
          </tr>
          <tr>
            <th colSpan={2}>TOTAL LÍQUIDO</th>
            <th>{money(gross - discount)}</th>
          </tr>
        </tfoot>
      </table>
      <div className="page-counter">
        Página <span className="current-page" /> de{" "}
        <span className="total-pages" />
      </div>
    </article>
  );
}
function Management({
  packs,
  chosen,
  month,
  period,
}: {
  packs: Pack[];
  chosen: { c: Contract; p: Pack }[];
  month: string;
  period: string;
}) {
  return (
    <article className="summary-report">
      <h1>Resumo gerencial · {month.split("-").reverse().join("/")}</h1>
      <h2 className="report-period">{periodLabel(month, period)}</h2>
      <table className="pay-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Colaboradores</th>
            <th>Bruto</th>
            <th>Descontos</th>
            <th>Líquido</th>
          </tr>
        </thead>
        <tbody>
          {packs.map((p) => {
            const cs = chosen.filter(
                (x) => x.p.company.sourceId === p.company.sourceId,
              ),
              ts = cs.map((x) => totals(p, x.c.id)),
              g = ts.reduce((a, t) => a + t.gross, 0),
              d = ts.reduce((a, t) => a + t.discount, 0);
            return (
              <tr key={p.company.sourceId}>
                <td>{p.company.name}</td>
                <td>{cs.length}</td>
                <td>{money(g)}</td>
                <td>{money(d)}</td>
                <td>{money(g - d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
