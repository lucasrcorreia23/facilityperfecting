"use client";

import { Input, Select, SelectItem, Textarea } from "@heroui/react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import type { DossierRevealLevel, DossierTopic, RoleplayDossier } from "@/app/lib/types";

const REVEAL_OPTIONS: Array<{ key: DossierRevealLevel; label: string; hint: string }> = [
  { key: "superficie", label: "Superfície", hint: "diz logo no início" },
  { key: "sondada", label: "Sondada", hint: "revela se perguntarem sobre o assunto" },
  { key: "oculta", label: "Oculta", hint: "só com pergunta direta e aprofundamento" },
];

const NO_PRODUCT = "__none__";

const field = { inputWrapper: "bg-white" };

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      title={label}
      aria-label={label}
      className="shrink-0 rounded-sm p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
    >
      <XMarkIcon className="w-4 h-4" />
    </button>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-fit items-center gap-1 rounded-sm px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
    >
      <PlusIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function TopicList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: DossierTopic[];
  onChange: (next: DossierTopic[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Input
              aria-label={`${label}: título ${i + 1}`}
              value={t.titulo}
              onValueChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, titulo: v } : x)))}
              radius="sm"
              variant="bordered"
              size="sm"
              classNames={field}
            />
            <Textarea
              aria-label={`${label}: texto ${i + 1}`}
              value={t.texto}
              onValueChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, texto: v } : x)))}
              radius="sm"
              variant="bordered"
              minRows={1}
              classNames={field}
            />
          </div>
          <RemoveButton label="Remover" onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label="Adicionar" onPress={() => onChange([...items, { titulo: "", texto: "" }])} />
    </div>
  );
}

/**
 * Editor do dossiê do comprador (modo metodologia). O lado do comprador (persona,
 * dores, conhecimento) e o lado do vendedor (ofertas, rubricas) ficam separados na
 * tela do mesmo jeito que no envio: o comprador nunca recebe nome de produto.
 */
export function DossierEditor({
  value,
  onChange,
  onRemove,
}: {
  value: RoleplayDossier;
  onChange: (next: RoleplayDossier) => void;
  onRemove: () => void;
}) {
  const d = value;
  const persona = d.persona;
  const setPersona = (patch: Partial<RoleplayDossier["persona"]>) =>
    onChange({ ...d, persona: { ...persona, ...patch } });

  /** Renomear a dor precisa andar junto nas duas listas (a persona referencia pelo título). */
  function renamePain(oldTitle: string, next: string) {
    onChange({
      ...d,
      dores: d.dores.map((p) => (p.titulo === oldTitle ? { ...p, titulo: next } : p)),
      persona: {
        ...persona,
        dores: persona.dores.map((p) => (p.dor === oldTitle ? { ...p, dor: next } : p)),
      },
    });
  }

  function setPainProduct(title: string, product: string) {
    onChange({
      ...d,
      dores: d.dores.map((p) => (p.titulo === title ? { ...p, produto: product } : p)),
    });
  }

  function removePain(index: number) {
    const title = persona.dores[index]?.dor;
    const stillUsed = persona.dores.some((p, j) => j !== index && p.dor === title);
    onChange({
      ...d,
      dores: stillUsed ? d.dores : d.dores.filter((p) => p.titulo !== title),
      persona: { ...persona, dores: persona.dores.filter((_, j) => j !== index) },
    });
  }

  function addPain() {
    const title = `Nova dor ${persona.dores.length + 1}`;
    onChange({
      ...d,
      dores: [...d.dores, { titulo: title, descricao: "", produto: "" }],
      persona: {
        ...persona,
        dores: [...persona.dores, { dor: title, revelacao: "sondada", detalhe: "" }],
      },
    });
  }

  function removeProduct(name: string) {
    onChange({
      ...d,
      produtos: d.produtos.filter((p) => p.nome !== name),
      dores: d.dores.map((p) => (p.produto === name ? { ...p, produto: "" } : p)),
      persona: { ...persona, produtos: persona.produtos.filter((p) => p.produto !== name) },
    });
  }

  function renameProduct(oldName: string, next: string) {
    onChange({
      ...d,
      produtos: d.produtos.map((p) => (p.nome === oldName ? { ...p, nome: next } : p)),
      dores: d.dores.map((p) => (p.produto === oldName ? { ...p, produto: next } : p)),
      persona: {
        ...persona,
        produtos: persona.produtos.map((p) => (p.produto === oldName ? { ...p, produto: next } : p)),
      },
    });
  }

  function setStance(name: string, stance: string) {
    const has = persona.produtos.some((p) => p.produto === name);
    setPersona({
      produtos: has
        ? persona.produtos.map((p) => (p.produto === name ? { ...p, postura: stance } : p))
        : [...persona.produtos, { produto: name, postura: stance }],
    });
  }

  function addProduct() {
    const name = `Nova oferta ${d.produtos.length + 1}`;
    onChange({
      ...d,
      produtos: [...d.produtos, { nome: name, descricao: "", problema_resolvido: "", beneficios: "" }],
      persona: { ...persona, produtos: [...persona.produtos, { produto: name, postura: "" }] },
    });
  }

  const opening = [0, 1, 2].map((i) => d.abertura[i] ?? "");

  return (
    <div className="flex flex-col gap-5 rounded-sm border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          title="Dossiê do comprador"
          hint="O material descreve um comprador concreto: ele entra com as dores em camadas, as ofertas ligadas a cada dor e o que sabe. Substitui o que a Perfecting geraria sozinha (e costuma inventar números)."
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-sm px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Não usar dossiê
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle title="Comprador" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Nome" labelPlacement="outside" value={persona.nome} onValueChange={(v) => setPersona({ nome: v })} radius="sm" variant="bordered" />
          <Select
            label="Gênero"
            labelPlacement="outside-top"
            selectedKeys={persona.genero ? [persona.genero] : []}
            onSelectionChange={(keys) =>
              setPersona({ genero: (String(Array.from(keys)[0] ?? "") as RoleplayDossier["persona"]["genero"]) })
            }
            radius="sm"
            variant="bordered"
            classNames={managerSelectClassNames}
            description="Define a voz do comprador."
          >
            <SelectItem key="feminino">Feminino</SelectItem>
            <SelectItem key="masculino">Masculino</SelectItem>
          </Select>
          <Input label="Cargo" labelPlacement="outside" value={persona.cargo} onValueChange={(v) => setPersona({ cargo: v })} radius="sm" variant="bordered" />
          <Input label="Área" labelPlacement="outside" value={persona.area} onValueChange={(v) => setPersona({ area: v })} radius="sm" variant="bordered" />
          <Input label="Empresa" labelPlacement="outside" value={persona.empresa_nome} onValueChange={(v) => setPersona({ empresa_nome: v })} radius="sm" variant="bordered" />
        </div>
        <Textarea
          label="Perfil da empresa"
          labelPlacement="outside"
          value={persona.empresa_perfil}
          onValueChange={(v) => setPersona({ empresa_perfil: v })}
          radius="sm"
          variant="bordered"
          minRows={2}
        />
        <Textarea
          label="Quem é o comprador"
          labelPlacement="outside"
          description="Momento da conversa, o que ele sabe, tom e como reage. Sem nome de oferta e sem as dores (elas vêm abaixo)."
          disableAutosize
          value={persona.prompt}
          onValueChange={(v) => setPersona({ prompt: v })}
          radius="sm"
          variant="bordered"
          classNames={{ input: "h-72 overflow-y-auto resize-y" }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle
          title={`Dores em camadas (${persona.dores.length})`}
          hint="Sondadas aparecem na ficha do vendedor; o que ele precisa descobrir de verdade fica como oculta."
        />
        {persona.dores.map((p, i) => {
          const pain = d.dores.find((x) => x.titulo === p.dor);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-sm bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Dor ${i + 1}`}
                  value={p.dor}
                  onValueChange={(v) => renamePain(p.dor, v)}
                  radius="sm"
                  variant="bordered"
                  size="sm"
                  classNames={field}
                />
                <RemoveButton label="Remover dor" onPress={() => removePain(i)} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  label="Quando revela"
                  labelPlacement="outside-top"
                  selectedKeys={[p.revelacao]}
                  onSelectionChange={(keys) => {
                    const next = String(Array.from(keys)[0] ?? "sondada") as DossierRevealLevel;
                    setPersona({ dores: persona.dores.map((x, j) => (j === i ? { ...x, revelacao: next } : x)) });
                  }}
                  radius="sm"
                  variant="bordered"
                  size="sm"
                  classNames={managerSelectClassNames}
                >
                  {REVEAL_OPTIONS.map((o) => (
                    <SelectItem key={o.key} textValue={o.label}>
                      {o.label} — {o.hint}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Oferta que resolve"
                  labelPlacement="outside-top"
                  selectedKeys={[pain?.produto || NO_PRODUCT]}
                  onSelectionChange={(keys) => {
                    const k = String(Array.from(keys)[0] ?? NO_PRODUCT);
                    setPainProduct(p.dor, k === NO_PRODUCT ? "" : k);
                  }}
                  radius="sm"
                  variant="bordered"
                  size="sm"
                  classNames={managerSelectClassNames}
                >
                  {[
                    <SelectItem key={NO_PRODUCT}>Nenhuma (dor sem oferta)</SelectItem>,
                    ...d.produtos.map((o) => <SelectItem key={o.nome}>{o.nome}</SelectItem>),
                  ]}
                </Select>
              </div>
              <Textarea
                label="Como aparece para este comprador"
                labelPlacement="outside"
                value={p.detalhe}
                onValueChange={(v) =>
                  setPersona({ dores: persona.dores.map((x, j) => (j === i ? { ...x, detalhe: v } : x)) })
                }
                radius="sm"
                variant="bordered"
                minRows={2}
                classNames={field}
              />
            </div>
          );
        })}
        <AddButton label="Adicionar dor" onPress={addPain} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle
          title={`Ofertas relacionadas (${d.produtos.length})`}
          hint="Lado do vendedor: entram na oferta da Perfecting e na avaliação. O comprador só recebe a postura, sem o nome."
        />
        {d.produtos.map((o, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-sm bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Oferta ${i + 1}`}
                value={o.nome}
                onValueChange={(v) => renameProduct(o.nome, v)}
                radius="sm"
                variant="bordered"
                size="sm"
                classNames={field}
              />
              <RemoveButton label="Remover oferta" onPress={() => removeProduct(o.nome)} />
            </div>
            <Textarea
              label="O que é"
              labelPlacement="outside"
              value={o.descricao}
              onValueChange={(v) =>
                onChange({ ...d, produtos: d.produtos.map((x, j) => (j === i ? { ...x, descricao: v } : x)) })
              }
              radius="sm"
              variant="bordered"
              minRows={1}
              classNames={field}
            />
            <Input
              label="Postura do comprador"
              labelPlacement="outside"
              value={persona.produtos.find((p) => p.produto === o.nome)?.postura ?? ""}
              onValueChange={(v) => setStance(o.nome, v)}
              radius="sm"
              variant="bordered"
              size="sm"
              classNames={field}
            />
          </div>
        ))}
        <AddButton label="Adicionar oferta" onPress={addProduct} />
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle title="O que o comprador sabe" />
        <Textarea
          label="Ao atender"
          labelPlacement="outside"
          value={d.conhecimento.previo}
          onValueChange={(v) => onChange({ ...d, conhecimento: { ...d.conhecimento, previo: v } })}
          radius="sm"
          variant="bordered"
          minRows={2}
        />
        <p className="text-xs font-medium text-slate-600">Fatos que revela se perguntado</p>
        <TopicList
          label="Fato"
          items={d.conhecimento.fatos}
          onChange={(fatos) => onChange({ ...d, conhecimento: { ...d.conhecimento, fatos } })}
        />
        <p className="text-xs font-medium text-slate-600">O que o vendedor vê antes da call</p>
        <TopicList
          label="Briefing"
          items={d.conhecimento.briefing}
          onChange={(briefing) => onChange({ ...d, conhecimento: { ...d.conhecimento, briefing } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle title="Primeira fala do comprador" hint="Três variações; a call sorteia uma." />
        {opening.map((line, i) => (
          <Input
            key={i}
            aria-label={`Abertura ${i + 1}`}
            value={line}
            onValueChange={(v) => {
              const next = [...opening];
              next[i] = v;
              onChange({ ...d, abertura: next });
            }}
            radius="sm"
            variant="bordered"
            size="sm"
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle
          title={`Rubricas do vendedor (${d.rubricas.length})`}
          hint="Substituem as rubricas geradas pela Perfecting."
        />
        {d.rubricas.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Input
                aria-label={`Rubrica ${i + 1}`}
                value={r.criterio}
                onValueChange={(v) =>
                  onChange({ ...d, rubricas: d.rubricas.map((x, j) => (j === i ? { ...x, criterio: v } : x)) })
                }
                radius="sm"
                variant="bordered"
                size="sm"
              />
              <Textarea
                aria-label={`Descrição da rubrica ${i + 1}`}
                value={r.descricao}
                onValueChange={(v) =>
                  onChange({ ...d, rubricas: d.rubricas.map((x, j) => (j === i ? { ...x, descricao: v } : x)) })
                }
                radius="sm"
                variant="bordered"
                minRows={1}
              />
            </div>
            <RemoveButton
              label="Remover rubrica"
              onPress={() => onChange({ ...d, rubricas: d.rubricas.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <AddButton
          label="Adicionar rubrica"
          onPress={() => onChange({ ...d, rubricas: [...d.rubricas, { criterio: "", descricao: "", dica: "" }] })}
        />
      </div>
    </div>
  );
}
