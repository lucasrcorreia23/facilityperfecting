"use client";

import type { ReactNode } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { Button } from "@/app/components/ui/button";

export interface ConfirmConfig {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

/**
 * Modal de confirmação reutilizável. Passe `config` (ou null para fechar) e um
 * `onClose`. O texto deve comunicar claramente o que vai acontecer.
 */
export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={!!config}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      radius="sm"
    >
      <ModalContent>
        {config ? (
          <>
            <ModalHeader>{config.title}</ModalHeader>
            <ModalBody>
              <div className="text-sm leading-relaxed text-slate-600">{config.message}</div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onClose}>
                {config.cancelLabel ?? "Cancelar"}
              </Button>
              <Button
                onPress={() => {
                  const fn = config.onConfirm;
                  onClose();
                  fn();
                }}
              >
                {config.confirmLabel ?? "Confirmar"}
              </Button>
            </ModalFooter>
          </>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
