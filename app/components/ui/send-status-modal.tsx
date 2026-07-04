"use client";

import { Modal, ModalContent, ModalBody, ModalFooter, Spinner } from "@heroui/react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";

export type SendStatus = "sending" | "success" | "error";

/**
 * Modal de progresso do envio para a conta de destino. Estado controlado pelo
 * pai: `sending` (loading, não dismissável) → `success` (o pai redireciona) ou
 * `error` (mostra a mensagem + "Tentar novamente"; fechar volta à tela).
 */
export function SendStatusModal({
  open,
  status,
  errorMessage,
  onRetry,
  onClose,
}: {
  open: boolean;
  status: SendStatus;
  errorMessage?: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dismissable = status === "error";
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
                <p className="text-sm text-slate-600">
                  Enviando roleplay para a conta de destino…
                </p>
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircleIcon className="w-12 h-12 text-emerald-500" />
                <p className="text-base font-medium text-slate-800">Enviado com sucesso!</p>
                <p className="text-sm text-slate-500">Redirecionando para a Biblioteca…</p>
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
        {status === "error" && (
          <ModalFooter>
            <Button onPress={onRetry}>Tentar novamente</Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}
