"use client";

import { useCallback, useEffect, useState } from "react";
import { describeFunctionError, listConnections } from "@/app/lib/db";
import type { Connection } from "@/app/lib/types";

/**
 * Contas de destino para os seletores. `connections` é null enquanto carrega;
 * se a leitura falhar, `error` traz o motivo e `reload` tenta de novo — um
 * seletor vazio sem explicação parecia "não há contas".
 */
export function useConnections() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listConnections()
      .then((items) => {
        setConnections(items);
        setError(null);
      })
      .catch((err) => {
        setConnections((current) => current ?? []);
        setError(describeFunctionError(err));
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { connections, error, reload };
}
