export type WorkerReviewTab = "person" | "documents" | "address" | "contract";

export type WorkerReviewIssue = {
  field: string;
  label: string;
  tab: WorkerReviewTab;
};

type WorkerRecord = Record<string, unknown> & { needsReview?: boolean };

const empty = (value: unknown) => String(value ?? "").trim() === "";

export function workerReviewIssues(worker: WorkerRecord): WorkerReviewIssue[] {
  const issues: WorkerReviewIssue[] = [];
  const require = (field: string, label: string, tab: WorkerReviewTab) => {
    if (empty(worker[field])) issues.push({ field, label, tab });
  };

  require("cpf", "CPF", "person");
  require("birthDate", "data de nascimento", "person");
  require("motherName", "nome da mãe", "person");
  require("sex", "sexo", "person");
  require("education", "escolaridade", "person");
  require("maritalStatus", "estado civil", "person");
  require("raceColor", "raça/cor", "person");

  require("ctpsNumber", "número da CTPS", "documents");

  require("postalCode", "CEP", "address");
  require("address", "logradouro", "address");
  require("addressNumber", "número do endereço", "address");
  require("district", "bairro/distrito", "address");
  require("city", "município", "address");
  require("state", "UF", "address");

  require("matEs", "matrícula no eSocial", "contract");
  require("admissionDate", "data de admissão", "contract");
  require("role", "função", "contract");
  require("cboCode", "CBO", "contract");
  require("employmentLinkCode", "código do vínculo", "contract");

  if (!issues.length && worker.needsReview)
    issues.push({
      field: "legacyReview",
      label: "confirmar dados importados e salvar a ficha",
      tab: "person",
    });
  return issues;
}

export const workerNeedsReview = (worker: WorkerRecord) =>
  workerReviewIssues(worker).length > 0;

export const activeWorkerNeedsReview = (worker: WorkerRecord) => {
  const status = String(worker.status ?? "").trim().toLowerCase();
  const terminated = ["terminated", "desligado", "inativo", "d", "0"].includes(status) || !empty(worker.terminationDate);
  return !terminated && workerNeedsReview(worker);
};
