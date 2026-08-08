"use client";
import { useState } from "react";
type Row = Record<string, unknown>;
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
  try { return JSON.parse(text) as T; }
  catch { throw new Error(response.status === 413 ? "O arquivo excede o limite da hospedagem. Atualize o aplicativo e tente novamente." : `O servidor retornou uma resposta inválida (${response.status}).`); }
}
export default function AccessImporter() {
  const [stage, setStage] = useState<
      "idle" | "reading" | "ready" | "sending" | "done" | "error"
    >("idle"),
    [data, setData] = useState<ImportData | null>(null),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(""),
    [history, setHistory] = useState<{
      imported: number;
      launchDays: number;
    } | null>(null);
  async function readFile(f: File) {
    setFile(f);
    setStage("reading");
    setMessage("");
    try {
      const { parseAccessInBrowser } = await import("./access-browser-parser");
      const password = window.prompt("Digite a senha do arquivo Access:") || "";
      if (!password) throw new Error("A senha do arquivo é obrigatória.");
      const result = await parseAccessInBrowser(f,password) as ImportData & { error?: string };
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
      let response = await fetch("/api/import-access", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }),
        result = await responseJson<{ error?: string; companyCodeRemap?: Record<string,string|number> }>(response);
      if (!response.ok) throw new Error(result.error || "Falha na gravação");
      const remap=result.companyCodeRemap||{}, entries=data.historyEntries||[];
      let imported=0;
      for(let i=0;i<entries.length;i+=500){
        const batch=entries.slice(i,i+500).map(row=>({...row,companySourceId:Number(remap[String(row.companySourceId)]??row.companySourceId)}));
        response=await fetch("/api/import-history",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entries:batch})});
        const part=await responseJson<{error?:string;imported:number}>(response);
        if(!response.ok)throw new Error(part.error||"Falha ao importar apontamentos");
        imported+=Number(part.imported||0);
      }
      setHistory({imported,launchDays:data.launchesCount});
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
        <label className="dropzone">
          <strong>Selecione o banco Access</strong>
          <p>
            Arquivo .mdb · A leitura acontece com segurança no Folha Rural.
          </p>
          <input
            type="file"
            accept=".mdb,application/msaccess"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
          <span>Escolher arquivo .mdb</span>
        </label>
      )}
      {stage === "reading" && (
        <div className="import-state">
          <b className="spinner" />
          <h3>Lendo cadastros e histórico…</h3>
          <p>O arquivo original permanece intacto.</p>
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
              <article className="queued">
                <small>HISTÓRICO</small>
                <strong>{data.launchesCount.toLocaleString("pt-BR")}</strong>
                <p>
                  dias e {data.detailsCount.toLocaleString("pt-BR")} detalhes
                </p>
              </article>
            </div>
            {stage === "ready" && (
              <div className="import-actions">
                <p>
                  <b>Importação idempotente:</b> pode executar novamente; os
                  registros existentes serão atualizados sem duplicação.
                </p>
                <button className="primary" onClick={confirmImport}>
                  Importar tudo
                </button>
              </div>
            )}
            {stage === "sending" && (
              <div className="import-state compact">
                <b className="spinner" />
                <h3>Gravando cadastros e apontamentos históricos…</h3>
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
                    {history?.launchDays.toLocaleString("pt-BR")} dias e{" "}
                    {history?.imported.toLocaleString("pt-BR")} lançamentos
                    foram processados.
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
