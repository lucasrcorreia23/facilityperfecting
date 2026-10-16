"use client";

import { Input, Textarea } from "@heroui/react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AddButton } from "@/app/components/creation/dossier-editor";
import { AddItemButton, EmptyNote, fieldClassNames } from "@/app/components/adjust/ui";

export interface EditableGuardrail {
  nome: string;
  instrucao: string;
}

/**
 * Regras de comportamento do comprador. Na Criação o nome é só rótulo; no Ajustar
 * roleplay (`editableNames`) dá para renomear e criar regras novas (`newItem`).
 */
export function GuardrailListEditor<T extends EditableGuardrail>({
  items,
  onChange,
  editableNames = false,
  newItem,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  editableNames?: boolean;
  newItem?: () => T;
}) {
  const update = (index: number, patch: Partial<EditableGuardrail>) =>
    onChange(items.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  if (editableNames) {
    return (
      <div className="flex flex-col gap-4">
        {items.length === 0 && <EmptyNote>Nenhuma regra além das padrão da Perfecting.</EmptyNote>}
        {items.map((g, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-sm border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-sm text-slate-400">{i + 1}.</span>
              <Input
                aria-label={`Nome da regra ${i + 1}`}
                placeholder="Nome da regra (ex.: Não inventa números)"
                value={g.nome}
                onValueChange={(v) => update(i, { nome: v })}
                radius="sm"
                variant="bordered"
                classNames={{ inputWrapper: "bg-white", input: "font-medium" }}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                title="Remover regra"
                aria-label="Remover regra"
                className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="sm:pl-8">
              <Textarea
                aria-label={`O que o comprador deve fazer — regra ${i + 1}`}
                placeholder="Escreva a regra falando com o comprador: “Você nunca…”"
                value={g.instrucao}
                onValueChange={(v) => update(i, { instrucao: v })}
                radius="sm"
                variant="bordered"
                minRows={2}
                classNames={fieldClassNames}
              />
            </div>
          </div>
        ))}
        {newItem && <AddItemButton label="Adicionar regra" onPress={() => onChange([...items, newItem()])} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((g, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-1 flex-col gap-1">
            {editableNames && (
              <Input
                aria-label={`Nome da regra ${i + 1}`}
                value={g.nome}
                onValueChange={(v) => update(i, { nome: v })}
                radius="sm"
                variant="bordered"
                size="sm"
                placeholder="Nome da regra"
                classNames={{ inputWrapper: "bg-white" }}
              />
            )}
            <Textarea
              aria-label={`Regra ${i + 1}: ${g.nome}`}
              label={editableNames ? undefined : g.nome}
              labelPlacement="outside"
              value={g.instrucao}
              onValueChange={(v) => update(i, { instrucao: v })}
              radius="sm"
              variant="bordered"
              minRows={2}
              placeholder={editableNames ? "O que o comprador deve (ou não deve) fazer" : undefined}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            title="Remover regra"
            aria-label="Remover regra"
            className={`${editableNames ? "mt-1" : "mt-6"} shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600`}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      {newItem && <AddButton label="Adicionar regra" onPress={() => onChange([...items, newItem()])} />}
    </div>
  );
}
