"use client";

import { addToast } from "@heroui/react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button } from "@/app/components/ui/button";

/** Botão "Copiar" reutilizável para o texto do roteiro. */
export function CopyScriptButton({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ title: "Roteiro copiado", color: "success" });
    } catch {
      addToast({ title: "Não foi possível copiar", color: "danger" });
    }
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      startContent={<ClipboardDocumentIcon className="h-4 w-4" />}
      onPress={copy}
    >
      Copiar
    </Button>
  );
}
