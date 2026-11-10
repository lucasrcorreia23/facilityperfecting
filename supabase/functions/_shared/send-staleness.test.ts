import { describe, expect, it } from "vitest";
import {
  isStaleSend,
  PLAYBOOK_SEND_STALE_MS,
  ROLEPLAY_SEND_STALE_MS,
  staleSendError,
} from "./send-staleness.ts";

const NOW = Date.parse("2026-11-10T12:00:00Z");

describe("isStaleSend", () => {
  it("dentro do prazo não é vencido", () => {
    expect(isStaleSend("2026-11-10T11:57:00Z", NOW, PLAYBOOK_SEND_STALE_MS)).toBe(false);
    expect(isStaleSend("2026-11-10T11:51:00Z", NOW, ROLEPLAY_SEND_STALE_MS)).toBe(false);
  });

  it("passou do prazo é vencido", () => {
    expect(isStaleSend("2026-11-10T11:54:59Z", NOW, PLAYBOOK_SEND_STALE_MS)).toBe(true);
    expect(isStaleSend("2026-11-10T11:49:00Z", NOW, ROLEPLAY_SEND_STALE_MS)).toBe(true);
  });

  it("data ausente ou inválida nunca destrava", () => {
    expect(isStaleSend(null, NOW, 1)).toBe(false);
    expect(isStaleSend(undefined, NOW, 1)).toBe(false);
    expect(isStaleSend("ontem", NOW, 1)).toBe(false);
  });
});

describe("staleSendError", () => {
  it("tem a forma { status, detail: { message } } que a tela humaniza", () => {
    const e = staleSendError();
    expect(e.status).toBe(408);
    expect(e.detail.message).toMatch(/não terminou/);
  });
});
