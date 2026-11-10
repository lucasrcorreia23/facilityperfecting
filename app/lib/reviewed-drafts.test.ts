import { describe, expect, it } from "vitest";
import { reviewedDraftOptions, type ReviewedDraftCandidate } from "./reviewed-drafts";

const draft = (over: Partial<ReviewedDraftCandidate>): ReviewedDraftCandidate => ({
  id: "d",
  title: "Rascunho",
  connection_id: null,
  updated_at: "2026-11-01T00:00:00Z",
  scenario: {},
  generation_output: { perfil: "x" },
  ...over,
});

describe("reviewedDraftOptions", () => {
  it("deixa de fora o que não passou pela IA e os debates", () => {
    const out = reviewedDraftOptions([
      draft({ id: "ok" }),
      draft({ id: "cru", generation_output: null }),
      draft({ id: "debate", scenario: { generation_mode: "debate", debate: {} } }),
    ]);
    expect(out.map((o) => o.id)).toEqual(["ok"]);
  });

  it("primeiro os da conta do playbook, depois os mais recentes", () => {
    const out = reviewedDraftOptions(
      [
        draft({ id: "antigo-da-conta", connection_id: "c1", updated_at: "2026-10-01T00:00:00Z" }),
        draft({ id: "novo-de-outra", connection_id: "c2", updated_at: "2026-11-09T00:00:00Z" }),
        draft({ id: "meio-sem-conta", updated_at: "2026-11-05T00:00:00Z" }),
      ],
      "c1",
    );
    expect(out.map((o) => o.id)).toEqual(["antigo-da-conta", "novo-de-outra", "meio-sem-conta"]);
    expect(out[0].sameAccount).toBe(true);
  });

  it("rotula título, conta e quantas respostas às lacunas vão junto", () => {
    const [o] = reviewedDraftOptions([
      draft({
        title: " ",
        offer: { offer_name: "Plano X" },
        connection: { org_name: "FIESC", environment: "prod" },
        scenario: {
          gap_answers: [
            { item: "Preço", resposta: "R$ 100", nao_se_aplica: false },
            { item: "Sem resposta", resposta: "", nao_se_aplica: false },
          ],
        },
      }),
    ]);
    expect(o).toMatchObject({ title: "Plano X", account: "FIESC (prod)", answers: 1, sameAccount: false });
    expect(reviewedDraftOptions([draft({ title: null })])[0]).toMatchObject({
      title: "Rascunho sem título",
      account: "Sem conta",
      answers: 0,
    });
  });
});
