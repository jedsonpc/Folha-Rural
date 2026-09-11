"use client";
import { useState } from "react";
type Row = Record<string, unknown>;
type ImportScope =
  | "registrations"
  | "launches-all"
  | "launches-month"
  | "launches-year"
  | "inventory-costs"
  | "crops";
type ImportData = {
  fileName: string;
  companies: Row[];
  contracts: Row[];
  services: Row[];
  inventory?: {
    categories: Row[];
    suppliers: Row[];
    products: Row[];
    purchases: Row[];
    purchaseItems: Row[];
    crops?: Row[];
  };
  dependents: Row[];
  peopleCount: number;
  activeCount: number;
  dependentsCount: number;
  detailsCount: number;
  launchesCount: number;
  historyEntries?: Row[];
};
async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.status === 413
        ? "O arquivo excede o limite da hospedagem. Atualize o aplicativo e tente novamente."
        : `O servidor retornou uma resposta inválida (${response.status}).`,
    );
  }
}
export default function AccessImporter() {
  const currentYear = String(new Date().getFullYear());
  const [stage, setStage] = useState<
      "idle" | "reading" | "ready" | "sending" | "done" | "error"
    >("idle"),
    [data, setData] = useState<ImportData | null>(null),
    [file, setFile] = useState<File | null>(null),
    [scope, setScope] = useState<ImportScope>("registrations"),
    [month, setMonth] = useState(
      `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    ),
    [year, setYear] = useState(currentYear),
    [message, setMessage] = useState(""),
    [history, setHistory] = useState<{
      validated: number;
      imported: number;
      notIncluded: number;
      launchDays: number;
    } | null>(null);
  async function readFile(f: File) {
    setFile(f);
    setStage("reading");
    setMessage("");
    try {
      if (
        scope === "launches-month" &&
        !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
      )
        throw new Error(
          "Informe uma competência válida antes de analisar o arquivo.",
        );
      if (scope === "launches-year" && !/^20\d{2}$/.test(year))
        throw new Error("Informe um ano válido antes de analisar o arquivo.");
      const { parseAccessInBrowser } = await import("./access-browser-parser");
      const password = window.prompt("Digite a senha do arquivo Access:") || "";
      if (!password) throw new Error("A senha do arquivo é obrigatória.");
      const result = (await parseAccessInBrowser(f, password, {
        scope,
        month,
        year,
      })) as ImportData & { error?: string };
      if (result.detailsCount > 0 && !result.historyEntries?.length)
        throw new Error(
          "O arquivo possui detalhes de lançamentos, mas nenhum apontamento pôde ser preparado. A importação foi interrompida para evitar uma confirmação incorreta.",
        );
      setData(result);
      setStage("ready");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Não foi possível ler este arquivo Access.",
      );
      setStage("error");
    }
  }
  async function confirmImport() {
    if (!data || !file) return;
    setStage("sending");
    setMessage("");
    try {
      const { historyEntries: entries = [], ...registryData } = data;
      let response = await fetch("/api/import-access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(registryData),
        }),
        result = await responseJson<{
          error?: string;
          companyCodeRemap?: Record<string, string | number>;
          imported?: { contracts?: number };
          skippedExistingContracts?: number;
          inventoryStats?: {
            validated: number;
            imported: number;
            notIncluded: number;
          };
        }>(response);
      if (!response.ok) throw new Error(result.error || "Falha na gravação");
      const remap = result.companyCodeRemap || {};
      let imported = 0,
        received = 0;
      for (let i = 0; i < entries.length; i += 500) {
        const batch = entries
          .slice(i, i + 500)
          .map((row) => ({
            ...row,
            companySourceId: Number(
              remap[String(row.companySourceId)] ?? row.companySourceId,
            ),
          }));
        response = await fetch("/api/import-history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entries: batch }),
        });
        const part = await responseJson<{ error?: string; imported: number }>(
          response,
        );
        if (!response.ok)
          throw new Error(part.error || "Falha ao importar apontamentos");
        imported += Number(part.imported || 0);
        received += batch.length;
      }
      const registrationValidated = data.contracts.length;
      const registrationImported = Number(result.imported?.contracts || 0);
      const inventorySummary = result.inventoryStats;
      setHistory(
        scope === "registrations"
          ? {
              validated: registrationValidated,
              imported: registrationImported,
              notIncluded: Math.max(
                0,
                registrationValidated - registrationImported,
              ),
              launchDays: 0,
            }
          : scope === "inventory-costs" || scope === "crops"
            ? {
                validated: Number(inventorySummary?.validated || 0),
                imported: Number(inventorySummary?.imported || 0),
                notIncluded: Number(inventorySummary?.notIncluded || 0),
                launchDays: 0,
              }
            : {
                validated: received,
                imported,
                notIncluded: Math.max(0, received - imported),
                launchDays: data.launchesCount,
              },
      );
      setStage("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na importação");
      setStage("error");
    }
  }
  return (
    <section className="importer module">
      <div className="module-hero">
        <span>⇧</span>
        <div>
          <small>MIGRAÇÃO SEGURA</small>
          <h2>Importar banco do Microsoft Access</h2>
          <p>
            Pessoas, contratos, serviços e apontamentos são reorganizados sem
            alterar o arquivo original.
          </p>
        </div>
      </div>
      <div className="import-steps">
        <span className={stage !== "idle" ? "ok" : "active"}>
          1 <b>Selecionar</b>
        </span>
        <i />
        <span
          className={
            stage === "ready"
              ? "active"
              : stage === "sending" || stage === "done"
                ? "ok"
                : ""
          }
        >
          2 <b>Conferir</b>
        </span>
        <i />
        <span
          className={
            stage === "sending" ? "active" : stage === "done" ? "ok" : ""
          }
        >
          3 <b>Importar</b>
        </span>
      </div>
      {stage === "idle" && (
        <>
          <div className="import-filters">
            <h3>O que deseja revisar e importar?</h3>
            <div className="import-filter-grid">
              <label className={scope === "registrations" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "registrations"}
                  onChange={() => setScope("registrations")}
                />
                <span>
                  <b>Novos colaboradores</b>
                  <small>
                    Revisa cadastros e importa somente contratos ainda não
                    existentes.
                  </small>
                </span>
              </label>
              <label className={scope === "launches-all" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "launches-all"}
                  onChange={() => setScope("launches-all")}
                />
                <span>
                  <b>Todos os lançamentos</b>
                  <small>
                    Analisa o histórico completo, inclui novos apontamentos e
                    corrige os existentes sem duplicar.
                  </small>
                </span>
              </label>
              <label className={scope === "inventory-costs" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "inventory-costs"}
                  onChange={() => setScope("inventory-costs")}
                />
                <span>
                  <b>Custos e estoque</b>
                  <small>
                    Revisa grupos, fornecedores, produtos e entradas ainda não
                    existentes.
                  </small>
                </span>
              </label>
              <label className={scope === "crops" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "crops"}
                  onChange={() => setScope("crops")}
                />
                <span>
                  <b>Culturas</b>
                  <small>
                    Revisa e importa culturas agrícolas ainda não cadastradas.
                  </small>
                </span>
              </label>
              <label className={scope === "launches-month" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "launches-month"}
                  onChange={() => setScope("launches-month")}
                />
                <span>
                  <b>Competência específica</b>
                  <small>Analisa somente o mês e ano informados.</small>
                  {scope === "launches-month" && (
                    <input
                      type="month"
                      value={month}
                      onChange={(event) => setMonth(event.target.value)}
                    />
                  )}
                </span>
              </label>
              <label className={scope === "launches-year" ? "selected" : ""}>
                <input
                  type="radio"
                  name="importScope"
                  checked={scope === "launches-year"}
                  onChange={() => setScope("launches-year")}
                />
                <span>
                  <b>Ano específico</b>
                  <small>
                    Inclui e atualiza lançamentos de colaboradores já
                    cadastrados, sem duplicar.
                  </small>
                  {scope === "launches-year" && (
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                    />
                  )}
                </span>
              </label>
            </div>
          </div>
          <label className="dropzone">
            <strong>Selecione o banco Access</strong>
            <p>
              Arquivo .mdb · A leitura acontece com segurança no Folha Rural.
            </p>
            <input
              type="file"
              accept=".mdb,application/msaccess"
              onChange={(e) =>
                e.target.files?.[0] && readFile(e.target.files[0])
              }
            />
            <span>Escolher arquivo .mdb</span>
          </label>
        </>
      )}
      {stage === "reading" && (
        <div className="import-state">
          <b className="spinner" />
          <h3>Analisando somente o escopo selecionado…</h3>
          <p>
            O arquivo original permanece intacto; dados fora do filtro não
            entram no relatório.
          </p>
        </div>
      )}
      {data &&
        (stage === "ready" || stage === "sending" || stage === "done") && (
          <>
            <div className="import-file">
              <span>MDB</span>
              <div>
                <b>{data.fileName}</b>
                <small>Arquivo original preservado</small>
              </div>
              <em>{stage === "done" ? "Importado" : "Pronto para conferir"}</em>
            </div>
            <div className="import-counts">
              {scope === "registrations" ? (
                <>
                  <article>
                    <small>PESSOAS</small>
                    <strong>{data.peopleCount}</strong>
                    <p>cadastros distintos</p>
                  </article>
                  <article>
                    <small>CONTRATOS</small>
                    <strong>{data.contracts.length}</strong>
                    <p>{data.activeCount} ativos</p>
                  </article>
                  <article>
                    <small>SERVIÇOS</small>
                    <strong>{data.services.length}</strong>
                    <p>com grupos e incidências</p>
                  </article>
                  <article>
                    <small>DEPENDENTES</small>
                    <strong>
                      {data.dependentsCount || data.dependents.length}
                    </strong>
                    <p>vinculados aos colaboradores</p>
                  </article>
                </>
              ) : null}
              <article className="queued">
                <small>
                  {scope === "registrations"
                    ? "VALIDADOS"
                    : scope === "inventory-costs"
                      ? "DADOS DE CUSTO VALIDADOS"
                      : scope === "crops"
                        ? "CULTURAS VALIDADAS"
                        : "LANÇAMENTOS VALIDADOS"}
                </small>
                <strong>
                  {(scope === "registrations"
                    ? data.contracts.length
                    : scope === "inventory-costs"
                      ? (data.inventory?.categories.length || 0) +
                        (data.inventory?.suppliers.length || 0) +
                        (data.inventory?.products.length || 0) +
                        (data.inventory?.purchaseItems.length || 0)
                      : scope === "crops"
                        ? data.inventory?.crops?.length || 0
                        : data.detailsCount
                  ).toLocaleString("pt-BR")}
                </strong>
                <p>
                  {scope === "registrations"
                    ? "cadastros prontos para comparação"
                    : scope === "inventory-costs"
                      ? "grupos, fornecedores, produtos e entradas"
                      : scope === "crops"
                        ? "culturas prontas para comparação"
                        : `${data.launchesCount.toLocaleString("pt-BR")} dias dentro do filtro`}
                </p>
              </article>
            </div>
            {stage === "ready" && (
              <div className="import-actions">
                <p>
                  <b>Filtro aplicado antes do relatório:</b> somente os dados do
                  escopo escolhido foram validados. Lançamentos existentes são
                  corrigidos sem gerar duplicidade.
                </p>
                <button className="primary" onClick={confirmImport}>
                  {scope === "registrations"
                    ? "Importar novos colaboradores"
                    : scope === "inventory-costs"
                      ? "Importar custos e estoque"
                      : scope === "crops"
                        ? "Importar culturas"
                        : "Importar e atualizar lançamentos"}
                </button>
              </div>
            )}
            {stage === "sending" && (
              <div className="import-state compact">
                <b className="spinner" />
                <h3>Comparando, incluindo e corrigindo lançamentos…</h3>
                <p>
                  Com muitos lançamentos, esta etapa pode levar alguns minutos.
                  Não feche a janela.
                </p>
              </div>
            )}
            {stage === "done" && (
              <div className="import-success">
                <span>✓</span>
                <div>
                  <b>Importação concluída</b>
                  <p>
                    {history?.validated.toLocaleString("pt-BR")} registros
                    validados; {history?.imported.toLocaleString("pt-BR")}{" "}
                    incluídos ou atualizados e{" "}
                    {history?.notIncluded.toLocaleString("pt-BR")} não incluídos
                    (já existentes ou sem correspondência cadastral).
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setData(null);
                    setFile(null);
                    setHistory(null);
                    setStage("idle");
                  }}
                >
                  Importar outro
                </button>
              </div>
            )}
          </>
        )}
      {stage === "error" && (
        <div className="import-error">
          <b>Não foi possível concluir</b>
          <p>{message}</p>
          <button
            className="secondary"
            onClick={() => {
              setData(null);
              setFile(null);
              setStage("idle");
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </section>
  );
}
