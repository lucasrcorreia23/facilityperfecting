import type { RoleplayScript } from "@/app/lib/roleplay-scripts";

// Cada linha do roteiro: "9. [instrução] \"fala\"" ou "7. [instrução]" ou só a fala.
const LINE_RE = /^(\d+)\.\s*(?:\[([^\]]*)\])?\s*(.*)$/;

/**
 * Renderiza o roteiro de forma legível: número à esquerda, instruções entre
 * colchetes em texto discreto (não são para falar) e a fala em destaque.
 * Sem estado — usado no modal da Prontidão e na página /roteiro/[num].
 */
export function ScriptView({ script }: { script: RoleplayScript }) {
  const steps = script.body.split("\n").map((line, i) => {
    const m = line.match(LINE_RE);
    if (!m) return { key: i, n: null, note: null, fala: line };
    return { key: i, n: m[1], note: m[2] ?? null, fala: m[3] ?? "" };
  });

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s) => (
        <li key={s.key} className="flex gap-2.5 text-sm leading-relaxed text-slate-800">
          {s.n && (
            <span className="w-5 shrink-0 text-right tabular-nums font-medium text-slate-400">
              {s.n}.
            </span>
          )}
          <div className="min-w-0">
            {s.note && (
              <span className="mr-1.5 italic text-xs text-slate-400">[{s.note}]</span>
            )}
            {s.fala && <span className="whitespace-pre-line">{s.fala}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
