"use client";

import { useEffect, useState } from "react";
import { listAdjustments, listProfiles } from "@/app/lib/db";
import type { Profile, RoleplayAdjustment } from "@/app/lib/types";

export const SECTION_LABELS: Record<string, string> = {
  general: "Geral",
  prior_knowledge: "O que o comprador já sabe",
  step_knowledge: "Conhecimento por bloco",
  objections: "Objeções",
  persona: "Persona e dores",
  guardrails: "Regras",
  regenerate: "Regeneração com IA",
};

/** Quem mudou o quê e quando, com o antes e o depois para desfazer à mão. */
export function HistoryTab({
  connectionId,
  caseSetupId,
  refreshKey,
}: {
  connectionId: string;
  caseSetupId: number;
  /** Muda a cada salvar, para recarregar a lista. */
  refreshKey: number;
}) {
  const [items, setItems] = useState<RoleplayAdjustment[] | null>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listAdjustments(connectionId, caseSetupId), listProfiles()])
      .then(([rows, people]) => {
        if (!alive) return;
        setItems(rows);
        setProfiles(new Map(people.map((p) => [p.id, p])));
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [connectionId, caseSetupId, refreshKey]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!items) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (items.length === 0) return <p className="text-sm text-slate-500">Nenhum ajuste feito por esta tela ainda.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((a) => {
        const who = a.created_by ? profiles.get(a.created_by) : undefined;
        return (
          <li key={a.id} className="rounded-sm border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-slate-700">{SECTION_LABELS[a.section] ?? a.section}</span>
              <span className="text-xs text-slate-400">
                {new Date(a.created_at).toLocaleString("pt-BR")} · {who?.display_name || who?.email || "—"}
              </span>
            </div>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
              {(a.summary ?? []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {a.before != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500">Ver antes e depois</summary>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-slate-50 p-2 text-[11px] text-slate-600">
                    {JSON.stringify(a.before, null, 2)}
                  </pre>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-emerald-50/50 p-2 text-[11px] text-slate-600">
                    {JSON.stringify(a.after, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
