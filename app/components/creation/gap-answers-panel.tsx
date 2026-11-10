"use client";

import { Checkbox, Textarea } from "@heroui/react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";
import type { ImportGap } from "@/app/lib/types";
import type { MergeChange, MergeFieldKey } from "@/app/lib/reprocess-merge";
import { GAP_ANSWER_LIMITS, type GapAnswer, gapKey } from "@/supabase/functions/_shared/gap-answers";

const GAP_STYLES: Record<ImportGap["severidade"], { label: string; cls: string }> = {
  critico: { label: "Crítico", cls: "bg-red-50 text-red-700" },
  importante: { label: "Importante", cls: "bg-amber-50 text-amber-700" },
  opcional: { label: "Opcional", cls: "bg-slate-100 text-slate-600" },
};

/** O que está digitado numa lacuna aberta, antes de reprocessar. */
export interface GapInput {
  text: string;
  na: boolean;
}

export type GapInputs = Record<string, GapInput>;

const hasContent = (input: GapInput | undefined) => Boolean(input && (input.na || input.text.trim()));

/** As lacunas abertas que têm algo digitado, já no formato que vai para a IA. */
export function answersFromInputs(gaps: ImportGap[], inputs: GapInputs): GapAnswer[] {
  const now = new Date().toISOString();
  return gaps.flatMap((gap) => {
    const input = inputs[gapKey(gap)];
    if (!hasContent(input)) return [];
    return [
      {
        item: gap.item,
        grupo: gap.grupo,
        severidade: gap.severidade,
        resposta: input!.na ? "" : input!.text.trim(),
        nao_se_aplica: input!.na,
        answered_at: now,
      },
    ];
  });
}

function SeverityBadge({ severity }: { severity: ImportGap["severidade"] }) {
  const style = GAP_STYLES[severity] ?? GAP_STYLES.importante;
  return (
    <span className={`inline-flex shrink-0 self-start rounded-sm px-1.5 py-0.5 text-xs font-medium ${style.cls}`}>
      {style.label}
    </span>
  );
}

/**
 * Lacunas que a IA apontou, cada uma com um campo de resposta. Responder aqui e
 * reprocessar substitui a 2ª, 3ª, 4ª rodada de prompt: as respostas vão para a IA
 * como fonte de verdade e ficam gravadas no rascunho.
 */
export function GapAnswersPanel({
  gaps,
  answered,
  inputs,
  onInputChange,
  onReopen,
  onReprocess,
  processing,
  disabled,
}: {
  /** Lacunas ainda abertas (sem resposta de rodadas anteriores). */
  gaps: ImportGap[];
  /** Respostas já usadas num processamento — acompanham o rascunho. */
  answered: GapAnswer[];
  inputs: GapInputs;
  onInputChange: (key: string, input: GapInput) => void;
  /** Tira a resposta e devolve a lacuna para a lista aberta. */
  onReopen: (answer: GapAnswer) => void;
  onReprocess: () => void;
  processing: boolean;
  disabled: boolean;
}) {
  if (gaps.length === 0 && answered.length === 0) return null;
  const pending = gaps.filter((g) => hasContent(inputs[gapKey(g)])).length;
  const total = pending + answered.length;

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-700">
          {gaps.length > 0 ? `Informações faltantes (${gaps.length})` : "Nenhuma informação faltante em aberto"}
        </p>
        {gaps.length > 0 && (
          <p className="text-xs leading-relaxed text-slate-500">
            Responda aqui o que você sabe, mesmo que não esteja nos documentos, e reprocesse: a IA
            trata as respostas como fonte de verdade e reescreve os campos — não precisa refazer o
            prompt nem corrigir campo a campo. Deixe em branco o que não souber.
          </p>
        )}
      </div>

      {gaps.length > 0 && (
        <ul className="flex flex-col gap-4">
          {gaps.map((gap) => {
            const key = gapKey(gap);
            const input = inputs[key] ?? { text: "", na: false };
            return (
              <li key={key} className="flex flex-col gap-2">
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <SeverityBadge severity={gap.severidade} />
                  <span className="min-w-0 break-words">
                    <span className="text-slate-400">{gap.grupo}:</span> {gap.item}
                  </span>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                  <Textarea
                    aria-label={`Resposta para: ${gap.item}`}
                    placeholder={input.na ? "Marcada como não se aplica" : "Resposta curta — o que você sabe sobre isso"}
                    value={input.na ? "" : input.text}
                    onValueChange={(text) => onInputChange(key, { ...input, text })}
                    isDisabled={input.na || processing}
                    maxLength={GAP_ANSWER_LIMITS.answer}
                    minRows={1}
                    maxRows={6}
                    radius="sm"
                    variant="bordered"
                    classNames={{ base: "min-w-0 sm:flex-1", inputWrapper: "min-h-[44px] bg-white" }}
                  />
                  <Checkbox
                    size="sm"
                    isSelected={input.na}
                    onValueChange={(na) => onInputChange(key, { ...input, na })}
                    isDisabled={processing}
                    classNames={{ base: "min-h-[44px] shrink-0", label: "text-sm text-slate-600" }}
                  >
                    Não se aplica
                  </Checkbox>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {answered.length > 0 && (
        <details className="rounded-sm border border-slate-200 bg-white">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-medium text-slate-700">
            Respondidas ({answered.length}) — acompanham o rascunho
          </summary>
          <ul className="flex flex-col divide-y divide-slate-200 border-t border-slate-200">
            {answered.map((answer) => (
              <li key={gapKey(answer)} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <p className="break-words text-slate-500">
                    {answer.grupo ? `${answer.grupo}: ` : ""}
                    {answer.item}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-slate-800">
                    {answer.nao_se_aplica ? "Não se aplica" : answer.resposta}
                  </p>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  onPress={() => onReopen(answer)}
                  isDisabled={processing}
                  className="shrink-0 self-start"
                >
                  Reabrir
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-slate-500">
          {total === 0
            ? "Nenhuma resposta ainda."
            : `${total} ${total === 1 ? "resposta entra" : "respostas entram"} no próximo processamento${
                pending > 0 ? ` (${pending} ${pending === 1 ? "nova" : "novas"})` : ""
              }. O que você editou à mão é preservado.`}
        </p>
        <Button
          variant="secondary"
          onPress={onReprocess}
          isLoading={processing}
          isDisabled={disabled || total === 0}
          startContent={!processing ? <SparklesIcon className="h-4 w-4" /> : undefined}
          className="shrink-0"
        >
          Reprocessar com as respostas
        </Button>
      </div>
    </div>
  );
}

/**
 * Depois de "Reprocessar com as respostas": o que a IA atualizou e o que ficou como
 * o operador editou — com a opção de aceitar a versão nova de cada campo preservado.
 */
export function MergeReportNotice({
  changes,
  onUseAi,
  onDismiss,
}: {
  changes: MergeChange[];
  onUseAi: (key: MergeFieldKey) => void;
  onDismiss: () => void;
}) {
  const updated = changes.filter((c) => c.outcome !== "preserved");
  const preserved = changes.filter((c) => c.outcome === "preserved");
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-slate-800">Reprocessado com as respostas</p>
        <button
          type="button"
          onClick={onDismiss}
          className="-my-2 inline-flex min-h-[44px] shrink-0 items-center text-xs font-medium text-slate-500 underline hover:text-slate-700"
        >
          Dispensar
        </button>
      </div>
      {changes.length === 0 && <p>A IA não mudou nenhum campo com as respostas.</p>}
      {updated.length > 0 && (
        <p className="break-words leading-relaxed">
          <span className="font-medium">Atualizados pela IA:</span> {updated.map((c) => c.label).join(", ")}.
        </p>
      )}
      {preserved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="leading-relaxed">
            <span className="font-medium">Preservados porque você editou à mão.</span> A IA propôs
            uma versão nova com as respostas; trocar descarta a sua edição desse campo.
          </p>
          <ul className="flex flex-col gap-1">
            {preserved.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="break-words">{c.label}</span>
                <button
                  type="button"
                  onClick={() => onUseAi(c.key)}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-blue-700 underline hover:text-blue-900"
                >
                  Usar a versão da IA
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
