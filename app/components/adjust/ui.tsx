"use client";

import type { ReactNode } from "react";
import { Input, Textarea } from "@heroui/react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { cn } from "@/app/lib/cn";

/**
 * Peças de layout das abas do Ajustar roleplay. A regra é uma só: cada aba diz o que
 * controla, cada seção tem título e respiro, e cada item de lista é um cartão com
 * cabeçalho — nada de campos sem rótulo empilhados.
 */

export const fieldClassNames = {
  inputWrapper: "bg-white",
  label: "text-sm text-slate-700",
  description: "text-xs text-slate-500",
};

/** Abertura da aba: uma frase dizendo o que ela controla. */
export function TabIntro({ children }: { children: ReactNode }) {
  return <p className="mb-6 max-w-3xl text-sm text-slate-500">{children}</p>;
}

/** Seção da aba: título curto, dica opcional e conteúdo. Sem caixa nem divisória. */
export function FormSection({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-3xl">
          <h3 className="text-sm font-medium text-slate-800">{title}</h3>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Cartão de um item de lista (objeção, regra, dor…). */
export function ItemCard({
  index,
  title,
  badge,
  onRemove,
  removeLabel = "Remover",
  children,
}: {
  index?: number;
  title: ReactNode;
  badge?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-slate-200 p-4">
      <div className="mb-4 flex items-center gap-2">
        {index != null && <span className="text-sm text-slate-400">{index}.</span>}
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{title}</div>
        {badge}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title={removeLabel}
            aria-label={removeLabel}
            className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      {children && <div className="flex flex-col gap-4">{children}</div>}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode; tone?: "slate" | "amber" }) {
  return <span className="shrink-0 text-xs text-slate-500">{children}</span>;
}

export function AddItemButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-fit items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-800"
    >
      <PlusIcon className="w-4 h-4" />
      {label}
    </button>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

/** Pares título → texto (fatos, briefing): rótulo à esquerda, texto à direita. */
export function KeyValueEditor({
  items,
  onChange,
  keyLabel = "Assunto",
  valueLabel = "Texto",
  addLabel = "Adicionar",
  emptyText = "Nada aqui ainda.",
}: {
  items: Array<{ titulo: string; texto: string }>;
  onChange: (next: Array<{ titulo: string; texto: string }>) => void;
  keyLabel?: string;
  valueLabel?: string;
  addLabel?: string;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((t, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[200px_1fr_auto] sm:items-start sm:gap-3">
              <Input
                aria-label={`${keyLabel} ${i + 1}`}
                placeholder={keyLabel}
                value={t.titulo}
                onValueChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, titulo: v } : x)))}
                radius="sm"
                variant="bordered"
                classNames={{ inputWrapper: "bg-white" }}
              />
              <Textarea
                aria-label={`${valueLabel} ${i + 1}`}
                placeholder={valueLabel}
                value={t.texto}
                onValueChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, texto: v } : x)))}
                radius="sm"
                variant="bordered"
                minRows={1}
                classNames={{ inputWrapper: "bg-white" }}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                title="Remover"
                aria-label="Remover"
                className="justify-self-end rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:mt-2"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <AddItemButton label={addLabel} onPress={() => onChange([...items, { titulo: "", texto: "" }])} />
    </div>
  );
}
