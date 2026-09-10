"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./reports.css";
import "./reports-print111.css";
import "./reports-compact112.css";
import "./reports-period113.css";
import "./reports-layout-fix.css";
import { brazilMonth } from "./br-date";
type Company = {
  sourceId: number;
  name: string;
  document: string | null;
  documentType: string | null;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};
type Contract = {
  id: string;
  name: string;
  cpf?: string | null;
  pis?: string | null;
  birthDate?: string | null;
  identityNumber?: string | null;
  registrationNumber: number | null;
  legacyCode: string | null;
  status: string;
  admissionDate?: string | null;
  terminationDate?: string | null;
  role?: string | null;
  paymentType?: string | null;
  baseSalaryCents?: number;
};
type Service = {
  id: string;
  sourceId?: number;
  description: string;
  formulaCode?: string | null;
  entryType?: "earning" | "deduction" | "special";
  inssIncidence?: boolean;
  fgtsIncidence?: boolean;
};
type Entry = {
  id: string;
  entryDate: string;
  contractId: string;
  serviceId: string;
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
  competenceEntries?: Entry[];
};
const money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100),
  visibleReportEntries = (entries: Entry[], services: Service[]) =>
    entries.filter((entry) => {
      if (entry.amountCents !== 0 || (entry.discountCents || 0) !== 0) return true;
      const description = services.find((service) => service.id === entry.serviceId)?.description || "";
      return !/CONTRIBUI.*SINDICAL|SINDICATO/i.test(description);
    }),
  financialMoney = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(c / 100),
  nowMonth = brazilMonth;
async function fetchJson(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Não foi possível consultar os dados do relatório.");
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("A consulta demorou além do esperado. Tente novamente ou selecione uma empresa e um período menor.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
export default function ReportsModule({
  selectedCompany,
  category,
}: {
  selectedCompany?: string;
  category: "analytical" | "summary";
}) {
  const currentYear = new Date().getFullYear();
  const [companies, setCompanies] = useState<Company[]>([]),
    [reportServices, setReportServices] = useState<Service[]>([]),
    [company, setCompany] = useState(selectedCompany || "all"),
    [month, setMonth] = useState(nowMonth()),
    [period, setPeriod] = useState("full"),
    [status, setStatus] = useState("all"),
    [order, setOrder] = useState("registration"),
    [type, setType] = useState("receipts"),
    [rangeMode, setRangeMode] = useState<"annual" | "year" | "custom">(
      "annual",
    ),
    [financialYear, setFinancialYear] = useState(String(currentYear)),
    [dateStart, setDateStart] = useState(`${currentYear}-01-01`),
    [dateEnd, setDateEnd] = useState(`${currentYear}-12-31`),
    [eventId, setEventId] = useState("all"),
    [packs, setPacks] = useState<Pack[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [copyChoiceOpen, setCopyChoiceOpen] = useState(false),
    [printCopies, setPrintCopies] = useState<1 | 2>(1);
  const loadSequence = useRef(0);
  useEffect(() => {
    setType(category === "summary" ? "summary" : "receipts");
    setPacks([]);
    setSelected(new Set());
    setNotice("");
  }, [category]);
  useEffect(() => {
    if (selectedCompany) setCompany(selectedCompany);
  }, [selectedCompany]);
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((b) => setCompanies(b.companies || []));
    fetch("/api/services")
      .then((r) => r.json())
      .then((b) => setReportServices(b.services || []));
  }, []);
  async function load() {
    const sequence = ++loadSequence.current;
    setBusy(true);
    setNotice("");
    try {
      const targets =
          company === "all"
            ? companies
            : companies.filter((c) => String(c.sourceId) === company),
        loaded: Pack[] = [];
      if (!targets.length) {
        setPacks([]);
        setSelected(new Set());
        setNotice("Nenhuma empresa disponível para gerar os relatórios.");
        return;
      }
      const usesRange = type === "events" || type === "financial";
      const start = usesRange ? dateStart : `${month}-01`;
      const end = usesRange ? dateEnd : `${month}-31`;
      for (const c of targets) {
        let contracts: Contract[] = [];
        let services: Service[] = [];
        const entries: Entry[] = [];
        const competenceEntries: Entry[] = [];
        const monthResults = await Promise.all(
          monthsBetween(start, end).map((targetMonth) =>
            fetchJson(`/api/launches?company=${c.sourceId}&month=${targetMonth}&report=1`),
          ),
        );
        for (const b of monthResults) {
          contracts = b.contracts || contracts;
          services = b.services || services;
          const reportEntries = visibleReportEntries(b.entries || [], b.services || services);
          competenceEntries.push(...reportEntries);
          entries.push(
            ...reportEntries.filter(
              (entry: Entry) =>
                entry.entryDate >= start &&
                entry.entryDate <= end &&
                (usesRange || entryMatchesPayrollPeriod(entry, period, b.services || [])),
            ),
          );
        }
        loaded.push({ company: c, contracts, services, entries, competenceEntries });
      }
      if (sequence !== loadSequence.current) return;
      setPacks(loaded);
      const ids = new Set<string>();
      loaded.forEach((p) =>
        p.contracts
          .filter((c) =>
            type === "timecard"
              ? c.status === "active"
              : matchesStatus(c, status) &&
                p.entries.some((e) => e.contractId === c.id),
          )
          .forEach((c) => ids.add(c.id)),
      );
      setSelected(ids);
      const entryCount = loaded.reduce((sum, pack) => sum + pack.entries.length, 0);
      setNotice(
        type === "timecard"
          ? `${ids.size} colaborador(es) ativo(s) disponível(is) para impressão.`
          : entryCount
          ? `${entryCount} lançamento(s) encontrado(s) no período selecionado.`
          : "Nenhum lançamento encontrado no período selecionado. Confira os filtros ou registre os apontamentos antes de gerar o relatório.",
      );
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setPacks([]);
      setSelected(new Set());
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar os relatórios.",
      );
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }
  const workers = useMemo(
    () =>
      packs
        .flatMap((p) =>
          p.contracts
            .filter((c) =>
              type === "timecard"
                ? c.status === "active"
                : matchesStatus(c, status) &&
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
    [packs, status, order, type],
  );
  const chosen = workers.filter((x) => selected.has(x.c.id)),
    availableServices = [
      ...new Map(
        [...reportServices, ...packs.flatMap((p) => p.services)].map((s) => [
          s.id,
          s,
        ]),
      ).values(),
    ].sort((a, b) => a.description.localeCompare(b.description, "pt-BR")),
    receiptCopies = chosen.flatMap((item) =>
      Array.from({ length: printCopies }, (_, copyIndex) => ({
        ...item,
        copyIndex,
      })),
    ),
    receiptSheets = Array.from(
      { length: Math.ceil(receiptCopies.length / 2) },
      (_, index) => receiptCopies.slice(index * 2, index * 2 + 2),
    );
  const printWithCopies = (copies: 1 | 2) => {
    setPrintCopies(copies);
    setCopyChoiceOpen(false);
    window.setTimeout(() => window.print(), 80);
  };
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
            <h2>
              {category === "analytical"
                ? "Relatórios Analíticos"
                : "Relatórios Resumo"}
            </h2>
            <p>Documentos gerados a partir dos lançamentos reais da empresa.</p>
          </div>
        </div>
        <div className="report-types report-category-types">
          {(category === "analytical"
            ? [
                ["receipts", "Recibos de pagamento"],
                ["detailed", "Folha de pagamento"],
                ["events", "Lançamentos"],
                ["timecard", "Cartão ponto"],
                ["financial", "Financeira"],
              ]
            : [
                ["summary", "Folha Resumida"],
                ["management", "Folha Gerencial"],
              ]
          ).map(([k, l]) => (
            <button
              key={k}
              className={type === k ? "active" : ""}
              onClick={() => {
                setType(k);
                setPacks([]);
                if (k === "timecard") {
                  setStatus("active");
                  setOrder("name");
                  setPeriod("advance");
                }
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="report-filters">
          {(type === "events" || type === "financial") ? (
            <>
              {type === "financial" && (
                <label>
                  Abrangência
                  <select
                    value={rangeMode}
                    onChange={(e) => {
                      const mode = e.target.value as
                        | "annual"
                        | "year"
                        | "custom";
                      setRangeMode(mode);
                      if (mode === "annual") {
                        setFinancialYear(String(currentYear));
                        setDateStart(`${currentYear}-01-01`);
                        setDateEnd(`${currentYear}-12-31`);
                      } else if (mode === "year") {
                        setDateStart(`${financialYear}-01-01`);
                        setDateEnd(`${financialYear}-12-31`);
                      }
                    }}
                  >
                    <option value="annual">Ano vigente ({currentYear})</option>
                    <option value="year">Selecionar o ano</option>
                    <option value="custom">Período definido</option>
                  </select>
                  {eventId !== "all" && availableServices.find((service) => String(service.id) === eventId)?.formulaCode && (
                    <small>Fórmula: {availableServices.find((service) => String(service.id) === eventId)?.formulaCode}</small>
                  )}
                </label>
              )}
              {type === "financial" && rangeMode === "year" && (
                <label>
                  Ano
                  <select
                    value={financialYear}
                    onChange={(e) => {
                      const year = e.target.value;
                      setFinancialYear(year);
                      setDateStart(`${year}-01-01`);
                      setDateEnd(`${year}-12-31`);
                    }}
                  >
                    {Array.from({ length: 21 }, (_, index) =>
                      String(currentYear + 1 - index),
                    ).map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Data inicial
                <input
                  type="date"
                  value={dateStart}
                  disabled={type === "financial" && rangeMode !== "custom"}
                  onChange={(e) => setDateStart(e.target.value)}
                />
              </label>
              <label>
                Data final
                <input
                  type="date"
                  value={dateEnd}
                  disabled={type === "financial" && rangeMode !== "custom"}
                  onChange={(e) => setDateEnd(e.target.value)}
                />
              </label>
              {type === "events" && (
                <label>
                  Evento
                  <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    <option value="all">Todos os eventos</option>
                    {availableServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.sourceId ? `${service.sourceId} — ` : ""}
                        {service.description}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <>
          <label>
            Competência
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
            </>
          )}
          {type !== "events" && type !== "financial" && (
            <label>
              Período da folha
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setPacks([]);
                }}
              >
                {type !== "timecard" && <option value="full">Folha mensal — mês completo</option>}
                <option value="advance">{type === "timecard" ? "1ª Quinzena — dias 01 a 15" : "Adiantamento — dias 01 a 15"}</option>
                <option value="balance">{type === "timecard" ? "2ª Quinzena — dia 16 ao final" : "Saldo mensal — dia 16 ao final"}</option>
              </select>
            </label>
          )}
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
          {type !== "timecard" && <label>
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todos com lançamentos</option>
              <option value="active">Ativos</option>
              <option value="terminated">Demitidos</option>
            </select>
          </label>}
          <label>
            Classificação
            <select value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="name">Alfabética</option>
              <option value="registration">Matrícula</option>
            </select>
          </label>
          <button type="button" className="primary report-generate" onClick={load} disabled={busy}>
            {busy ? "Carregando…" : "Gerar prévia"}
          </button>
        </div>
        {notice && (
          <div className={`report-notice ${workers.length ? "success" : ""}`}>
            {notice}
          </div>
        )}
        {workers.length > 0 && (
          <div className="employee-selection">
            {type === "timecard" && (
              <label className="select-all-print">
                <input type="checkbox" checked={selected.size === workers.length} onChange={toggleAll} />
                Imprimir todos os colaboradores ativos
              </label>
            )}
            <div>
              <b>Colaboradores</b>
              <span>
                {selected.size} de {workers.length} selecionados
              </span>
            </div>
            {type !== "timecard" && <button className="secondary" onClick={toggleAll}>
              {selected.size === workers.length
                ? "Desmarcar todos"
                : "Selecionar todos"}
            </button>}
            {(type !== "timecard" || selected.size !== workers.length) && <div className={`selection-grid ${type === "timecard" ? "selection-list-vertical" : ""}`}>
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
            </div>}
          </div>
        )}
        <div className="report-actions">
          <span>
            O comprovante de depósito bancário também pode ter força de recibo,
            conforme art. 464 da CLT.
          </span>
          {workers.length > 0 && <button
            className="primary"
            disabled={!chosen.length}
            onClick={() =>
              type === "receipts"
                ? setCopyChoiceOpen(true)
                : window.print()
            }
          >
            Imprimir selecionados
          </button>}
        </div>
      </div>
      {copyChoiceOpen && (
        <div
          className="print-copy-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-copy-title"
        >
          <section>
            <small>IMPRESSÃO DE RECIBOS</small>
            <h3 id="print-copy-title">Quantas cópias deseja imprimir?</h3>
            <p>
              Os recibos serão organizados dois por página. Em duas cópias, as
              duas vias do mesmo colaborador sairão em sequência.
            </p>
            <div>
              <button onClick={() => printWithCopies(1)}>
                <b>1 cópia</b>
                <span>Uma via por colaborador</span>
              </button>
              <button onClick={() => printWithCopies(2)}>
                <b>2 cópias</b>
                <span>Duas vias consecutivas</span>
              </button>
            </div>
            <button
              className="print-copy-cancel"
              onClick={() => setCopyChoiceOpen(false)}
            >
              Cancelar
            </button>
          </section>
        </div>
      )}
      <div className="print-area">
        {!packs.length || !workers.length ? (
          <div className="module report-empty">
            <h3>
              {!packs.length
                ? "Escolha os filtros e gere a prévia"
                : "Nenhum documento disponível para os filtros selecionados"}
            </h3>
            <p>
              {notice ||
                "Nenhum documento será criado com dados de demonstração."}
            </p>
          </div>
        ) : type === "receipts" ? (
          receiptSheets.map((sheet, sheetIndex) => (
            <section className="receipt-sheet print-page" key={sheetIndex}>
              {sheet.map((x) => (
                <Receipt
                  key={`${x.p.company.sourceId}-${x.c.id}-${x.copyIndex}`}
                  c={x.c}
                  p={x.p}
                  month={month}
                  period={period}
                />
              ))}
            </section>
          ))
        ) : type === "detailed" ? (
          <Detailed chosen={chosen} month={month} period={period} />
        ) : type === "events" ? (
          <EventLaunchReport
            packs={packs}
            chosen={chosen}
            eventId={eventId}
            dateStart={dateStart}
            dateEnd={dateEnd}
          />
        ) : type === "financial" ? (
          <FinancialReport
            chosen={chosen}
            dateStart={dateStart}
            dateEnd={dateEnd}
          />
        ) : type === "timecard" ? (
          <TimeCards chosen={chosen} month={month} period={period} />
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
function TimeCards({
  chosen,
  month,
  period,
}: {
  chosen: { c: Contract; p: Pack }[];
  month: string;
  period: string;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const first = period === "balance" ? 16 : 1;
  const last = period === "balance" ? lastDay : 15;
  const dates = Array.from({ length: last - first + 1 }, (_, index) =>
    new Date(year, monthNumber - 1, first + index),
  );
  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("pt-BR").format(date);
  const weekday = (date: Date) =>
    new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
      .format(date)
      .replace("-feira", "");
  return (
    <>
      {chosen.map(({ c, p }) => (
        <article className="time-card print-page employee-print-page" key={`${p.company.sourceId}-${c.id}`}>
          <header className="time-card-title">
            <div>
              <small>CONTROLE DE JORNADA E APONTAMENTO DIÁRIO</small>
              <h1>CARTÃO DE PONTO</h1>
            </div>
            <MiniCalendar year={year} month={monthNumber} first={first} last={last} />
          </header>
          <section className="time-card-identification">
            <div className="time-card-company"><small>Empresa</small><b>{p.company.name}</b></div>
            <div className="time-card-worker"><small>Colaborador</small><b>{c.name}</b></div>
            <div><small>Matrícula</small><b>{c.registrationNumber || c.legacyCode || "—"}</b></div>
            <div><small>Período</small><b>{formatDate(dates[0])} a {formatDate(dates[dates.length - 1])}</b></div>
          </section>
          <table className="time-card-table">
            <thead>
              <tr><th rowSpan={2}>Data</th><th colSpan={4}>Registros</th><th rowSpan={2}>Serviços executados</th><th rowSpan={2}>Quantidade produzida</th><th rowSpan={2}>Visto do apontador</th></tr>
              <tr><th>Início</th><th colSpan={2}>Intervalo</th><th>Término</th></tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date.toISOString()}>
                  <td><b>{formatDate(date)}</b><span>{weekday(date)}</span></td>
                  <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="time-card-footer">
            <div><small>POLEGAR DIREITO</small></div>
            <div><p>A tarefa cumprida equivale à jornada de 8 horas.</p><span>ASSINATURA DO COLABORADOR</span></div>
            <div><span>ADMINISTRADOR</span></div>
          </footer>
        </article>
      ))}
    </>
  );
}
function MiniCalendar({ year, month, first, last }: { year: number; month: number; first: number; last: number }) {
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - offset + 1);
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  return <aside className="mini-calendar"><b>{title}</b><div className="mini-calendar-grid">{["S","T","Q","Q","S","S","D"].map((d,i)=><strong key={`${d}-${i}`}>{d}</strong>)}{cells.map((day,index)=><span key={index} className={day >= first && day <= last ? "selected" : ""}>{day > 0 && day <= days ? day : ""}</span>)}</div></aside>;
}
function matchesStatus(c: Contract, status: string) {
  return status === "all" || c.status === status;
}
function entryMatchesPeriod(entryDate: string, period: string) {
  if (period === "full") return true;
  const day = Number(entryDate.slice(8, 10));
  return period === "advance" ? day >= 1 && day <= 15 : day >= 16;
}
function entryMatchesPayrollPeriod(entry: Entry, period: string, services: Service[]) {
  if (period !== "balance") return entryMatchesPeriod(entry.entryDate, period);
  const day = Number(entry.entryDate.slice(8, 10));
  const description=services.find(service=>service.id===entry.serviceId)?.description||"";
  return day >= 16 && !/ADIANTAMENTO|VALE\s*SAL[AÁ]RIO/i.test(description);
}
function monthsBetween(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const result: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return result;
}
function periodLabel(month: string, period: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return period === "full"
    ? `Competência ${String(monthNumber).padStart(2, "0")}/${year} — mês completo`
    : period === "advance"
    ? `Período de 01 a 15/${String(monthNumber).padStart(2, "0")}/${year} — Adiantamento`
    : `Período de 16 a ${lastDay}/${String(monthNumber).padStart(2, "0")}/${year} — Saldo Mensal`;
}
function totals(p: Pack, id: string) {
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
  const documentLabel =
      company.documentType?.toLowerCase() === "caepf" ? "CAEPF" : "CNPJ",
    address = companyAddress(company);
  return (
    <header className="print-head">
      <div>
        <h1>{company.name}</h1>
        <p>
          <strong>
            {documentLabel}: {formatCompanyDocument(company.document)}
          </strong>
        </p>
        <p>{address}</p>
      </div>
      <div>
        <b>{title}</b>
        <span className="pay-period">{periodLabel(month, period)}</span>
      </div>
    </header>
  );
}
function formatCompanyDocument(document: string | null) {
  const value = String(document || "").replace(/\D/g, "");
  if (!value) return "não informado";
  return value.length === 14
    ? value.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5",
      )
    : document || value;
}
function companyAddress(company: Company) {
  const street = [
      company.address,
      company.addressNumber,
      company.addressComplement,
    ]
      .filter(Boolean)
      .join(", "),
    location = [company.district, company.city, company.state]
      .filter(Boolean)
      .join(" · "),
    postalCode = String(company.postalCode || "").replace(/\D/g, ""),
    cep =
      postalCode.length === 8
        ? `CEP ${postalCode.slice(0, 5)}-${postalCode.slice(5)}`
        : "";
  return (
    [street, location, cep].filter(Boolean).join(" — ") ||
    "Endereço não informado"
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
  const t = totals(p, c.id),service=(id:string)=>p.services.find(item=>item.id===id),
    competenceEntries=(p.competenceEntries||t.es).filter(entry=>entry.contractId===c.id&&entry.entryDate.slice(0,7)===month),
    inssBase=competenceEntries.filter(entry=>service(entry.serviceId)?.inssIncidence).reduce((sum,entry)=>sum+entry.amountCents,0),
    fgtsBase=competenceEntries.filter(entry=>service(entry.serviceId)?.fgtsIncidence).reduce((sum,entry)=>sum+entry.amountCents,0),
    fgtsValue=Math.round(fgtsBase*.08);
  return (
    <article className="receipt">
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
      <div className="receipt-bases">
        <div><small>Salário-base</small><b>{money(c.baseSalaryCents||0)}</b></div>
        <div><small>Base de contribuição INSS</small><b>{money(inssBase)}</b></div>
        <div><small>Base de cálculo FGTS</small><b>{money(fgtsBase)}</b></div>
        <div><small>Valor do FGTS (8%)</small><b>{money(fgtsValue)}</b></div>
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
    string,
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
function RangeHeader({
  company,
  title,
  dateStart,
  dateEnd,
}: {
  company: Company;
  title: string;
  dateStart: string;
  dateEnd: string;
}) {
  return (
    <header className="print-head">
      <div>
        <h1>{company.name}</h1>
        <p>
          <strong>
            {company.documentType?.toLowerCase() === "caepf" ? "CAEPF" : "CNPJ"}:{" "}
            {formatCompanyDocument(company.document)}
          </strong>
        </p>
        <p>{companyAddress(company)}</p>
      </div>
      <div>
        <b>{title}</b>
        <span className="pay-period">
          {formatDate(dateStart)} a {formatDate(dateEnd)}
        </span>
      </div>
    </header>
  );
}
function EventLaunchReport({
  packs,
  chosen,
  eventId,
  dateStart,
  dateEnd,
}: {
  packs: Pack[];
  chosen: { c: Contract; p: Pack }[];
  eventId: string;
  dateStart: string;
  dateEnd: string;
}) {
  return (
    <>
      {packs.map((pack) => {
        const workerIds = new Set(
          chosen
            .filter((item) => item.p.company.sourceId === pack.company.sourceId)
            .map((item) => item.c.id),
        );
        const rows = pack.entries
          .filter(
            (entry) =>
              workerIds.has(entry.contractId) &&
              (eventId === "all" || entry.serviceId === eventId),
          )
          .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
        return (
          <article className="detailed-report print-page" key={pack.company.sourceId}>
            <RangeHeader
              company={pack.company}
              title="RELATÓRIO DE LANÇAMENTOS POR EVENTO"
              dateStart={dateStart}
              dateEnd={dateEnd}
            />
            <table className="pay-table launch-event-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Colaborador</th>
                  <th>Evento</th>
                  <th>Quantidade</th>
                  <th>Valor</th>
                  <th>Desconto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td>
                      {pack.contracts.find((c) => c.id === entry.contractId)?.name ||
                        entry.contractId}
                    </td>
                    <td>
                      {pack.services.find((s) => s.id === entry.serviceId)
                        ?.description || entry.serviceId}
                    </td>
                    <td>{entry.quantity}</td>
                    <td>{money(entry.amountCents)}</td>
                    <td>{entry.discountCents ? money(entry.discountCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>TOTAL DO PERÍODO</th>
                  <th>{money(rows.reduce((sum, row) => sum + row.amountCents, 0))}</th>
                  <th>
                    {money(rows.reduce((sum, row) => sum + row.discountCents, 0))}
                  </th>
                </tr>
              </tfoot>
            </table>
          </article>
        );
      })}
    </>
  );
}
function FinancialReport({
  chosen,
  dateStart,
  dateEnd,
}: {
  chosen: { c: Contract; p: Pack }[];
  dateStart: string;
  dateEnd: string;
}) {
  const monthKeys = monthsBetween(dateStart, dateEnd);
  const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const monthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const label = monthFormatter
      .format(new Date(year, month - 1, 1))
      .replace(".", "");
    return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
  };
  return (
    <>
      {chosen.map(({ c, p }) => {
        const entries = p.entries
          .filter((entry) => entry.contractId === c.id)
          .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
        const serviceRows = [
          ...new Set(entries.map((entry) => entry.serviceId)),
        ]
          .map((serviceId) => {
            const service = p.services.find((item) => item.id === serviceId);
            const monthly = monthKeys.map((monthKey) =>
              entries
                .filter(
                  (entry) =>
                    entry.serviceId === serviceId &&
                    entry.entryDate.slice(0, 7) === monthKey,
                )
                .reduce(
                  (sum, entry) =>
                    sum + entry.amountCents - (entry.discountCents || 0),
                  0,
                ),
            );
            return {
              serviceId,
              code: service?.sourceId,
              description: service?.description || `Serviço ${serviceId}`,
              monthly,
              total: monthly.reduce((sum, value) => sum + value, 0),
            };
          })
          .sort(
            (a, b) =>
              Number(a.code || Number.MAX_SAFE_INTEGER) -
                Number(b.code || Number.MAX_SAFE_INTEGER) ||
              a.description.localeCompare(b.description, "pt-BR"),
          );
        const columnTotals = monthKeys.map((monthKey) =>
          entries.filter(entry=>entry.entryDate.slice(0,7)===monthKey).reduce((sum,entry)=>sum+entry.amountCents,0),
        );
        const grandTotal = columnTotals.reduce((sum, value) => sum + value, 0);
        return (
          <article
            className="financial-report financial-grid-report print-page employee-print-page"
            key={`${p.company.sourceId}-${c.id}`}
          >
            <RangeHeader
              company={p.company}
              title="FICHA FINANCEIRA"
              dateStart={dateStart}
              dateEnd={dateEnd}
            />
            <section className="financial-worker-data">
              <div className="financial-worker-name">
                <small>COLABORADOR</small>
                <b>{c.name}</b>
              </div>
              <div>
                <small>MATRÍCULA</small>
                <b>{c.registrationNumber || c.legacyCode || "—"}</b>
              </div>
              <div>
                <small>CPF</small>
                <b>{formatCpf(c.cpf)}</b>
              </div>
              <div>
                <small>PIS/PASEP</small>
                <b>{c.pis || "—"}</b>
              </div>
              <div>
                <small>NASCIMENTO</small>
                <b>{c.birthDate ? formatDate(c.birthDate) : "—"}</b>
              </div>
              <div>
                <small>IDENTIDADE</small>
                <b>{c.identityNumber || "—"}</b>
              </div>
              <div>
                <small>ADMISSÃO</small>
                <b>{c.admissionDate ? formatDate(c.admissionDate) : "—"}</b>
              </div>
              <div>
                <small>FUNÇÃO</small>
                <b>{c.role || "—"}</b>
              </div>
            </section>
            <table className="pay-table financial-grid">
              <thead>
                <tr>
                  <th>Cód. Descrição</th>
                  {monthKeys.map((monthKey) => (
                    <th key={monthKey}>{monthLabel(monthKey)}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((row) => (
                  <tr key={row.serviceId}>
                    <td>
                      <b className="financial-service-code">{row.code || "—"}</b>
                      <span>{row.description}</span>
                    </td>
                    {row.monthly.map((value, monthIndex) => (
                      <td key={`${row.serviceId}-${monthKeys[monthIndex]}`}>
                        {value ? financialMoney(value) : "—"}
                      </td>
                    ))}
                    <td>{financialMoney(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL</th>
                  {columnTotals.map((value, monthIndex) => (
                    <th key={`total-${monthKeys[monthIndex]}`}>
                      {financialMoney(value)}
                    </th>
                  ))}
                  <th>{financialMoney(grandTotal)}</th>
                </tr>
              </tfoot>
            </table>
          </article>
        );
      })}
    </>
  );
}
function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
function formatCpf(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    : value || "—";
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
  packs: _packs,
  chosen,
  month,
  period,
}: {
  packs: Pack[];
  chosen: { c: Contract; p: Pack }[];
  month: string;
  period: string;
}) {
  const companies = [
    ...new Map(
      chosen.map((item) => [item.p.company.sourceId, item.p.company]),
    ).values(),
  ];
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
    fgtsBase = chosen.reduce((sum, { p, c }) => {
      const competenceEntries = (p.competenceEntries || totals(p, c.id).es).filter(
        (entry) => entry.contractId === c.id && entry.entryDate.slice(0, 7) === month,
      );
      return sum + competenceEntries
        .filter((entry) => p.services.find((service) => service.id === entry.serviceId)?.fgtsIncidence)
        .reduce((subtotal, entry) => subtotal + entry.amountCents, 0);
    }, 0),
    projectedFgts = Math.round(fgtsBase * 0.08),
    qty = (n: number) =>
      new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
  return (
    <article className="summary-report">
      <div className="summary-company-heads">
        {companies.map((company) => (
          <Header
            key={company.sourceId}
            company={company}
            month={month}
            period={period}
            title="FOLHA RESUMIDA"
          />
        ))}
      </div>
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
          <tr className="summary-fgts-base">
            <th colSpan={2}>BASE DO FGTS DA COMPETÊNCIA</th>
            <th>{money(fgtsBase)}</th>
          </tr>
          <tr className="summary-fgts-projection">
            <th colSpan={2}>PROJEÇÃO DO RECOLHIMENTO DO FGTS (8%)</th>
            <th>{money(projectedFgts)}</th>
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
