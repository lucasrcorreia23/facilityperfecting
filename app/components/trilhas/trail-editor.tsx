"use client";

import { useState } from "react";
import { Input, Select, SelectItem, Textarea, addToast } from "@heroui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { StatusBadge } from "@/app/components/ui/status-badge";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import {
  createTrailItem,
  deleteTrailItem,
  reorderTrailItems,
  updateTrailItem,
} from "@/app/lib/db";
import type { CallContextType, TrailItemRow, TrailWithItems } from "@/app/lib/types";

const DIFFICULTIES = [
  { key: "easy", label: "Fácil" },
  { key: "medium", label: "Média" },
  { key: "hard", label: "Difícil" },
];

function toastError(title: string, err: unknown) {
  addToast({
    title,
    description: err instanceof Error ? err.message : String(err),
    color: "danger",
  });
}

/** Um roleplay da trilha, com campos editáveis persistidos no blur/seleção. */
function ItemEditor({
  item,
  index,
  total,
  callContexts,
  onMove,
  onDelete,
  onChanged,
}: {
  item: TrailItemRow;
  index: number;
  total: number;
  callContexts: CallContextType[];
  onMove: (index: number, dir: -1 | 1) => void;
  onDelete: (item: TrailItemRow) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [titulo, setTitulo] = useState(item.titulo);
  const [objetivo, setObjetivo] = useState(item.objetivo ?? "");
  const [skill, setSkill] = useState(item.skill ?? "");
  const [instrucoes, setInstrucoes] = useState(item.instrucoes_cenario ?? "");

  async function persist(patch: Parameters<typeof updateTrailItem>[1]) {
    try {
      await updateTrailItem(item.id, patch);
      onChanged();
    } catch (err) {
      toastError("Falha ao salvar o roleplay", err);
    }
  }

  const locked = !!item.draft_id;

  return (
    <div className="rounded-sm border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-sm p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          {expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        </button>
        <span className="w-6 shrink-0 text-right text-sm tabular-nums font-medium text-slate-400">
          {index + 1}.
        </span>
        <Input
          value={titulo}
          onValueChange={setTitulo}
          onBlur={() => {
            if (titulo.trim() && titulo !== item.titulo) void persist({ titulo: titulo.trim() });
          }}
          radius="sm"
          variant="bordered"
          size="sm"
          classNames={{ input: "text-sm font-medium" }}
          aria-label="Título do roleplay"
        />
        <div className="flex shrink-0 items-center gap-1">
          {item.draft ? (
            <StatusBadge status={item.draft.status} />
          ) : (
            <span className="hidden rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 sm:inline-flex">
              Não gerado
            </span>
          )}
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            aria-label="Mover para cima"
          >
            <ArrowUpIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            aria-label="Mover para baixo"
          >
            <ArrowDownIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Excluir roleplay"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
          {locked && (
            <p className="text-xs text-slate-500">
              Este roleplay já virou rascunho na Biblioteca — edições aqui não alteram o rascunho gerado.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Tipo de chamada"
              labelPlacement="outside"
              selectedKeys={item.call_context_slug ? [item.call_context_slug] : []}
              onSelectionChange={(keys) => {
                const slug = Array.from(keys)[0] as string | undefined;
                if (slug && slug !== item.call_context_slug) void persist({ call_context_slug: slug });
              }}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              aria-label="Tipo de chamada"
            >
              {callContexts.map((c) => (
                <SelectItem key={c.slug} classNames={selectItemClassNames}>
                  {c.name}
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Dificuldade"
              labelPlacement="outside"
              selectedKeys={[item.difficulty]}
              onSelectionChange={(keys) => {
                const d = Array.from(keys)[0] as string | undefined;
                if (d && d !== item.difficulty) void persist({ difficulty: d });
              }}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              aria-label="Dificuldade"
            >
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d.key} classNames={selectItemClassNames}>
                  {d.label}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="Habilidade principal"
              labelPlacement="outside"
              value={skill}
              onValueChange={setSkill}
              onBlur={() => {
                if (skill !== (item.skill ?? "")) void persist({ skill: skill.trim() || null });
              }}
              radius="sm"
              variant="bordered"
              placeholder="Ex.: Contorno de objeções"
            />
          </div>
          <Textarea
            label="Objetivo de treino"
            labelPlacement="outside"
            value={objetivo}
            onValueChange={setObjetivo}
            onBlur={() => {
              if (objetivo !== (item.objetivo ?? "")) void persist({ objetivo: objetivo.trim() || null });
            }}
            radius="sm"
            variant="bordered"
            minRows={2}
          />
          <Textarea
            label="Instruções do cenário"
            labelPlacement="outside"
            value={instrucoes}
            onValueChange={setInstrucoes}
            onBlur={() => {
              if (instrucoes !== (item.instrucoes_cenario ?? "")) {
                void persist({ instrucoes_cenario: instrucoes.trim() || null });
              }
            }}
            radius="sm"
            variant="bordered"
            minRows={4}
            description="Comportamento da persona, objeções/testes de fogo e critério de fechamento."
          />
        </div>
      )}
    </div>
  );
}

/** Card de uma trilha: metadados + sequência editável de roleplays. */
export function TrailEditor({
  trail,
  callContexts,
  onChanged,
  onGenerate,
  generating,
}: {
  trail: TrailWithItems;
  callContexts: CallContextType[];
  onChanged: () => void;
  onGenerate: (trailId: string) => void;
  generating?: boolean;
}) {
  const pendingCount = trail.items.filter((it) => !it.draft_id).length;

  async function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= trail.items.length) return;
    const ordered = [...trail.items];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await reorderTrailItems(ordered.map((it, i) => ({ id: it.id, position: i })));
      onChanged();
    } catch (err) {
      toastError("Falha ao reordenar", err);
    }
  }

  async function removeItem(item: TrailItemRow) {
    try {
      await deleteTrailItem(item.id);
      onChanged();
    } catch (err) {
      toastError("Falha ao excluir o roleplay", err);
    }
  }

  async function addItem() {
    try {
      await createTrailItem({
        trailId: trail.id,
        position: trail.items.length,
        titulo: "Novo roleplay",
      });
      onChanged();
    } catch (err) {
      toastError("Falha ao adicionar roleplay", err);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-base font-semibold text-slate-900">{trail.name}</h3>
          {trail.description && (
            <p className="text-sm leading-relaxed text-slate-600">{trail.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {trail.skill_gaps_alvo.map((gap) => (
              <span
                key={gap}
                className="inline-flex rounded-sm bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
              >
                {gap}
              </span>
            ))}
            {trail.vendedores_alvo.map((v) => (
              <span
                key={v}
                className="inline-flex rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
        <Button
          variant="secondary"
          onPress={() => onGenerate(trail.id)}
          isDisabled={pendingCount === 0}
          isLoading={generating}
          startContent={<SparklesIcon className="w-4 h-4" />}
          className="shrink-0"
        >
          {pendingCount === 0 ? "Roleplays gerados" : `Gerar roleplays (${pendingCount})`}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {trail.items.map((item, index) => (
          <ItemEditor
            key={item.id}
            item={item}
            index={index}
            total={trail.items.length}
            callContexts={callContexts}
            onMove={moveItem}
            onDelete={removeItem}
            onChanged={onChanged}
          />
        ))}
        <button
          type="button"
          onClick={() => void addItem()}
          className="inline-flex items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <PlusIcon className="w-4 h-4" /> Adicionar roleplay
        </button>
      </div>
    </Card>
  );
}
