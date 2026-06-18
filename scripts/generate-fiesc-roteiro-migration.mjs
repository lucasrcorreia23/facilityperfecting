#!/usr/bin/env node
/**
 * Gera supabase/migrations/0013_fiesc_roteiros_expanded.sql a partir dos .md em app/data/fiesc-roteiros/.
 *
 * Uso: node scripts/generate-fiesc-roteiro-migration.mjs [--out path/to/file.sql]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ROTEIROS_DIR = join(ROOT, "app/data/fiesc-roteiros");
const DEFAULT_OUT = join(ROOT, "supabase/migrations/0013_fiesc_roteiros_expanded.sql");

const MAPPING = [
  { file: "RP1.1_test_roteiro.md", dbName: "RP1.1 (v3) MBI", tag: "fiesc_exp_rp11" },
  { file: "RP1.2_test_roteiro.md", dbName: "RP1.2 (v3) MBI", tag: "fiesc_exp_rp12" },
  { file: "RP1.3_test_roteiro.md", dbName: "RP1.3 (v3) MBI", tag: "fiesc_exp_rp13" },
  { file: "RP2.1_test_roteiro.md", dbName: "RP2.1 (v3) SENAI", tag: "fiesc_exp_rp21" },
  { file: "RP2.2_test_roteiro.md", dbName: "RP2.2 (v3) SENAI", tag: "fiesc_exp_rp22" },
  { file: "RP2.3_test_roteiro.md", dbName: "RP2.3 (v3) SENAI", tag: "fiesc_exp_rp23" },
];

function pickDollarTag(content, preferred) {
  if (!content.includes(`$${preferred}$`)) return preferred;
  for (let i = 1; i <= 99; i++) {
    const tag = `${preferred}_${i}`;
    if (!content.includes(`$${tag}$`)) return tag;
  }
  throw new Error("Could not find safe dollar-quote tag");
}

function escapeSqlString(name) {
  return name.replace(/'/g, "''");
}

function buildUpdate({ content, dbName, tag }) {
  const safeTag = pickDollarTag(content, tag);
  const body = content.trimEnd();
  return `update public.roleplay_readiness rr
  set roteiro = $${safeTag}$${body}$${safeTag}$,
      updated_at = now()
  from public.tracking_clients tc
  where rr.client_id = tc.id
    and lower(trim(tc.name)) = 'fiesc'
    and rr.name = '${escapeSqlString(dbName)}';`;
}

function main() {
  const outArg = process.argv.indexOf("--out");
  const outPath = outArg >= 0 ? process.argv[outArg + 1] : DEFAULT_OUT;

  const updates = MAPPING.map(({ file, dbName, tag }) => {
    const path = join(ROTEIROS_DIR, file);
    const content = readFileSync(path, "utf8");
    return buildUpdate({ content, dbName, tag });
  });

  const sql = `-- Roteiros FIESC ampliados (~18–21 falas) — gerado por scripts/generate-fiesc-roteiro-migration.mjs
-- Fonte: app/data/fiesc-roteiros/RP*_test_roteiro.md

${updates.join("\n\n")}
`;

  writeFileSync(outPath, sql, "utf8");
  console.log(`Wrote ${outPath} (${updates.length} UPDATEs)`);
}

main();
