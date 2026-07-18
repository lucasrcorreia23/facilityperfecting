import type { RadarEntry } from "@/app/lib/types";

// Gráfico radar (teia) em SVG puro — sem lib de chart. Um card por vendedor,
// eixos = categorias de habilidade, escala 0-10.

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 88;
const RINGS = [2.5, 5, 7.5, 10];
const MAX_SCORE = 10;

function polar(angle: number, r: number): [number, number] {
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
}

function polygonPoints(scores: number[], angles: number[]): string {
  return scores
    .map((score, i) => {
      const r = (Math.max(0, Math.min(MAX_SCORE, score)) / MAX_SCORE) * RADIUS;
      const [x, y] = polar(angles[i], r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Quebra o rótulo da categoria em até 2 linhas curtas. */
function wrapLabel(label: string): string[] {
  if (label.length <= 14) return [label];
  const words = label.split(" ");
  const lines: string[] = [""];
  for (const w of words) {
    const current = lines[lines.length - 1];
    if (current && (current + " " + w).length > 14 && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = current ? `${current} ${w}` : w;
  }
  return lines;
}

export function RadarView({ entry }: { entry: RadarEntry }) {
  const categorias = entry.categorias ?? [];
  const n = categorias.length;
  if (n < 3) {
    return (
      <div className="flex flex-col gap-1 rounded-sm border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-800">{entry.vendedor}</p>
        <p className="text-xs text-slate-500">Categorias insuficientes para o radar.</p>
      </div>
    );
  }

  const angles = categorias.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2);
  const scores = categorias.map((c) => c.score);

  return (
    <div className="flex flex-col items-center gap-1 rounded-sm border border-slate-200 bg-white p-4">
      <div className="flex w-full flex-col gap-0.5">
        <p className="text-sm font-semibold text-slate-800">{entry.vendedor}</p>
        <p className="text-xs text-slate-500">{entry.cargo}</p>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[300px]" role="img" aria-label={`Radar de competências de ${entry.vendedor}`}>
        {/* anéis da grade */}
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(categorias.map(() => ring), angles)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        {/* eixos */}
        {angles.map((angle, i) => {
          const [x, y] = polar(angle, RADIUS);
          return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
        })}
        {/* polígono de scores */}
        <polygon
          points={polygonPoints(scores, angles)}
          fill="#2e63cd"
          fillOpacity="0.18"
          stroke="#2e63cd"
          strokeWidth="1.5"
        />
        {scores.map((score, i) => {
          const r = (Math.max(0, Math.min(MAX_SCORE, score)) / MAX_SCORE) * RADIUS;
          const [x, y] = polar(angles[i], r);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#2e63cd" />;
        })}
        {/* rótulos */}
        {angles.map((angle, i) => {
          const [x, y] = polar(angle, RADIUS + 14);
          const anchor = Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
          const lines = wrapLabel(categorias[i].nome);
          return (
            <text
              key={i}
              x={x}
              y={y + (Math.sin(angle) > 0.3 ? 6 : 0)}
              textAnchor={anchor}
              className="fill-slate-500"
              fontSize="9"
            >
              {lines.map((line, li) => (
                <tspan key={li} x={x} dy={li === 0 ? 0 : 10}>
                  {line}
                </tspan>
              ))}
              <tspan x={x} dy="10" className="fill-slate-400" fontSize="8">
                {categorias[i].score.toFixed(1)}
              </tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}
