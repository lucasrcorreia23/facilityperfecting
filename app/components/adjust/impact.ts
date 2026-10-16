import {
  type AdjustSection,
  type AdjustSections,
  type AdjustState,
  DIFFICULTY_LEVELS,
  normTitle,
  ROLE_PLAY_STATUSES,
} from "@/supabase/functions/_shared/roleplay-adjust-model";

/**
 * O que um salvar muda de verdade, em frases para o modal de confirmação.
 * `critical` = afeta quem treina de um jeito que não dá para perceber só olhando a
 * aba: some do catálogo, muda outros roleplays, remove conteúdo, troca o nível.
 */
export interface SaveImpact {
  critical: boolean;
  items: string[];
}

const statusLabel = (id: number | null) => {
  const s = ROLE_PLAY_STATUSES.find((x) => x.id === id);
  return s ? `${s.label} (${s.hint})` : String(id);
};
const levelLabel = (id: number | null) => DIFFICULTY_LEVELS.find((d) => d.id === id)?.label ?? "—";
const quoted = (xs: string[]) => xs.map((x) => `“${x}”`).join(", ");

export function describeImpact(
  section: AdjustSection,
  loaded: AdjustSections,
  draft: AdjustSections,
  state: AdjustState,
): SaveImpact {
  const items: string[] = [];
  let critical = false;
  const others = state.siblings.map((s) => s.training_name);

  switch (section) {
    case "general": {
      const a = loaded.general;
      const b = draft.general;
      if (a.role_play_status_id !== b.role_play_status_id) {
        critical = true;
        const hides = b.role_play_status_id === 1 || b.role_play_status_id === 2;
        items.push(
          `Quem vê passa de ${statusLabel(a.role_play_status_id)} para ${statusLabel(b.role_play_status_id)}.` +
            (hides
              ? " Os vendedores deixam de ver este roleplay no catálogo."
              : " O roleplay fica disponível para os vendedores."),
        );
      }
      if (a.difficulty_level_id !== b.difficulty_level_id) {
        critical = true;
        items.push(
          `Nível muda de ${levelLabel(a.difficulty_level_id)} para ${levelLabel(b.difficulty_level_id)}: o comprador passa a usar o comportamento e as objeções desse nível, e a nota do vendedor muda de régua.`,
        );
      }
      if (a.training_name.trim() !== b.training_name.trim()) {
        items.push("O nome muda no catálogo dos vendedores.");
      }
      break;
    }
    case "objections": {
      const keep = new Set(draft.objections.map((o) => o.key).filter(Boolean));
      const removed = loaded.objections.filter((o) => o.key && !keep.has(o.key)).map((o) => o.titulo);
      const added = draft.objections.filter((o) => o.key == null).map((o) => o.titulo || "(sem título)");
      const before = new Map(loaded.objections.map((o) => [o.key, o]));
      const changed = draft.objections.filter((o) => {
        const l = o.key ? before.get(o.key) : undefined;
        return l && (normTitle(l.titulo) !== normTitle(o.titulo) || l.ceder_se !== o.ceder_se || l.fala_exemplo !== o.fala_exemplo || l.detalhes !== o.detalhes || l.tipo !== o.tipo);
      });
      if (removed.length > 0) {
        critical = true;
        items.push(`Remove ${removed.length} objeção(ões): ${quoted(removed)}. O comprador deixa de levantá-las.`);
      }
      if (added.length > 0) items.push(`Adiciona ${quoted(added)}.`);
      if (changed.length > 0) items.push(`Altera ${quoted(changed.map((o) => o.titulo))}.`);
      if (draft.objections.some((o) => o.scope === "context" && changed.includes(o))) {
        critical = true;
        items.push("Há objeção do contexto alterada: a mudança vale também para os outros roleplays do contexto.");
      }
      if (draft.objections.length > 3) {
        critical = true;
        items.push(`Ficam ${draft.objections.length} objeções, mas só 3 entram na conversa: as últimas não aparecem.`);
      }
      break;
    }
    case "persona": {
      critical = true;
      const a = loaded.persona;
      const b = draft.persona;
      items.push(
        others.length > 0
          ? `A persona é compartilhada: a mudança vale também para ${quoted(others)}.`
          : "A mudança vale para todo roleplay que usar esta persona.",
      );
      if (a && b) {
        if (a.persona_prompt.trim() !== b.persona_prompt.trim()) items.push("Muda a personalidade e o jeito de reagir do comprador.");
        const bp = new Map((b.pains ?? []).map((p) => [p.offer_pain_id, p]));
        const removed = (a.pains ?? []).filter((p) => !bp.has(p.offer_pain_id)).map((p) => p.title);
        if (removed.length > 0) items.push(`Desliga ${removed.length} dor(es): ${quoted(removed)}. O comprador deixa de tê-las.`);
        const reveal = (a.pains ?? []).filter((p) => bp.has(p.offer_pain_id) && bp.get(p.offer_pain_id)!.reveal_level !== p.reveal_level);
        if (reveal.length > 0) items.push(`Muda quando o comprador revela ${quoted(reveal.map((p) => p.title))}.`);
      }
      break;
    }
    case "guardrails": {
      critical = true;
      items.push(
        others.length > 0
          ? `As regras valem para o contexto inteiro: a mudança vale também para ${quoted(others)}.`
          : "As regras valem para todo roleplay deste contexto.",
      );
      const keep = new Set(draft.guardrails.map((g) => g.id).filter((x) => x != null));
      const removed = loaded.guardrails.filter((g) => g.id != null && !keep.has(g.id)).map((g) => g.nome);
      if (removed.length > 0) items.push(`Remove ${removed.length} regra(s): ${quoted(removed)}.`);
      break;
    }
    case "step_knowledge": {
      const firstBefore = loaded.step_knowledge[0]?.prior.trim() ?? "";
      const firstAfter = draft.step_knowledge[0]?.prior.trim() ?? "";
      if (firstBefore && !firstAfter) {
        critical = true;
        items.push(
          "O ponto de partida do 1º bloco fica vazio: o comprador começa a conversa sem saber o que aconteceu antes.",
        );
      }
      items.push("Muda o que o comprador sabe e revela, e o que o vendedor vê, a partir da próxima chamada.");
      break;
    }
    case "prior_knowledge":
      items.push("Muda a cola que o vendedor vê antes e durante a chamada.");
      break;
  }
  return { critical, items };
}
