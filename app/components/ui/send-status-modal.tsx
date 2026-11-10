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
  errorTitle = "Não foi possível enviar",
  errorIssues,
  errorDetails,
  retryable = true,
  onRetry,
  onClose,
  sendingLabel = "Enviando roleplay para a conta de destino…",
  successTitle = "Enviado com sucesso!",
  successHint = "Redirecionando para a Biblioteca…",
}: {
  open: boolean;
  status: SendStatus;
  errorMessage?: string | null;
  errorTitle?: string;
  /** O que corrigir antes de reenviar, um item por linha. */
  errorIssues?: string[];
  /** Payload cru do erro — fica recolhido em "Detalhes técnicos". */
  errorDetails?: string | null;
  /**
   * `false` esconde "Tentar novamente": repetir o mesmo pedido daria o mesmo erro
   * (validação, conteúdo fora do limite). Padrão `true`, como sempre foi.
   */
  retryable?: boolean;
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
                <p className="text-base font-medium text-slate-800">{errorTitle}</p>
                {errorMessage && (
                  <p className="text-sm leading-relaxed text-slate-500 break-words">
                    {errorMessage}
                  </p>
                )}
                {errorIssues && errorIssues.length > 0 && (
                  <ul className="flex max-h-48 w-full list-disc flex-col gap-1 overflow-y-auto pl-5 text-left text-sm leading-relaxed text-slate-600">
                    {errorIssues.map((issue, i) => (
                      <li key={i} className="break-words">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
                {errorDetails && (
                  <details className="w-full text-left">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                      Detalhes técnicos
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      {errorDetails}
                    </pre>
                  </details>
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
                {retryable && <Button onPress={onRetry}>Tentar novamente</Button>}
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
