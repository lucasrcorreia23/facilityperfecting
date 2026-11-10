/**
 * Regra pura do aviso de saída: um clique num link tira a pessoa da tela atual?
 * Só nesses casos vale perguntar — nova aba, download, âncora da própria página
 * e link externo (que o `beforeunload` já cobre) passam direto.
 */
export interface LinkClick {
  /** `href` como está no elemento (pode ser relativo). */
  href: string | null;
  target?: string | null;
  download?: boolean;
  /** URL atual da página (`window.location.href`). */
  currentUrl: string;
  /** Botão do mouse: 0 = principal. */
  button?: number;
  /** Ctrl/Cmd/Shift/Alt apertado — o navegador abre em outra aba/janela. */
  modified?: boolean;
}

export function leavesCurrentPage(click: LinkClick): boolean {
  if (!click.href) return false;
  if (click.download) return false;
  if (click.modified || (click.button ?? 0) !== 0) return false;
  if (click.target && click.target !== "_self") return false;
  let current: URL;
  let next: URL;
  try {
    current = new URL(click.currentUrl);
    next = new URL(click.href, current);
  } catch {
    return false;
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") return false;
  // Outra origem descarrega a página: o `beforeunload` é quem avisa.
  if (next.origin !== current.origin) return false;
  // Mesma rota (âncora ou só query): a tela não desmonta.
  return next.pathname !== current.pathname;
}

export const UNSAVED_LEAVE_MESSAGE =
  "Há conteúdo nesta tela que ainda não foi salvo nem enviado. Sair agora perde esse trabalho. Sair mesmo assim?";
