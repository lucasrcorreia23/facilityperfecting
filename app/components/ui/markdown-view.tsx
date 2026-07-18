import type { ReactNode } from "react";

// Renderizador leve de markdown (generalização do ScriptView): títulos #..######,
// ---, **negrito**, *itálico*, `código`, listas -/* e N., tabelas simples
// (| a | b |) e parágrafos. Sem dependências externas; server-safe.

/** Inline: **negrito**, *itálico*, `código` e instruções [..]. */
function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\])/g)
    .filter((p) => p !== "")
    .map((p, i) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) {
        return (
          <strong key={i} className="font-semibold text-slate-900">
            {p.slice(2, -2)}
          </strong>
        );
      }
      if (/^\*[^*]+\*$/.test(p)) {
        return (
          <em key={i} className="italic">
            {p.slice(1, -1)}
          </em>
        );
      }
      if (/^`[^`]+`$/.test(p)) {
        return (
          <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-700">
            {p.slice(1, -1)}
          </code>
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

/** Divide uma linha de tabela em células (descarta bordas vazias). */
function splitRow(line: string): string[] {
  const cells = line.trim().split("|");
  if (cells[0]?.trim() === "") cells.shift();
  if (cells[cells.length - 1]?.trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
}

export function MarkdownView({ markdown }: { markdown: string }) {
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

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="my-1 border-slate-200" />);
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level <= 1
          ? "text-base font-semibold text-slate-900 mt-2"
          : level === 2
            ? "text-sm font-semibold text-slate-900 mt-2"
            : level === 3
              ? "text-sm font-semibold text-slate-800 mt-1"
              : "text-xs font-semibold uppercase tracking-wide text-slate-500 mt-1";
      blocks.push(
        <p key={key++} className={cls}>
          {renderInline(heading[2])}
        </p>,
      );
      i++;
      continue;
    }

    // Tabela simples: linha de cabeçalho + separador + linhas de dados.
    if (isTableRow(trimmed) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto rounded-sm border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {header.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-100 last:border-0">
                  {header.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 align-top text-slate-700">
                      {renderInline(row[cIdx] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
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
            <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-slate-800">
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
            <li key={idx} className="text-sm leading-relaxed text-slate-800 marker:text-slate-300">
              {renderInline(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-slate-700">
        {renderInline(trimmed)}
      </p>,
    );
    i++;
  }

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
