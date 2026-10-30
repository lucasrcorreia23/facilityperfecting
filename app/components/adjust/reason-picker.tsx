"use client";

import { useState } from "react";
import { Input } from "@heroui/react";
import { cn } from "@/app/lib/cn";
import { ADJUST_REASON_KINDS, type AdjustReasonKind } from "@/supabase/functions/_shared/roleplay-adjust-model";

export interface AdjustReason {
  kind: AdjustReasonKind | null;
  text: string;
}

export const EMPTY_REASON: AdjustReason = { kind: null, text: "" };

export const reasonLabel = (kind: string | null) => ADJUST_REASON_KINDS.find((k) => k.id === kind)?.label ?? null;

/** "Por quê?" de uma calibração: um clique no tipo e, se quiser, qual teste ou pedido. */
export function ReasonPicker({ value, onChange }: { value: AdjustReason; onChange: (v: AdjustReason) => void }) {
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <span className="shrink-0 text-sm text-slate-600">Por quê?</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo do ajuste">
        {ADJUST_REASON_KINDS.map((k) => {
          const on = value.kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...value, kind: on ? null : k.id })}
              className={cn(
                "rounded-sm border px-2 py-1 text-xs transition-colors",
                on
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 text-slate-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {k.label}
            </button>
          );
        })}
      </div>
      <Input
        size="sm"
        radius="sm"
        variant="bordered"
        aria-label="Detalhe do motivo"
        placeholder="Qual teste ou pedido? (opcional)"
        value={value.text}
        onValueChange={(text) => onChange({ ...value, text })}
        maxLength={500}
        className="sm:flex-1"
      />
    </div>
  );
}

/**
 * Para dentro de um modal de confirmação, que guarda o conteúdo pronto: o estado
 * fica aqui, e quem abriu o modal lê o valor final por `onChange`.
 */
export function ReasonPickerField({ onChange }: { onChange: (v: AdjustReason) => void }) {
  const [value, setValue] = useState<AdjustReason>(EMPTY_REASON);
  return (
    <ReasonPicker
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}
