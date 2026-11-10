"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@heroui/react";
import { listDrafts } from "@/app/lib/db";
import { type ReviewedDraftOption, reviewedDraftOptions } from "@/app/lib/reviewed-drafts";
import type { DraftRow } from "@/app/lib/types";
import { MAX_REVIEWED_DRAFTS } from "@/supabase/functions/_shared/reviewed-draft-refs";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Rascunhos da Biblioteca (os do usuário), carregados uma vez por tela. */
export function useLibraryDrafts(enabled = true): { drafts: DraftRow[] | null; error: string | null } {
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    listDrafts()
      .then((rows) => {
        if (active) setDrafts(rows);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return { drafts, error };
}

/**
 * "Incluir o material revisado de um rascunho": escolhe de quais rascunhos da
 * Biblioteca o playbook leva os campos revisados (oferta, perfil, objeções, regras,
 * cenário) e as respostas às lacunas, somados ao material dos documentos.
 */
export function ReviewedDraftPicker({
  drafts,
  error,
  value,
  onChange,
  preferConnectionId,
  isDisabled,
}: {
  /** null = carregando. */
  drafts: DraftRow[] | null;
  error?: string | null;
  /** Ids dos rascunhos escolhidos, na ordem da escolha. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Conta para onde o playbook já foi enviado: os rascunhos dela vêm primeiro. */
  preferConnectionId?: string | null;
  isDisabled?: boolean;
}) {
  const options: ReviewedDraftOption[] = drafts ? reviewedDraftOptions(drafts, preferConnectionId) : [];
  const known = new Set(options.map((o) => o.id));
  const gone = value.filter((id) => drafts != null && !known.has(id));
  const atLimit = value.length >= MAX_REVIEWED_DRAFTS;

  const toggle = (id: string, selected: boolean) =>
    onChange(selected ? [...value.filter((v) => v !== id), id] : value.filter((v) => v !== id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-700">Incluir o material revisado de um rascunho</p>
        <p className="text-xs leading-relaxed text-slate-500">
          Opcional. Leva para o playbook o que já foi revisado no roleplay — oferta, perfil,
          objeções, regras e as respostas às lacunas — como material que{" "}
          <b>prevalece sobre os documentos quando conflitar</b>. Sem isso, o playbook é estruturado
          só a partir dos documentos originais.
        </p>
      </div>

      {error ? (
        <p className="rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Não foi possível listar os rascunhos da Biblioteca ({error}). O playbook pode ser gerado
          sem material revisado.
        </p>
      ) : drafts == null ? (
        <p className="text-xs text-slate-500">Carregando os rascunhos da Biblioteca…</p>
      ) : options.length === 0 ? (
        <p className="rounded-sm border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
          Nenhum rascunho processado por IA na Biblioteca. Processe o material na Criação e salve o
          roleplay para ele aparecer aqui.
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col divide-y divide-slate-200 overflow-y-auto rounded-sm border border-slate-200 bg-white">
          {options.map((o) => {
            const selected = value.includes(o.id);
            return (
              <li key={o.id}>
                <Checkbox
                  size="sm"
                  isSelected={selected}
                  onValueChange={(next) => toggle(o.id, next)}
                  isDisabled={isDisabled || (!selected && atLimit)}
                  classNames={{
                    base: "m-0 flex min-h-[44px] w-full max-w-full items-start gap-1 px-3 py-2",
                    label: "min-w-0 flex-1",
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words text-sm text-slate-800">{o.title}</span>
                    <span className="break-words text-xs text-slate-500">
                      {[
                        o.account,
                        formatDate(o.updated_at) && `atualizado em ${formatDate(o.updated_at)}`,
                        o.answers > 0 &&
                          `${o.answers} ${o.answers === 1 ? "resposta" : "respostas"} às lacunas`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </Checkbox>
              </li>
            );
          })}
        </ul>
      )}

      {gone.length > 0 && (
        <p className="text-xs leading-relaxed text-amber-700">
          {gone.length === 1 ? "1 rascunho escolhido antes" : `${gone.length} rascunhos escolhidos antes`} não{" "}
          {gone.length === 1 ? "está" : "estão"} mais na Biblioteca e{" "}
          {gone.length === 1 ? "fica" : "ficam"} de fora.{" "}
          <button
            type="button"
            onClick={() => onChange(value.filter((id) => known.has(id)))}
            className="inline-flex min-h-[44px] items-center font-medium underline"
          >
            Tirar da seleção
          </button>
        </p>
      )}
      {atLimit && (
        <p className="text-xs text-slate-500">Limite de {MAX_REVIEWED_DRAFTS} rascunhos por playbook.</p>
      )}
    </div>
  );
}
