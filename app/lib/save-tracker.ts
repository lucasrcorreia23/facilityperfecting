/**
 * Contador compartilhado das gravações de uma tela que salva no blur. Serve a
 * duas coisas: o indicador "Salvando… / Salvo" e o envio, que precisa esperar o
 * que ainda está em voo — clicar em "Enviar" com um campo em foco dispara o blur
 * e o clique em sequência, e o envio saía sem a última edição.
 *
 * Gravação que falha fica guardada pela chave: o estado vira "error", o envio é
 * barrado e dá para tentar de novo sem redigitar. Uma gravação boa da MESMA
 * chave limpa a falha (a pessoa corrigiu o campo).
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SaveTracker {
  /**
   * Executa uma gravação contando-a como pendente. Repassa o resultado e o erro
   * de `work`. `retryable: false` para operação que não faz sentido repetir
   * depois (criar, excluir, reordenar): a falha não fica guardada.
   */
  run<T>(key: string, work: () => Promise<T>, options?: { retryable?: boolean }): Promise<T>;
  getState(): SaveState;
  subscribe(listener: () => void): () => void;
  /** Resolve quando não há gravação em voo; `ok: false` se alguma ficou sem gravar. */
  whenIdle(): Promise<{ ok: boolean }>;
  /** Repete as gravações que falharam. Resolve como `whenIdle`. */
  retryFailed(): Promise<{ ok: boolean }>;
}

export function createSaveTracker(): SaveTracker {
  let pending = 0;
  let savedOnce = false;
  const failed = new Map<string, () => Promise<unknown>>();
  const listeners = new Set<() => void>();
  let idleWaiters: Array<() => void> = [];

  const emit = () => listeners.forEach((listener) => listener());

  function getState(): SaveState {
    if (pending > 0) return "saving";
    if (failed.size > 0) return "error";
    return savedOnce ? "saved" : "idle";
  }

  async function run<T>(
    key: string,
    work: () => Promise<T>,
    options: { retryable?: boolean } = {},
  ): Promise<T> {
    pending += 1;
    emit();
    try {
      const result = await work();
      failed.delete(key);
      savedOnce = true;
      return result;
    } catch (err) {
      if (options.retryable !== false) failed.set(key, work);
      throw err;
    } finally {
      pending -= 1;
      if (pending === 0) {
        const waiters = idleWaiters;
        idleWaiters = [];
        waiters.forEach((resolve) => resolve());
      }
      emit();
    }
  }

  function whenIdle(): Promise<{ ok: boolean }> {
    const result = () => ({ ok: failed.size === 0 });
    if (pending === 0) return Promise.resolve(result());
    return new Promise((resolve) => idleWaiters.push(() => resolve(result())));
  }

  async function retryFailed(): Promise<{ ok: boolean }> {
    const again = Array.from(failed.entries());
    await Promise.all(
      again.map(([key, work]) =>
        run(key, work).catch(() => {
          // segue guardada em `failed`; o estado continua "error"
        }),
      ),
    );
    return whenIdle();
  }

  return {
    run,
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    whenIdle,
    retryFailed,
  };
}
