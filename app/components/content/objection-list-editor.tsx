"use client";

import { Input, Select, SelectItem, Textarea } from "@heroui/react";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import { AddButton } from "@/app/components/creation/dossier-editor";
import { AddItemButton, Badge, EmptyNote, fieldClassNames } from "@/app/components/adjust/ui";

/** O mínimo que o editor mexe; o resto do item (ids, escopo) passa intacto. */
export interface EditableObjection {
  titulo: string;
  tipo: string;
  fala_exemplo: string;
  detalhes: string;
  ceder_se: string;
}

/**
 * Lista de objeções do comprador: título, tipo, como ele diz e quando cede.
 * Usada na Criação (antes do envio) e no Ajustar roleplay (depois).
 *  - `typeOptions`: mostra um seletor de tipo; sem ele, o tipo aparece só como selo.
 *  - `showDetails`: mostra o campo "Detalhes" (contexto interno da objeção).
 *  - `newItem`: habilita o botão de adicionar.
 *  - `badge`: selo extra por item (ex.: "vale para o contexto").
 *  - `layout="card"`: cada objeção num cartão com campos rotulados (Ajustar roleplay).
 */
export function ObjectionListEditor<T extends EditableObjection>({
  items,
  onChange,
  typeOptions,
  showDetails = false,
  newItem,
  badge,
  layout = "compact",
}: {
  items: T[];
  onChange: (next: T[]) => void;
  typeOptions?: Array<{ slug: string; name: string }>;
  showDetails?: boolean;
  newItem?: () => T;
  badge?: (item: T) => string | null;
  layout?: "compact" | "card";
}) {
  const update = (index: number, patch: Partial<EditableObjection>) =>
    onChange(items.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  if (layout === "card") {
    return (
      <div className="flex flex-col gap-4">
        {items.length === 0 && <EmptyNote>Nenhuma objeção. O comprador não vai resistir a nada.</EmptyNote>}
        {items.map((o, i) => {
          const extra = badge?.(o);
          return (
            <div key={i} className="flex flex-col gap-4 rounded-sm border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-sm text-slate-400">{i + 1}.</span>
                <Input
                  aria-label={`Título da objeção ${i + 1}`}
                  placeholder="Título da objeção (ex.: Está caro)"
                  value={o.titulo}
                  onValueChange={(v) => update(i, { titulo: v })}
                  radius="sm"
                  variant="bordered"
                  classNames={{ inputWrapper: "bg-white", input: "font-medium" }}
                />
                {typeOptions && (
                  <Select
                    aria-label={`Tipo da objeção ${i + 1}`}
                    selectedKeys={o.tipo ? [o.tipo] : []}
                    onSelectionChange={(keys) => {
                      const k = Array.from(keys)[0];
                      if (k) update(i, { tipo: String(k) });
                    }}
                    radius="sm"
                    className="max-w-[220px]"
                    classNames={managerSelectClassNames}
                    placeholder="Tipo"
                  >
                    {typeOptions.map((t) => (
                      <SelectItem key={t.slug} classNames={selectItemClassNames}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </Select>
                )}
                {extra && <Badge>{extra}</Badge>}
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  title="Remover objeção"
                  aria-label="Remover objeção"
                  className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-4 sm:pl-8">
                <Textarea
                  label="Como o comprador diz"
                  labelPlacement="outside"
                  placeholder="A fala de exemplo, do jeito dele"
                  value={o.fala_exemplo}
                  onValueChange={(v) => update(i, { fala_exemplo: v })}
                  radius="sm"
                  variant="bordered"
                  minRows={1}
                  classNames={fieldClassNames}
                />
                {showDetails && (
                  <Textarea
                    label="Por que ele levanta isso"
                    labelPlacement="outside"
                    placeholder="O que está por trás da objeção (o vendedor não vê)"
                    value={o.detalhes}
                    onValueChange={(v) => update(i, { detalhes: v })}
                    radius="sm"
                    variant="bordered"
                    minRows={1}
                    classNames={fieldClassNames}
                  />
                )}
                <Textarea
                  label="Ele cede quando"
                  labelPlacement="outside"
                  description="Sem isto o comprador repete a objeção até o fim e o treino não fecha."
                  placeholder="O que o vendedor precisa fazer para superar"
                  value={o.ceder_se}
                  onValueChange={(v) => update(i, { ceder_se: v })}
                  radius="sm"
                  variant="bordered"
                  minRows={1}
                  classNames={fieldClassNames}
                />
              </div>
            </div>
          );
        })}
        {newItem && <AddItemButton label="Adicionar objeção" onPress={() => onChange([...items, newItem()])} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((o, i) => {
        const extra = badge?.(o);
        return (
          <div key={i} className="flex flex-col gap-2 rounded-sm bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Título da objeção ${i + 1}`}
                value={o.titulo}
                onValueChange={(v) => update(i, { titulo: v })}
                radius="sm"
                variant="bordered"
                size="sm"
                classNames={{ inputWrapper: "bg-white" }}
              />
              {typeOptions ? (
                <Select
                  aria-label={`Tipo da objeção ${i + 1}`}
                  selectedKeys={o.tipo ? [o.tipo] : []}
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0];
                    if (k) update(i, { tipo: String(k) });
                  }}
                  size="sm"
                  radius="sm"
                  className="max-w-[220px]"
                  classNames={managerSelectClassNames}
                  placeholder="Tipo"
                >
                  {typeOptions.map((t) => (
                    <SelectItem key={t.slug} classNames={selectItemClassNames}>
                      {t.name}
                    </SelectItem>
                  ))}
                </Select>
              ) : (
                <span className="shrink-0 rounded-sm bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {o.tipo}
                </span>
              )}
              {extra && (
                <span className="shrink-0 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {extra}
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                title="Remover objeção"
                aria-label="Remover objeção"
                className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <Textarea
              label="Como o comprador diz"
              labelPlacement="outside"
              value={o.fala_exemplo}
              onValueChange={(v) => update(i, { fala_exemplo: v })}
              radius="sm"
              variant="bordered"
              minRows={2}
              classNames={{ inputWrapper: "bg-white" }}
            />
            {showDetails && (
              <Textarea
                label="Detalhes (por que ele levanta isso)"
                labelPlacement="outside"
                value={o.detalhes}
                onValueChange={(v) => update(i, { detalhes: v })}
                radius="sm"
                variant="bordered"
                minRows={2}
                classNames={{ inputWrapper: "bg-white" }}
              />
            )}
            <Textarea
              label="Ceda se"
              labelPlacement="outside"
              value={o.ceder_se}
              onValueChange={(v) => update(i, { ceder_se: v })}
              radius="sm"
              variant="bordered"
              minRows={2}
              description="Sem isto o comprador repete a objeção até o fim e o treino não fecha."
              classNames={{ inputWrapper: "bg-white" }}
            />
          </div>
        );
      })}
      {newItem && <AddButton label="Adicionar objeção" onPress={() => onChange([...items, newItem()])} />}
    </div>
  );
}
