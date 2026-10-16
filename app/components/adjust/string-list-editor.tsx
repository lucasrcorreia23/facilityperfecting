"use client";

import { Textarea } from "@heroui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { AddItemButton, EmptyNote } from "@/app/components/adjust/ui";

/** Lista de textos (falas de abertura, itens da cola), numerados, um por linha. */
export function StringListEditor({
  label,
  items,
  onChange,
  addLabel = "Adicionar",
  placeholder,
  emptyText = "Nada aqui ainda.",
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <EmptyNote>{emptyText}</EmptyNote>}
      {items.map((text, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="mt-2.5 w-4 shrink-0 text-right text-sm text-slate-400">{i + 1}.</span>
          <Textarea
            aria-label={`${label} ${i + 1}`}
            value={text}
            onValueChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))}
            radius="sm"
            variant="bordered"
            minRows={1}
            placeholder={placeholder}
            classNames={{ inputWrapper: "bg-white" }}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            title="Remover"
            aria-label="Remover"
            className="mt-2 shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <AddItemButton label={addLabel} onPress={() => onChange([...items, ""])} />
    </div>
  );
}
