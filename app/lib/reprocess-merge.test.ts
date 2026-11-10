import { describe, expect, it } from "vitest";
import { describeMerge, mergeWithAnswers } from "./reprocess-merge";

const objection = (titulo: string, detalhes = "d") => ({ titulo, tipo: "preco", fala_exemplo: "f", detalhes, ceder_se: "c" });

describe("mergeWithAnswers", () => {
  it("atualiza o campo que ninguém editou depois da IA", () => {
    const r = mergeWithAnswers({
      current: { perfil: "  Perfil da IA  " },
      previousAi: { perfil: "Perfil da IA" },
      nextAi: { perfil: "Perfil com a resposta" },
    });
    expect(r.values).toEqual({ perfil: "Perfil com a resposta" });
    expect(r.suggestions).toEqual({});
    expect(r.changes).toEqual([{ key: "perfil", label: "Perfil do comprador", outcome: "updated" }]);
  });

  it("preserva a edição manual e guarda a nova versão como sugestão", () => {
    const r = mergeWithAnswers({
      current: { oferta_descricao: "Reescrita à mão" },
      previousAi: { oferta_descricao: "Descrição da IA" },
      nextAi: { oferta_descricao: "Descrição com a resposta" },
    });
    expect(r.values).toEqual({});
    expect(r.suggestions).toEqual({ oferta_descricao: "Descrição com a resposta" });
    expect(r.changes[0]).toMatchObject({ key: "oferta_descricao", outcome: "preserved" });
  });

  it("preenche o que está vazio, mesmo sem rodada anterior", () => {
    const r = mergeWithAnswers({ current: { perfil: " " }, previousAi: null, nextAi: { perfil: "Novo" } });
    expect(r.values).toEqual({ perfil: "Novo" });
    expect(r.changes[0].outcome).toBe("filled");
  });

  it("não mexe quando a IA devolve o mesmo texto ou não gera o campo", () => {
    const r = mergeWithAnswers({
      current: { perfil: "Igual", cenario_instrucoes: "Cenário escrito à mão" },
      previousAi: { perfil: "Igual" },
      nextAi: { perfil: "Igual", cenario_instrucoes: "" },
    });
    expect(r).toEqual({ values: {}, changes: [], suggestions: {} });
  });

  it("campo que a rodada anterior não gerou conta como editado", () => {
    // Rodada anterior no modo playbook (sem cenário); o operador escreveu o cenário.
    const r = mergeWithAnswers({
      current: { cenario_instrucoes: "Escrito pelo operador" },
      previousAi: { perfil: "x" },
      nextAi: { cenario_instrucoes: "Cenário da IA" },
    });
    expect(r.values).toEqual({});
    expect(r.changes[0].outcome).toBe("preserved");
  });

  it("sem rodada anterior, nada preenchido é sobrescrito", () => {
    const r = mergeWithAnswers({ current: { perfil: "Manual" }, previousAi: null, nextAi: { perfil: "IA" } });
    expect(r.values).toEqual({});
    expect(r.suggestions).toEqual({ perfil: "IA" });
  });

  it("lista intocada é trocada inteira; a ordem das chaves não conta como edição", () => {
    const prev = [objection("Preço"), objection("Prazo")];
    const current = [{ ceder_se: "c", detalhes: "d", fala_exemplo: "f", tipo: "preco", titulo: "Preço" }, objection("Prazo")];
    const next = [objection("Preço alto", "novo"), objection("Prazo"), objection("Contrato")];
    const r = mergeWithAnswers({ current: { objecoes: current }, previousAi: { objecoes: prev }, nextAi: { objecoes: next } });
    expect(r.values.objecoes).toBe(next);
    expect(r.changes[0]).toMatchObject({ key: "objecoes", outcome: "updated" });
  });

  it("lista editada à mão (item removido ou alterado) é preservada inteira", () => {
    const prev = [objection("Preço"), objection("Prazo")];
    const next = [objection("Preço"), objection("Prazo"), objection("Contrato")];
    for (const current of [[objection("Preço")], [objection("Preço", "mudei"), objection("Prazo")]]) {
      const r = mergeWithAnswers({ current: { objecoes: current }, previousAi: { objecoes: prev }, nextAi: { objecoes: next } });
      expect(r.values).toEqual({});
      expect(r.suggestions.objecoes).toBe(next);
    }
  });

  it("dossiê e escalares seguem a mesma regra", () => {
    const r = mergeWithAnswers({
      current: { dossie: { persona: { prompt: "p" } }, dificuldade: "hard", call_context_slug: "demo" },
      previousAi: { dossie: { persona: { prompt: "p" } }, dificuldade: "medium", call_context_slug: "demo" },
      nextAi: { dossie: { persona: { prompt: "p2" } }, dificuldade: "easy", call_context_slug: "cold_call" },
    });
    expect(r.values).toEqual({ dossie: { persona: { prompt: "p2" } }, call_context_slug: "cold_call" });
    expect(r.suggestions).toEqual({ dificuldade: "easy" });
  });
});

describe("describeMerge", () => {
  it("separa o que foi atualizado do que foi preservado", () => {
    expect(
      describeMerge([
        { key: "perfil", label: "Perfil do comprador", outcome: "updated" },
        { key: "objetivo", label: "Objetivo de treino", outcome: "filled" },
        { key: "oferta_descricao", label: "Descrição da oferta", outcome: "preserved" },
      ]),
    ).toBe("Atualizado: Objetivo de treino, Perfil do comprador. Preservado (editado à mão): Descrição da oferta.");
    expect(describeMerge([])).toBe("Nenhum campo mudou com as respostas.");
  });
});
