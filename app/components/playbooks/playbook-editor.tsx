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
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { blockHasContent, nextDefaultName } from "@/app/lib/playbook-draft";
import { createSaveTracker, type SaveTracker } from "@/app/lib/save-tracker";
import {
  CALL_BLOCK_DESCRIPTION_MAX,
  CALL_BLOCK_NAME_MAX,
  CALL_TYPE_DESCRIPTION_MAX,
  CALL_TYPE_NAME_MAX,
  duplicatedCallTypeNames,
  MAX_CALL_BLOCKS_PER_CALL_TYPE,
  normalizeName,
} from "@/supabase/functions/_shared/perfecting-limits";
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

/**
 * Contador "n/255" dos campos que a Perfecting limita. O `maxLength` do campo
 * impede digitar além do teto; texto que JÁ chegou maior (gerado pela IA) fica
 * visível e em vermelho até a pessoa cortar — nada é truncado em silêncio.
 */
function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={`tabular-nums ${over ? "font-medium text-red-600" : "text-slate-400"}`}>
      {value.length}/{max}
      {over ? ` — corte ${value.length - max} para poder enviar` : ""}
    </span>
  );
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
  saves,
  onMove,
  onDelete,
  onChanged,
}: {
  block: PlaybookDraftCallBlock;
  index: number;
  total: number;
  saves: SaveTracker;
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
      // A chave é o campo: regravar o mesmo campo com sucesso limpa uma falha anterior.
      await saves.run(`block:${block.id}:${Object.keys(patch).sort().join(",")}`, () =>
        updatePlaybookCallBlock(block.id, patch),
      );
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
          maxLength={CALL_BLOCK_NAME_MAX}
          isInvalid={name.length > CALL_BLOCK_NAME_MAX}
          errorMessage={<CharCount value={name} max={CALL_BLOCK_NAME_MAX} />}
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
            maxLength={CALL_BLOCK_DESCRIPTION_MAX}
            isInvalid={description.length > CALL_BLOCK_DESCRIPTION_MAX}
            description={<CharCount value={description} max={CALL_BLOCK_DESCRIPTION_MAX} />}
            errorMessage={<CharCount value={description} max={CALL_BLOCK_DESCRIPTION_MAX} />}
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
  nameDuplicated,
  saves,
  onMove,
  onDelete,
  onConfirm,
  onChanged,
}: {
  callType: PlaybookDraftCallTypeWithBlocks;
  index: number;
  total: number;
  callContexts: CallContextType[];
  methodologies: Methodology[];
  /** Outra etapa do playbook tem este mesmo nome (a Perfecting recusa). */
  nameDuplicated: boolean;
  saves: SaveTracker;
  onMove: (index: number, dir: -1 | 1) => void;
  onDelete: (callType: PlaybookDraftCallTypeWithBlocks) => void;
  onConfirm: (config: ConfirmConfig) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(callType.name);
  const [description, setDescription] = useState(callType.description ?? "");
  const blocks = callType.playbook_call_blocks;
  const blocksAtLimit = blocks.length >= MAX_CALL_BLOCKS_PER_CALL_TYPE;
  const [addingBlock, setAddingBlock] = useState(false);

  async function persist(patch: Parameters<typeof updatePlaybookCallType>[1]) {
    try {
      await saves.run(`type:${callType.id}:${Object.keys(patch).sort().join(",")}`, () =>
        updatePlaybookCallType(callType.id, patch),
      );
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
      await saves.run(
        `reorder-blocks:${callType.id}`,
        () => reorderPlaybookCallBlocks(ordered.map((b, i) => ({ id: b.id, position: i }))),
        { retryable: false },
      );
      onChanged();
    } catch (err) {
      toastError("Falha ao reordenar", err);
    }
  }

  /** Subetapa vazia sai direto; com conteúdo, pergunta antes — não há desfazer. */
  function requestRemoveBlock(block: PlaybookDraftCallBlock) {
    if (!blockHasContent(block)) {
      void removeBlock(block);
      return;
    }
    onConfirm({
      title: "Excluir a subetapa?",
      message: (
        <>
          A subetapa <b>{block.name}</b> será excluída com o objetivo, as perguntas e as
          orientações escritas nela. Não dá para desfazer.
        </>
      ),
      confirmLabel: "Excluir subetapa",
      tone: "danger",
      onConfirm: () => {
        void removeBlock(block);
      },
    });
  }

  async function removeBlock(block: PlaybookDraftCallBlock) {
    try {
      await saves.run(`delete-block:${block.id}`, () => deletePlaybookCallBlock(block.id), {
        retryable: false,
      });
      onChanged();
    } catch (err) {
      toastError("Falha ao excluir a subetapa", err);
    }
  }

  async function addBlock() {
    if (addingBlock) return; // clique duplo criava duas subetapas
    setAddingBlock(true);
    try {
      await saves.run(
        `add-block:${callType.id}`,
        () =>
          createPlaybookCallBlock({
            callTypeId: callType.id,
            position: blocks.length,
            name: "Nova subetapa",
          }),
        { retryable: false },
      );
      onChanged();
    } catch (err) {
      toastError("Falha ao adicionar subetapa", err);
    } finally {
      setAddingBlock(false);
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
            maxLength={CALL_TYPE_NAME_MAX}
            isInvalid={nameDuplicated || name.length > CALL_TYPE_NAME_MAX}
            errorMessage={
              name.length > CALL_TYPE_NAME_MAX ? (
                <CharCount value={name} max={CALL_TYPE_NAME_MAX} />
              ) : (
                "Já existe outra etapa com este nome. A Perfecting recusa nomes repetidos no mesmo playbook — renomeie uma delas antes de enviar."
              )
            }
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
            maxLength={CALL_TYPE_DESCRIPTION_MAX}
            isInvalid={description.length > CALL_TYPE_DESCRIPTION_MAX}
            description={<CharCount value={description} max={CALL_TYPE_DESCRIPTION_MAX} />}
            errorMessage={<CharCount value={description} max={CALL_TYPE_DESCRIPTION_MAX} />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Tipo de chamada"
              labelPlacement="outside-top"
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
              labelPlacement="outside-top"
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
        <p className="text-xs font-semibold text-slate-500">
          Subetapas ({blocks.length}/{MAX_CALL_BLOCKS_PER_CALL_TYPE})
        </p>
        {blocks.map((block, i) => (
          <CallBlockEditor
            key={block.id}
            block={block}
            index={i}
            total={blocks.length}
            saves={saves}
            onMove={moveBlock}
            onDelete={requestRemoveBlock}
            onChanged={onChanged}
          />
        ))}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => void addBlock()}
            disabled={blocksAtLimit || addingBlock}
            aria-busy={addingBlock}
            className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500 sm:min-h-0"
          >
            <PlusIcon className="w-4 h-4" /> {addingBlock ? "Adicionando…" : "Adicionar subetapa"}
          </button>
          {blocks.length > MAX_CALL_BLOCKS_PER_CALL_TYPE ? (
            <p className="text-xs font-medium text-red-600">
              A Perfecting aceita até {MAX_CALL_BLOCKS_PER_CALL_TYPE} subetapas por etapa — junte ou
              exclua {blocks.length - MAX_CALL_BLOCKS_PER_CALL_TYPE} para poder enviar.
            </p>
          ) : blocksAtLimit ? (
            <p className="text-xs text-slate-500">
              Limite de {MAX_CALL_BLOCKS_PER_CALL_TYPE} subetapas por etapa na Perfecting.
            </p>
          ) : null}
        </div>
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
  saves: savesProp,
  onChanged,
}: {
  playbookId: string;
  callTypes: PlaybookDraftCallTypeWithBlocks[];
  callContexts: CallContextType[];
  methodologies: Methodology[];
  /** Contador das gravações — a tela passa o dela para o indicador e para o envio esperar. */
  saves?: SaveTracker;
  onChanged: () => void;
}) {
  const [ownSaves] = useState(createSaveTracker);
  const saves = savesProp ?? ownSaves;
  const [addingType, setAddingType] = useState(false);

  async function moveCallType(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= callTypes.length) return;
    const ordered = [...callTypes];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await saves.run(
        `reorder-types:${playbookId}`,
        () => reorderPlaybookCallTypes(ordered.map((ct, i) => ({ id: ct.id, position: i }))),
        { retryable: false },
      );
      onChanged();
    } catch (err) {
      toastError("Falha ao reordenar", err);
    }
  }

  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  function requestRemoveCallType(callType: PlaybookDraftCallTypeWithBlocks) {
    const blocks = callType.playbook_call_blocks.length;
    setConfirm({
      title: "Excluir a etapa?",
      message: (
        <>
          A etapa <b>{callType.name}</b> será excluída
          {blocks > 0 ? (
            <>
              {" "}
              junto com {blocks === 1 ? <b>a subetapa</b> : <b>as {blocks} subetapas</b>} dela
            </>
          ) : null}
          . Não dá para desfazer.
        </>
      ),
      confirmLabel: "Excluir etapa",
      tone: "danger",
      onConfirm: () => {
        void removeCallType(callType);
      },
    });
  }

  async function removeCallType(callType: PlaybookDraftCallTypeWithBlocks) {
    try {
      await saves.run(`delete-type:${callType.id}`, () => deletePlaybookCallType(callType.id), {
        retryable: false,
      });
      onChanged();
    } catch (err) {
      toastError("Falha ao excluir a etapa", err);
    }
  }

  async function addCallType() {
    if (addingType) return; // clique duplo criava duas etapas de mesmo nome
    setAddingType(true);
    try {
      await saves.run(
        `add-type:${playbookId}`,
        () =>
          createPlaybookCallType({
            playbookId,
            position: callTypes.length,
            // Nome único: duas "Nova etapa" derrubam o envio (unicidade por playbook).
            name: nextDefaultName(
              "Nova etapa",
              callTypes.map((ct) => ct.name),
            ),
          }),
        { retryable: false },
      );
      onChanged();
    } catch (err) {
      toastError("Falha ao adicionar etapa", err);
    } finally {
      setAddingType(false);
    }
  }

  const duplicated = duplicatedCallTypeNames(callTypes.map((ct) => ct.name));

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
          nameDuplicated={duplicated.has(normalizeName(callType.name))}
          saves={saves}
          onMove={moveCallType}
          onDelete={requestRemoveCallType}
          onConfirm={setConfirm}
          onChanged={onChanged}
        />
      ))}
      <button
        type="button"
        onClick={() => void addCallType()}
        disabled={addingType}
        aria-busy={addingType}
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-sm px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
      >
        <PlusIcon className="w-4 h-4" /> {addingType ? "Adicionando…" : "Adicionar etapa"}
      </button>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
