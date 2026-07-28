import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error(
    "Uso: node scripts/export-d1-for-supabase.mjs BANCO.sqlite export.json",
  );
  process.exit(2);
}

const input = resolve(inputArg);
const output = resolve(outputArg);
const db = new DatabaseSync(input, { readOnly: true });
const tableNames = db
  .prepare(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  )
  .all()
  .map((row) => row.name);

const tables = {};
for (const name of tableNames) {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Tabela inválida: ${name}`);
  tables[name] = db.prepare(`select * from "${name}" order by rowid`).all();
}
db.close();

const payload = {
  format: "folha-rural-d1-export-v1",
  exportedAt: new Date().toISOString(),
  source: input,
  counts: Object.fromEntries(
    Object.entries(tables).map(([name, rows]) => [name, rows.length]),
  ),
  tables,
};
const serialized = JSON.stringify(payload);
const envelope = {
  ...payload,
  sha256: createHash("sha256").update(serialized).digest("hex"),
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(envelope, null, 2), {
  encoding: "utf8",
  flag: "wx",
});
console.log(
  JSON.stringify(
    {
      output,
      sha256: envelope.sha256,
      counts: envelope.counts,
    },
    null,
    2,
  ),
);
