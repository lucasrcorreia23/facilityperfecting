import { describe, expect, it } from "vitest";
import {
  markReviewedDraftsUsed,
  materialFiles,
  MAX_REVIEWED_DRAFTS,
  reviewedDraftRefs,
  withReviewedDrafts,
} from "./reviewed-draft-refs.ts";

const file = { name: "playbook.pdf", path: "u/playbook.pdf", chars: 1200 };

describe("referências a rascunhos em input_files", () => {
  it("convive com os arquivos do material sem misturar", () => {
    const files = withReviewedDrafts([file], [{ id: "d1", title: "Plano X", updated_at: "2026-11-10T10:00:00Z" }]);
    expect(materialFiles(files)).toEqual([file]);
    expect(reviewedDraftRefs(files)).toEqual([
      {
        kind: "reviewed_draft",
        draft_id: "d1",
        name: "Rascunho revisado: Plano X",
        path: null,
        chars: 0,
        draft_updated_at: "2026-11-10T10:00:00Z",
        used_at: null,
      },
    ]);
    // Formato de arquivo: quem lista input_files continua achando name/path/chars.
    for (const entry of files as Array<Record<string, unknown>>) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.chars).toBe("number");
    }
  });

  it("entrada estranha ou coluna vazia não quebra", () => {
    expect(reviewedDraftRefs(null)).toEqual([]);
    expect(reviewedDraftRefs([file, { kind: "reviewed_draft" }, "x", null])).toEqual([]);
    expect(materialFiles(undefined)).toEqual([]);
  });

  it("trocar a seleção substitui as referências, sem repetir e até o máximo", () => {
    const first = withReviewedDrafts([file], [{ id: "d1", title: "A" }, { id: "d1", title: "A" }]);
    expect(reviewedDraftRefs(first)).toHaveLength(1);
    const second = withReviewedDrafts(first, [{ id: "d2", title: "B" }]);
    expect(reviewedDraftRefs(second).map((r) => r.draft_id)).toEqual(["d2"]);
    expect(withReviewedDrafts(second, [])).toEqual([file]);
    const many = Array.from({ length: MAX_REVIEWED_DRAFTS + 2 }, (_, i) => ({ id: `d${i}`, title: `T${i}` }));
    expect(reviewedDraftRefs(withReviewedDrafts([], many))).toHaveLength(MAX_REVIEWED_DRAFTS);
  });

  it("carimba o que entrou na geração, marca o que sumiu e guarda o histórico", () => {
    const chosen = withReviewedDrafts([file], [{ id: "d1", title: "A" }, { id: "d2", title: "B" }]);
    const after = markReviewedDraftsUsed(chosen, [{ draft_id: "d1", chars: 900 }], ["d2"], "2026-11-10T12:00:00Z");
    expect(materialFiles(after)).toEqual([file]);
    const [a, b] = reviewedDraftRefs(after);
    expect(a).toMatchObject({ draft_id: "d1", chars: 900, used_at: "2026-11-10T12:00:00Z" });
    expect(a.missing).toBeUndefined();
    expect(b).toMatchObject({ draft_id: "d2", chars: 0, missing: true });
    // Escolher de novo o mesmo rascunho conserva quando ele foi usado.
    const again = withReviewedDrafts(after, [{ id: "d1", title: "A (renomeado)" }]);
    expect(reviewedDraftRefs(again)[0]).toMatchObject({
      name: "Rascunho revisado: A (renomeado)",
      chars: 900,
      used_at: "2026-11-10T12:00:00Z",
    });
    // Rascunho que voltou a existir deixa de estar marcado como ausente.
    const back = markReviewedDraftsUsed(after, [{ draft_id: "d2", chars: 10 }], [], "2026-11-11T00:00:00Z");
    expect(reviewedDraftRefs(back).find((r) => r.draft_id === "d2")?.missing).toBeUndefined();
  });

  it("rascunho que existe mas não entrou (vazio ou cortado) não vira ausente", () => {
    const chosen = withReviewedDrafts([], [{ id: "d1", title: "A" }, { id: "d2", title: "B" }]);
    const after = markReviewedDraftsUsed(chosen, [{ draft_id: "d1", chars: 50 }], [], "2026-11-10T12:00:00Z");
    const d2 = reviewedDraftRefs(after).find((r) => r.draft_id === "d2");
    expect(d2).toMatchObject({ chars: 0, used_at: null });
    expect(d2?.missing).toBeUndefined();
  });

  it("referência criada só com o id ganha o título do rascunho na geração", () => {
    const chosen = withReviewedDrafts([], [{ id: "d1" }]);
    expect(reviewedDraftRefs(chosen)[0].name).toBe("Rascunho revisado: sem título");
    const after = markReviewedDraftsUsed(chosen, [{ draft_id: "d1", chars: 50, title: "Plano X" }], [], "2026-11-10T12:00:00Z");
    expect(reviewedDraftRefs(after)[0].name).toBe("Rascunho revisado: Plano X");
  });
});
