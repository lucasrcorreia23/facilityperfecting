"use client";

import { useSyncExternalStore } from "react";
import { Spinner } from "@heroui/react";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { SaveTracker } from "@/app/lib/save-tracker";

/**
 * "Salvando… / Alterações salvas" de uma tela que grava no blur. Em erro,
 * oferece repetir a gravação — o que foi digitado continua no campo.
 */
export function SaveIndicator({ tracker }: { tracker: SaveTracker }) {
  const state = useSyncExternalStore(tracker.subscribe, tracker.getState, () => "idle" as const);
  return (
    <span role="status" aria-live="polite" className="inline-flex min-h-[24px] items-center text-xs">
      {state === "saving" && (
        <span className="inline-flex items-center gap-1.5 text-slate-500">
          <Spinner size="sm" color="default" classNames={{ wrapper: "h-3.5 w-3.5" }} />
          Salvando…
        </span>
      )}
      {state === "saved" && (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <CheckIcon className="h-3.5 w-3.5 text-green-600" />
          Alterações salvas
        </span>
      )}
      {state === "error" && (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-red-700">
          <span className="inline-flex items-center gap-1">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Uma alteração não foi salva
          </span>
          <button
            type="button"
            onClick={() => void tracker.retryFailed()}
            className="inline-flex min-h-[44px] items-center underline underline-offset-2 hover:text-red-900 sm:min-h-0"
          >
            Tentar salvar de novo
          </button>
        </span>
      )}
    </span>
  );
}
