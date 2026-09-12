"use client";

import { useState } from "react";
import { Input, Select, SelectItem, Textarea, addToast } from "@heroui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Card } from "@/app/components/ui/card";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import {
  createPlaybookCallBlock,
  createPlaybookCallType,
  deletePlaybookCallBlock,
  deletePlaybookCallType,
  reorderPlaybookCallBlocks,
  reorderPlaybookCallTypes,
  updatePlaybookCallBlock,
  updatePlaybookCallType,
} from "@/app/lib/db";
import type {
  CallContextType,
  Methodology,
  PlaybookDraftCallBlock,
  PlaybookDraftCallTypeWithBlocks,
} from "@/app/lib/types";

function toastError(title: string, err: unknown) {
  addToast({
    title,
    description: err instanceof Error ? err.message : String(err),
    color: "danger",
  });
}

/** Listas são editadas como texto, um item por linha. */
const linesToArray = (value: string) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const arrayToLines = (value: string[] | null | undefined) => (value ?? []).join("\n");

/** Subetapa: o que o vendedor faz dentro de um momento da etapa. */
function CallBlockEditor({
  block,
  index,
  total,
  onMove,
  onDelete,
  onChanged,
}: {
  block: PlaybookDraftCallBlock;
  index: number;
  total: number;
  onMove: (index: number, dir: -1 | 1) => void;
  onDelete: (block: PlaybookDraftCallBlock) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(block.name);
  const [description, setDescription] = useState(block.description ?? "");
  const [objective, setObjective] = useState(block.objective ?? "");
  const [questions, setQuestions] = useState(arrayToLines(block.sample_questions));
  const [whatToDo, setWhatToDo] = useState(arrayToLines(block.what_to_do));
  const [whatToAvoid, setWhatToAvoid] = useState(arrayToLines(block.what_to_avoid));

  async function persist(patch: Parameters<typeof updatePlaybookCallBlock>[1]) {
    try {
      await updatePlaybookCallBlock(block.id, patch);
      onChanged();
    } catch (err) {
      toastError("Falha ao salvar a subetapa", err);
    }
  }

  return (
    <div className="rounded-sm border border-slate-200">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-sm p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>
        <span className="w-6 shrink-0 text-right text-sm tabular-nums font-medium text-slate-400">
          {index + 1}.
        </span>
        <Input
          value={name}
          onValueChange={setName}
          onBlur={() => {
            if (name.trim() && name !== block.name) void persist({ name: name.trim() });
          }}
          radius="sm"
          variant="bordered"
          size="sm"
          classNames={{ input: "text-sm font-medium" }}
          aria-label="Nome da subetapa"
        />
        <div className="flex shrink-0 items-center gap-1">
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
            onClick={() => onDelete(block)}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Excluir subetapa"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
          <Textarea
            label="Descrição"
            labelPlacement="outside"
            value={description}
            onValueChange={setDescription}
            onBlur={() => {
              if (description !== (block.description ?? "")) {
                void persist({ description: description.trim() || null });
              }
            }}
            radius="sm"
            variant="bordered"
            minRows={2}
          />
          <Textarea
            label="Objetivo"
            labelPlacement="outside"
            value={objective}
            onValueChange={setObjective}
            onBlur={() => {
              if (objective !== (block.objective ?? "")) {
                void persist({ objective: objective.trim() || null });
              }
            }}
            radius="sm"
            variant="bordered"
            minRows={2}
            description="O que o vendedor precisa alcançar neste momento."
          />
          <Textarea
            label="Perguntas-exemplo"
            labelPlacement="outside"
            value={questions}
            onValueChange={setQuestions}
            onBlur={() => {
              if (questions !== arrayToLines(block.sample_questions)) {
                void persist({ sample_questions: linesToArray(questions) });
              }
            }}
            radius="sm"
            variant="bordered"
            minRows={3}
            description="Uma por linha."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Textarea
              label="O que fazer"
              labelPlacement="outside"
              value={whatToDo}
              onValueChange={setWhatToDo}
              onBlur={() => {
                if (whatToDo !== arrayToLines(block.what_to_do)) {
                  void persist({ what_to_do: linesToArray(whatToDo) });
                }
              }}
              radius="sm"
              variant="bordered"
              minRows={3}
              description="Uma por linha."
            />
            <Textarea
              label="O que evitar"
              labelPlacement="outside"
              value={whatToAvoid}
              onValueChange={setWhatToAvoid}
              onBlur={() => {
                if (whatToAvoid !== arrayToLines(block.what_to_avoid)) {
                  void persist({ what_to_avoid: linesToArray(whatToAvoid) });
                }
              }}
              radius="sm"
              variant="bordered"
              minRows={3}
              description="Uma por linha."
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Etapa da jornada: metadados + sequência editável de subetapas. */
function CallTypeEditor({
  callType,
  index,
  total,
  callContexts,
  methodologies,
  onMove,
  onDelete,
  onChanged,
}: {
  callType: PlaybookDraftCallTypeWithBlocks;
  index: number;
  total: number;
  callContexts: CallContextType[];
  methodologies: Methodology[];
  onMove: (index: number, dir: -1 | 1) => void;
  onDelete: (callType: PlaybookDraftCallTypeWithBlocks) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(callType.name);
  const [description, setDescription] = useState(callType.description ?? "");
  const blocks = callType.playbook_call_blocks;

  async function persist(patch: Parameters<typeof updatePlaybookCallType>[1]) {
    try {
      await updatePlaybookCallType(callType.id, patch);
      onChanged();
    } catch (err) {
      toastError("Falha ao salvar a etapa", err);
    }
  }

  async function moveBlock(blockIndex: number, dir: -1 | 1) {
    const target = blockIndex + dir;
    if (target < 0 || target >= blocks.length) return;
    const ordered = [...blocks];
    [ordered[blockIndex], ordered[target]] = [ordered[target], ordered[blockIndex]];
    try {
      await reorderPlaybookCallBlocks(ordered.map((b, i) => ({ id: b.id, position: i })));
      onChanged();
    } catch (err) {
      toastError("Falha ao reordenar", err);
    }
  }

  async function removeBlock(block: PlaybookDraftCallBlock) {
    try {
      await deletePlaybookCallBlock(block.id);
      onChanged();
    } catch (err) {
      toastError("Falha ao excluir a subetapa", err);
    }
  }

  async function addBlock() {
    try {
      await createPlaybookCallBlock({
        callTypeId: callType.id,
        position: blocks.length,
        name: "Nova subetapa",
      });
      onChanged();
    } catch (err) {
      toastError("Falha ao adicionar subetapa", err);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-6 shrink-0 text-right text-sm tabular-nums font-semibold text-slate-400">
          {index + 1}.
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Input
            value={name}
            onValueChange={setName}
            onBlur={() => {
              if (name.trim() && name !== callType.name) void persist({ name: name.trim() });
            }}
            radius="sm"
            variant="bordered"
            classNames={{ input: "text-base font-semibold" }}
            aria-label="Nome da etapa"
          />
          <Textarea
            value={description}
            onValueChange={setDescription}
            onBlur={() => {
              if (description !== (callType.description ?? "")) {
                void persist({ description: description.trim() || null });
              }
            }}
            radius="sm"
            variant="bordered"
            minRows={2}
            placeholder="O que acontece nesta etapa e quando ela ocorre."
            aria-label="Descrição da etapa"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Tipo de chamada"
              labelPlacement="outside"
              selectedKeys={callType.call_context_slug ? [callType.call_context_slug] : []}
              onSelectionChange={(keys) => {
                const slug = Array.from(keys)[0] as string | undefined;
                if (slug && slug !== callType.call_context_slug) {
                  void persist({ call_context_slug: slug });
                }
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
              label="Metodologia"
              labelPlacement="outside"
              selectedKeys={callType.methodology_slug ? [callType.methodology_slug] : []}
              onSelectionChange={(keys) => {
                const slug = Array.from(keys)[0] as string | undefined;
                if (slug && slug !== callType.methodology_slug) {
                  void persist({ methodology_slug: slug });
                }
              }}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
              aria-label="Metodologia"
              description="Sem metodologia, a etapa pode ser pulada ao gerar os roleplays."
            >
              {methodologies.map((m) => (
                <SelectItem key={m.slug} classNames={selectItemClassNames}>
                  {m.name}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            aria-label="Mover etapa para cima"
          >
            <ArrowUpIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
            aria-label="Mover etapa para baixo"
          >
            <ArrowDownIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(callType)}
            className="rounded-sm p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="Excluir etapa"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 pl-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Subetapas ({blocks.length})
        </p>
        {blocks.map((block, i) => (
          <CallBlockEditor
            key={block.id}
            block={block}
            index={i}
            total={blocks.length}
            onMove={moveBlock}
            onDelete={removeBlock}
            onChanged={onChanged}
          />
        ))}
        <button
          type="button"
          onClick={() => void addBlock()}
          className="inline-flex items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <PlusIcon className="w-4 h-4" /> Adicionar subetapa
        </button>
      </div>
    </Card>
  );
}

/** Jornada inteira: as etapas do playbook, em ordem. */
export function PlaybookEditor({
  playbookId,
  callTypes,
  callContexts,
  methodologies,
  onChanged,
}: {
  playbookId: string;
  callTypes: PlaybookDraftCallTypeWithBlocks[];
  callContexts: CallContextType[];
  methodologies: Methodology[];
  onChanged: () => void;
}) {
  async function moveCallType(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= callTypes.length) return;
    const ordered = [...callTypes];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await reorderPlaybookCallTypes(ordered.map((ct, i) => ({ id: ct.id, position: i })));
      onChanged();
    } catch (err) {
      toastError("Falha ao reordenar", err);
    }
  }

  async function removeCallType(callType: PlaybookDraftCallTypeWithBlocks) {
    try {
      await deletePlaybookCallType(callType.id);
      onChanged();
    } catch (err) {
      toastError("Falha ao excluir a etapa", err);
    }
  }

  async function addCallType() {
    try {
      await createPlaybookCallType({
        playbookId,
        position: callTypes.length,
        name: "Nova etapa",
      });
      onChanged();
    } catch (err) {
      toastError("Falha ao adicionar etapa", err);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {callTypes.map((callType, index) => (
        <CallTypeEditor
          key={callType.id}
          callType={callType}
          index={index}
          total={callTypes.length}
          callContexts={callContexts}
          methodologies={methodologies}
          onMove={moveCallType}
          onDelete={removeCallType}
          onChanged={onChanged}
        />
      ))}
      <button
        type="button"
        onClick={() => void addCallType()}
        className="inline-flex items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <PlusIcon className="w-4 h-4" /> Adicionar etapa
      </button>
    </div>
  );
}
