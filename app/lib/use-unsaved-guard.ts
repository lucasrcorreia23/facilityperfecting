"use client";

import { useEffect } from "react";
import { leavesCurrentPage, UNSAVED_LEAVE_MESSAGE } from "@/app/lib/unsaved-guard";

/**
 * Avisa antes de perder trabalho não salvo: ao fechar/recarregar a aba
 * (`beforeunload`) e ao clicar num link interno do app (menu, voltar, links do
 * texto). Navegação por código (`router.push` depois de salvar/enviar) passa
 * direto, de propósito. O voltar do navegador não é coberto.
 */
export function useUnsavedGuard(dirty: boolean, message: string = UNSAVED_LEAVE_MESSAGE) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const leaving = leavesCurrentPage({
        href: anchor.getAttribute("href"),
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
        currentUrl: window.location.href,
        button: e.button,
        modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
      });
      if (!leaving) return;
      if (!window.confirm(message)) {
        // Fase de captura no documento: barra o clique antes do roteador do Next.
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
