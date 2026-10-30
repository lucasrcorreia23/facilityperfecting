"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { listProfiles } from "@/app/lib/db";
import type { Profile, RoleplayGeneration } from "@/app/lib/types";
import { generatorVersionLabel } from "@/app/lib/generator-label";
import { HistoryTab } from "@/app/components/adjust/history-tab";
import { cn } from "@/app/lib/cn";
import {
  changedItems,
  type DiffItem,
  diffGeneration,
  type SentSnapshot,
} from "@/supabase/functions/_shared/generation-diff";

const SCOPE_LABEL = { global: "Global", mode: "Modo", connection: "Conta" } as const;

const STATUS_STYLE: Record<DiffItem["status"], { label: string; cls: string }> = {
  same: { label: "igual", cls: "bg-slate-100 text-slate-600" },
  edited: { label: "editado", cls: "bg-amber-50 text-amber-700" },
  cleared: { label: "apagado", cls: "bg-rose-50 text-rose-700" },
  added: { label: "acrescentado", cls: "bg-emerald-50 text-emerald-700" },
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR");

/** Texto vira texto; lista e objeto viram JSON legível. */
const show = (v: unknown) => (v == null ? "—" : typeof v === "string" ? v || "—" : JSON.stringify(v, null, 2));

/** Uma etapa da linha do tempo: número, título, resumo e o detalhe embaixo. */
function Stage({
  n,
  title,
  summary,
  missing,
  last,
  children,
}: {
  n: number;
  title: string;
  summary?: ReactNode;
  /** Etapa sem registro: aparece apagada, porque a falta também é informação. */
  missing?: boolean;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            missing ? "bg-slate-100 text-slate-400" : "bg-[var(--primary)] text-white",
          )}
        >
          {n}
        </span>
        {!last && <span className="w-px flex-1 bg-slate-200" aria-hidden />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", last ? "" : "pb-8")}>
        <div className="flex flex-col gap-0.5 pt-1">
          <h3 className={cn("text-sm font-semibold", missing ? "text-slate-400" : "text-slate-800")}>{title}</h3>
          {summary && <p className="text-sm text-slate-500">{summary}</p>}
        </div>
        {children}
      </div>
    </li>
  );
}

function DiffRow({ item }: { item: DiffItem }) {
  const s = STATUS_STYLE[item.status];
  return (
    <details className="rounded-sm border border-slate-200">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-medium text-slate-700">{item.label}</span>
        <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium", s.cls)}>{s.label}</span>
        {item.detail && <span className="text-xs text-slate-500">{item.detail}</span>}
      </summary>
      <div className="grid gap-2 border-t border-slate-200 p-3 lg:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">A IA gerou</span>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-slate-50 p-2 text-[11px] text-slate-600">
            {show(item.ai)}
          </pre>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Foi enviado</span>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-emerald-50/50 p-2 text-[11px] text-slate-600">
            {show(item.sent)}
          </pre>
        </div>
      </div>
    </details>
  );
}

/**
 * A história do roleplay em quatro etapas: o que gerou, o que a equipe mudou antes
 * de enviar, o envio e cada calibração depois (com o motivo).
 */
export function TimelineTab({
  connectionId,
  caseSetupId,
  generation,
  refreshKey,
}: {
  connectionId: string;
  caseSetupId: number;
  /** undefined = carregando; null = sem registro de origem. */
  generation: RoleplayGeneration | null | undefined;
  refreshKey: number;
}) {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());

  useEffect(() => {
    let alive = true;
    listProfiles()
      .then((people) => alive && setProfiles(new Map(people.map((p) => [p.id, p]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (generation === undefined) return <p className="text-sm text-slate-500">Carregando…</p>;

  const who = (id: string | null) => {
    const p = id ? profiles.get(id) : undefined;
    return p?.display_name || p?.email || "—";
  };
  const gen = generation?.generator ?? null;
  const diff =
    generation?.ai_output && generation.sent
      ? diffGeneration(generation.ai_output, generation.sent as unknown as SentSnapshot)
      : null;
  const changed = changedItems(diff);

  return (
    <ol className="flex flex-col">
      <Stage
        n={1}
        title="Geração"
        missing={!gen}
        summary={
          gen
            ? `Gerador ${generatorVersionLabel(gen)} · ${gen.model} · ${gen.mode === "playbook" ? "por playbook" : "por metodologia"} · ${when(gen.processed_at)}`
            : generation
              ? "Enviado pela facility sem processamento por IA."
              : "Não registrado: criado fora da facility (script, plataforma) ou antes do versionamento."
        }
      >
        {gen && (
          <div className="text-sm text-slate-600">
            {gen.guidelines.length === 0 ? (
              <p>Nenhuma diretriz aplicada{gen.connection_id ? "" : " (conta escolhida depois do processamento)"}.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {gen.guidelines.map((g) => (
                  <li key={g.version_id}>
                    <span className="text-slate-400">{SCOPE_LABEL[g.scope_type]} ·</span> {g.title}{" "}
                    <span className="text-slate-400">v{g.version_no}</span>
                  </li>
                ))}
                <li>
                  <Link href="/diretrizes" className="text-xs text-slate-500 underline">
                    Ver diretrizes e histórico
                  </Link>
                </li>
              </ul>
            )}
          </div>
        )}
      </Stage>

      <Stage
        n={2}
        title="Revisão antes do envio"
        missing={!diff}
        summary={
          !diff
            ? "Sem registro do que a IA gerou para comparar."
            : changed.length === 0
              ? "Enviado como a IA gerou: nada editado à mão."
              : `${changed.length} ${changed.length === 1 ? "campo editado" : "campos editados"} à mão. Abra para comparar.`
        }
      >
        {changed.length > 0 && (
          <div className="flex flex-col gap-2">
            {changed.map((i) => (
              <DiffRow key={i.key} item={i} />
            ))}
          </div>
        )}
      </Stage>

      <Stage
        n={3}
        title="Envio"
        missing={!generation}
        summary={
          generation
            ? `${when(generation.created_at)} · ${who(generation.created_by)} · envio v${generation.export_version ?? "?"}`
            : "Não registrado."
        }
      />

      <Stage n={4} title="Calibrações" summary="Cada ajuste salvo nesta tela, com o motivo e o antes e o depois." last>
        <HistoryTab connectionId={connectionId} caseSetupId={caseSetupId} refreshKey={refreshKey} />
      </Stage>
    </ol>
  );
}
