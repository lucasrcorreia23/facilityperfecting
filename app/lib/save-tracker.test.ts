import { describe, expect, it } from "vitest";
import { createSaveTracker } from "./save-tracker";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSaveTracker", () => {
  it("começa parado e passa por salvando → salvo", async () => {
    const tracker = createSaveTracker();
    expect(tracker.getState()).toBe("idle");
    const d = deferred<string>();
    const running = tracker.run("a", () => d.promise);
    expect(tracker.getState()).toBe("saving");
    d.resolve("ok");
    expect(await running).toBe("ok");
    expect(tracker.getState()).toBe("saved");
  });

  it("segue 'salvando' enquanto houver qualquer gravação em voo", async () => {
    const tracker = createSaveTracker();
    const a = deferred();
    const b = deferred();
    const ra = tracker.run("a", () => a.promise);
    const rb = tracker.run("b", () => b.promise);
    a.resolve();
    await ra;
    expect(tracker.getState()).toBe("saving");
    b.resolve();
    await rb;
    expect(tracker.getState()).toBe("saved");
  });

  it("whenIdle espera a gravação disparada pelo blur antes do clique", async () => {
    const tracker = createSaveTracker();
    const d = deferred();
    const order: string[] = [];
    const running = tracker.run("a", () => d.promise.then(() => void order.push("gravou")));
    const idle = tracker.whenIdle().then((r) => {
      order.push("enviou");
      return r;
    });
    d.resolve();
    await running;
    expect(await idle).toEqual({ ok: true });
    expect(order).toEqual(["gravou", "enviou"]);
  });

  it("whenIdle resolve na hora quando não há nada em voo", async () => {
    expect(await createSaveTracker().whenIdle()).toEqual({ ok: true });
  });

  it("falha repassa o erro, marca 'error' e barra o envio", async () => {
    const tracker = createSaveTracker();
    await expect(tracker.run("a", () => Promise.reject(new Error("rede")))).rejects.toThrow("rede");
    expect(tracker.getState()).toBe("error");
    expect(await tracker.whenIdle()).toEqual({ ok: false });
  });

  it("gravação boa de OUTRA chave não apaga a falha; da mesma chave, apaga", async () => {
    const tracker = createSaveTracker();
    await tracker.run("a", () => Promise.reject(new Error("x"))).catch(() => {});
    await tracker.run("b", () => Promise.resolve());
    expect(tracker.getState()).toBe("error");
    await tracker.run("a", () => Promise.resolve());
    expect(tracker.getState()).toBe("saved");
    expect(await tracker.whenIdle()).toEqual({ ok: true });
  });

  it("retryFailed repete só o que falhou", async () => {
    const tracker = createSaveTracker();
    let attempts = 0;
    const flaky = () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("x")) : Promise.resolve();
    };
    await tracker.run("a", flaky).catch(() => {});
    expect(await tracker.retryFailed()).toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(tracker.getState()).toBe("saved");
  });

  it("retryFailed que falha de novo continua em 'error'", async () => {
    const tracker = createSaveTracker();
    await tracker.run("a", () => Promise.reject(new Error("x"))).catch(() => {});
    expect(await tracker.retryFailed()).toEqual({ ok: false });
    expect(tracker.getState()).toBe("error");
  });

  it("operação não repetível que falha não fica guardada", async () => {
    const tracker = createSaveTracker();
    await tracker
      .run("excluir", () => Promise.reject(new Error("x")), { retryable: false })
      .catch(() => {});
    expect(tracker.getState()).toBe("idle");
    expect(await tracker.whenIdle()).toEqual({ ok: true });
  });

  it("avisa os assinantes a cada mudança e para depois do unsubscribe", async () => {
    const tracker = createSaveTracker();
    const seen: string[] = [];
    const unsubscribe = tracker.subscribe(() => seen.push(tracker.getState()));
    await tracker.run("a", () => Promise.resolve());
    expect(seen).toEqual(["saving", "saved"]);
    unsubscribe();
    await tracker.run("a", () => Promise.resolve());
    expect(seen).toHaveLength(2);
  });
});
