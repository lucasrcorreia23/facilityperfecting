"use client";

import { Modal, ModalContent, ModalBody, ModalFooter, Spinner } from "@heroui/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";

export type SendStatus = "sending" | "success" | "error";

/**
 * Modal de progresso do envio para a conta de destino. Estado controlado pelo
 * pai: `sending` (loading, não dismissável) → `success` ou `error`.
 *
 * Só `sending` prende o usuário — ali a requisição está em voo e fechar não
 * cancelaria nada. Assim que termina, sempre há saída (X, ESC, backdrop e o
 * botão no rodapé): nem todo pai redireciona ou fecha sozinho no sucesso, e
 * sem isso a tela do playbook ficava sem escapatória.
 */
export function SendStatusModal({
  open,
  status,
  errorMessage,
  onRetry,
  onClose,
  sendingLabel = "Enviando roleplay para a conta de destino…",
  successTitle = "Enviado com sucesso!",
  successHint = "Redirecionando para a Biblioteca…",
}: {
  open: boolean;
  status: SendStatus;
  errorMessage?: string | null;
  onRetry: () => void;
  onClose: () => void;
  /** Copy alternativa — o modo playbook inicia um job longo em vez de enviar 1 roleplay. */
  sendingLabel?: string;
  successTitle?: string;
  successHint?: string;
}) {
  const dismissable = status !== "sending";
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      radius="sm"
      isDismissable={dismissable}
      hideCloseButton={!dismissable}
      isKeyboardDismissDisabled={!dismissable}
    >
      <ModalContent>
        <ModalBody>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            {status === "sending" && (
              <>
                <Spinner color="primary" />
                <p className="text-sm text-slate-600">{sendingLabel}</p>
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircleIcon className="w-12 h-12 text-emerald-500" />
                <p className="text-base font-medium text-slate-800">{successTitle}</p>
                <p className="text-sm text-slate-500">{successHint}</p>
              </>
            )}
            {status === "error" && (
              <>
                <XCircleIcon className="w-12 h-12 text-red-500" />
                <p className="text-base font-medium text-slate-800">Não foi possível enviar</p>
                {errorMessage && (
                  <p className="text-sm leading-relaxed text-slate-500 break-words">
                    {errorMessage}
                  </p>
                )}
              </>
            )}
          </div>
        </ModalBody>
        {status !== "sending" && (
          <ModalFooter>
            {status === "error" ? (
              <>
                <Button variant="secondary" onPress={onClose}>
                  Fechar
                </Button>
                <Button onPress={onRetry}>Tentar novamente</Button>
              </>
            ) : (
              <Button variant="secondary" onPress={onClose}>
                Fechar
              </Button>
            )}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}
