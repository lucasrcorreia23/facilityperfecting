"use client";

import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner } from "@heroui/react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/cn";
import {
  COHERENCE_FIX_LABEL,
  COHERENCE_SEVERITY_LABEL,
  type CoherenceCheckResult,
  type CoherenceDivergence,
  type CoherenceSeverity,
  countBySeverity,
} from "@/supabase/functions/_shared/playbook-coherence";

/** `checking`: a checagem está rodando. `found`: voltou com divergências. */
export type CoherenceModalState =
  | { phase: "checking" }
  | { phase: "found"; result: CoherenceCheckResult };

const SEVERITY_CLS: Record<CoherenceSeverity, string> = {
  conflito: "bg-red-50 text-red-700",
  atencao: "bg-amber-50 text-amber-700",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 conflitos e 1 ponto de atenção" — usado no título e no resumo da confirmação. */
export function coherenceSummary(divergences: CoherenceDivergence[]): string {
  const { conflito, atencao } = countBySeverity(divergences);
  return [
    conflito > 0 && plural(conflito, "conflito", "conflitos"),
    atencao > 0 && plural(atencao, "ponto de atenção", "pontos de atenção"),
  ]
    .filter(Boolean)
    .join(" e ");
}

function Source({ title, where, quote }: { title: string; where: string; quote: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="break-words text-sm font-medium text-slate-800">{where}</p>
      {quote ? (
        <p className="break-words border-l-2 border-slate-200 pl-2 text-sm leading-relaxed text-slate-600">
          “{quote}”
        </p>
      ) : (
        <p className="text-sm text-slate-400">Não trata do assunto.</p>
      )}
    </div>
  );
}

function DivergenceCard({ item }: { item: CoherenceDivergence }) {
  const where = [item.playbook.callType, item.playbook.block].filter(Boolean).join(" › ");
  return (
    <li className="flex flex-col gap-3 rounded-sm border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2">
        <span
          className={cn(
            "self-start rounded-sm px-2 py-0.5 text-xs font-semibold",
            SEVERITY_CLS[item.severity],
          )}
        >
          {COHERENCE_SEVERITY_LABEL[item.severity]}
        </span>
        <p className="break-words text-sm leading-relaxed text-slate-800">{item.explanation}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Source title="No rascunho" where={item.draft.label} quote={item.draft.quote} />
        <Source title="No playbook" where={where || "Playbook"} quote={item.playbook.quote} />
      </div>
      <p className="break-words text-sm leading-relaxed text-slate-600">
        <span className="font-medium text-slate-700">Corrigir {COHERENCE_FIX_LABEL[item.fixIn]}</span>
        {item.suggestion ? `: ${item.suggestion}` : "."}
      </p>
    </li>
  );
}

/**
 * Passo antes da confirmação do envio no modo playbook: avisa quando o rascunho
 * (o que o comprador segue) e o playbook (o que a nota cobra) se contradizem.
 * É aviso, não trava — sempre há "Enviar mesmo assim", e enquanto checa dá para
 * pular. Resultado limpo e falha da checagem não passam por aqui: seguem direto
 * para a confirmação, com uma linha dizendo o que aconteceu.
 */
export function PlaybookCoherenceModal({
  state,
  playbookName,
  onSkip,
  onBack,
  onSendAnyway,
  onRecheck,
  onRegeneratePlaybook,
  regenerating,
}: {
  state: CoherenceModalState | null;
  playbookName: string;
  /** Segue para a confirmação sem esperar a checagem. */
  onSkip: () => void;
  /** Fecha para corrigir (ou desiste da checagem em andamento). */
  onBack: () => void;
  onSendAnyway: () => void;
  /** Refaz a checagem: o playbook pode ter sido corrigido na conta. */
  onRecheck: () => void;
  /**
   * Atalho para quando o que precisa mudar é o playbook: salva o rascunho e abre a
   * regeração do playbook com ele como material revisado. Ausente quando o playbook
   * da conta não foi feito no Facility (não há o que regerar aqui).
   */
  onRegeneratePlaybook?: () => void;
  regenerating?: boolean;
}) {
  const result = state?.phase === "found" ? state.result : null;
  const playbookFixes = result?.divergences.filter((d) => d.fixIn === "playbook").length ?? 0;
  return (
    <Modal
      isOpen={!!state}
      onOpenChange={(open) => {
        if (!open) onBack();
      }}
      radius="sm"
      size={result ? "3xl" : "md"}
      scrollBehavior="inside"
    >
      <ModalContent>
        {state?.phase === "checking" && (
          <>
            <ModalBody>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Spinner color="primary" />
                <p className="text-base font-medium text-slate-800">
                  Checando a coerência com o playbook…
                </p>
                <p className="text-sm leading-relaxed text-slate-500">
                  Comparando o rascunho (o que o comprador vai seguir) com as etapas e subetapas
                  de <b>{playbookName}</b> (o que a nota vai cobrar). Costuma levar menos de um
                  minuto.
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onBack}>
                Cancelar
              </Button>
              <Button variant="secondary" onPress={onSkip}>
                Pular a checagem
              </Button>
            </ModalFooter>
          </>
        )}
        {result && (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <span>O rascunho e o playbook divergem: {coherenceSummary(result.divergences)}</span>
              <span className="text-sm font-normal leading-relaxed text-slate-500">
                O comprador simulado segue o rascunho; a nota cobra pelas subetapas de{" "}
                {playbookName}. Onde os dois se contradizem, o representante pode ser avaliado
                contra algo que o comprador nega.
              </span>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4">
                <ul className="flex flex-col gap-3">
                  {result.divergences.map((item, i) => (
                    <DivergenceCard key={i} item={item} />
                  ))}
                </ul>
                {result.truncated.length > 0 && (
                  <p className="break-words text-xs leading-relaxed text-slate-500">
                    Parte do conteúdo foi encurtada para caber na checagem e pode ter ficado sem
                    comparação: {result.truncated.join("; ")}.
                  </p>
                )}
                {playbookFixes > 0 && onRegeneratePlaybook && (
                  <div className="flex flex-col gap-2 rounded-sm border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm leading-relaxed text-slate-600">
                      <span className="font-medium text-slate-800">
                        {plural(playbookFixes, "divergência pede", "divergências pedem")} correção no
                        playbook.
                      </span>{" "}
                      Em vez de corrigir subetapa por subetapa, dá para regerar o playbook com o
                      material revisado deste rascunho. O rascunho é salvo na Biblioteca{" "}
                      <b>sem conta de destino</b> (nada é criado na conta) e a tela do playbook
                      abre já com ele escolhido. Depois de regerar e reenviar o playbook, envie o
                      rascunho pela Biblioteca, escolhendo a conta e o <b>playbook novo</b>.
                    </p>
                    <Button
                      variant="secondary"
                      onPress={onRegeneratePlaybook}
                      isLoading={regenerating}
                      className="self-start"
                    >
                      Salvar rascunho e regerar o playbook
                    </Button>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  A checagem é feita por IA e pode errar: confira os trechos antes de decidir.
                  Corrigiu o playbook na conta?{" "}
                  <button
                    type="button"
                    onClick={onRecheck}
                    className="font-medium text-slate-700 underline"
                  >
                    Checar de novo
                  </button>
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onPress={onSendAnyway}>
                Enviar mesmo assim
              </Button>
              <Button onPress={onBack}>Voltar e corrigir</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
