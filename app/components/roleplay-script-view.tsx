import type { ReactNode } from "react";

// Renderizador leve de markdown para os roteiros: cobre o subconjunto usado
// (títulos #/##/###, ---, **negrito**, listas - e N., parágrafos e instruções
// entre colchetes). Sem dependências externas; server-safe.

/** Negrito **...** e instruções [..] dentro de uma linha. */
function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g)
    .filter((p) => p !== "")
    .map((p, i) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        return (
          <strong key={i} className="font-semibold text-slate-900">
            {p.slice(2, -2)}
          </strong>
        );
      }
      if (/^\[[^\]]+\]$/.test(p)) {
        return (
          <span key={i} className="italic text-slate-400">
            {p}
          </span>
        );
      }
      return <span key={i}>{p}</span>;
    });
}

export function ScriptView({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    if (trimmed === "---") {
      blocks.push(<hr key={key++} className="my-1 border-slate-200" />);
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level <= 1
          ? "text-base font-semibold text-slate-900 mt-1"
          : level === 2
            ? "text-xs font-semibold uppercase tracking-wide text-slate-500 mt-2"
            : "text-sm font-semibold text-slate-800 mt-1";
      blocks.push(
        <p key={key++} className={cls}>
          {renderInline(heading[2])}
        </p>,
      );
      i++;
      continue;
    }

    // Lista ordenada (N.) — exibe o número parseado, não um contador CSS.
    if (/^\d+\.\s/.test(trimmed)) {
      const items: { n: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/)!;
        items.push({ n: m[1], text: m[2] });
        i++;
      }
      blocks.push(
        <ol key={key++} className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <li
              key={idx}
              className="flex gap-2.5 text-sm leading-relaxed text-slate-800"
            >
              <span className="w-6 shrink-0 text-right tabular-nums font-medium text-slate-400">
                {it.n}.
              </span>
              <span className="min-w-0">{renderInline(it.text)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Lista não ordenada (- ou *)
    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="flex list-disc flex-col gap-1.5 pl-5">
          {items.map((it, idx) => (
            <li
              key={idx}
              className="text-sm leading-relaxed text-slate-800 marker:text-slate-300"
            >
              {renderInline(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Parágrafo. Linhas que são puramente instruções [..] ficam discretas.
    const isInstruction = trimmed.startsWith("[") && trimmed.endsWith("]");
    blocks.push(
      <p
        key={key++}
        className={
          isInstruction
            ? "text-xs italic leading-relaxed text-slate-400"
            : "text-sm leading-relaxed text-slate-700"
        }
      >
        {renderInline(trimmed)}
      </p>,
    );
    i++;
  }

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
