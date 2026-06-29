"use client";

import { useState } from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  addToast,
} from "@heroui/react";
import {
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import {
  MENU_CONTENT_CLASSES,
  MENU_ITEM_HOVER,
  MENU_ITEM_HOVER_DANGER,
  MENU_TRIGGER_HOVER,
} from "@/app/lib/menu-hover-classes";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createScenarioFromOffer } from "@/app/lib/db";
import type { Connection, DraftRow } from "@/app/lib/types";

export function DraftActions({
  draft,
  connections,
  onSend,
  onViewText,
  onDelete,
  onAfterNewScenario,
}: {
  draft: DraftRow;
  connections: Connection[];
  onSend: () => void;
  onViewText: () => void;
  onDelete: () => void;
  onAfterNewScenario: () => void;
}) {
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [connId, setConnId] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [creating, setCreating] = useState(false);

  async function createScenario() {
    setCreating(true);
    try {
      await createScenarioFromOffer({
        offerId: draft.offer_id,
        connectionId: connId || null,
        scenario: { difficulty },
        title: `${draft.offer?.offer_name ?? "Oferta"} — novo cenário`,
      });
      addToast({ title: "Novo cenário criado", color: "success" });
      setNewScenarioOpen(false);
      onAfterNewScenario();
    } catch (err) {
      addToast({
        title: "Erro ao criar cenário",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setCreating(false);
    }
  }

  const busy = draft.status === "exporting";
  const exported = draft.status === "exported";

  return (
    <>
      <Dropdown classNames={{ content: MENU_CONTENT_CLASSES }} placement="bottom-end">
        <DropdownTrigger>
          <button
            type="button"
            aria-label="Ações"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-sm ${MENU_TRIGGER_HOVER}`}
          >
            <EllipsisHorizontalIcon className="w-5 h-5" />
          </button>
        </DropdownTrigger>
        <DropdownMenu aria-label="Ações do rascunho">
          <DropdownItem
            key="send"
            className={MENU_ITEM_HOVER}
            startContent={<PaperAirplaneIcon className="w-4 h-4" />}
            isDisabled={busy}
            onPress={exported ? () => setResendOpen(true) : onSend}
          >
            {exported ? "Reenviar para a conta destino" : "Enviar para a conta destino"}
          </DropdownItem>
          <DropdownItem
            key="new-scenario"
            className={MENU_ITEM_HOVER}
            startContent={<DocumentDuplicateIcon className="w-4 h-4" />}
            onPress={() => setNewScenarioOpen(true)}
          >
            Novo cenário desta oferta
          </DropdownItem>
          <DropdownItem
            key="view"
            className={MENU_ITEM_HOVER}
            startContent={<EyeIcon className="w-4 h-4" />}
            onPress={onViewText}
          >
            Ver texto
          </DropdownItem>
          <DropdownItem
            key="delete"
            className={MENU_ITEM_HOVER_DANGER}
            startContent={<TrashIcon className="w-4 h-4" />}
            onPress={() =>
              setConfirm({
                title: "Excluir rascunho?",
                message: (
                  <>
                    O rascunho <b>{draft.offer?.offer_name ?? draft.title ?? "sem nome"}</b> será
                    removido da Biblioteca. Se já foi exportado, o roleplay na Perfecting{" "}
                    <b>não</b> é apagado. Não dá para desfazer.
                  </>
                ),
                confirmLabel: "Excluir",
                onConfirm: onDelete,
              })
            }
          >
            Excluir
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Modal isOpen={newScenarioOpen} onOpenChange={setNewScenarioOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Novo cenário desta oferta</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Reusa a oferta existente. No export, se ela já foi criada na conta escolhida, as
              etapas de oferta/contexto são puladas.
            </p>
            <Select
              label="Conta de destino (opcional)"
              labelPlacement="outside"
              selectedKeys={connId ? [connId] : []}
              onSelectionChange={(k) => setConnId(String(Array.from(k)[0] ?? ""))}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
            >
              {connections.map((c) => (
                <SelectItem key={c.id}>
                  {c.org_name ?? `Org ${c.org_id}`} ({c.environment})
                </SelectItem>
              ))}
            </Select>
            <Select
              label="Dificuldade"
              labelPlacement="outside"
              selectedKeys={[difficulty]}
              onSelectionChange={(k) => setDifficulty(String(Array.from(k)[0] ?? "medium"))}
              radius="sm"
              variant="bordered"
              classNames={managerSelectClassNames}
            >
              <SelectItem key="easy">Fácil</SelectItem>
              <SelectItem key="medium">Médio</SelectItem>
              <SelectItem key="hard">Difícil</SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setNewScenarioOpen(false)}>
              Cancelar
            </Button>
            <Button onPress={createScenario} isLoading={creating}>
              Criar cenário
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={resendOpen} onOpenChange={setResendOpen} radius="sm">
        <ModalContent>
          <ModalHeader>Reenviar rascunho já exportado?</ModalHeader>
          <ModalBody>
            <p className="text-sm text-slate-500">
              Este rascunho já foi exportado para a Perfecting. Reenviar vai criar um{" "}
              <strong>roleplay duplicado</strong> na conta de destino. Para variar o cenário sem
              duplicar, prefira <strong>&quot;Novo cenário desta oferta&quot;</strong>.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={() => setResendOpen(false)}>
              Cancelar
            </Button>
            <Button
              onPress={() => {
                setResendOpen(false);
                onSend();
              }}
            >
              Reenviar mesmo assim
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
