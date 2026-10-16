"use client";

import { useState } from "react";
import { addToast } from "@heroui/react";
import { Button } from "@/app/components/ui/button";
import { invokeAdjust } from "@/app/lib/db";

interface Gate {
  prompt: string;
  has_persona: boolean;
  has_behavior_guidance: boolean;
  has_knowledge_blocks: boolean;
  has_objections: boolean;
  has_difficulty_level: boolean;
}

const CHECKS: Array<{ key: keyof Gate; label: string }> = [
  { key: "has_persona", label: "Persona" },
  { key: "has_behavior_guidance", label: "Comportamento" },
  { key: "has_knowledge_blocks", label: "Conhecimento" },
  { key: "has_objections", label: "Objeções" },
  { key: "has_difficulty_level", label: "Dificuldade" },
];

/**
 * O prompt que o comprador recebe hoje, remontado na hora pela Perfecting (é o mesmo
 * que a chamada monta). Só leitura: serve para conferir o efeito de um ajuste.
 */
export function PromptTab({ connectionId, caseSetupId }: { connectionId: string; caseSetupId: number }) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [loading, setLoading] = useState(false);

  async function build() {
    setLoading(true);
    try {
      const res = await invokeAdjust<{ gate: Gate }>({ op: "preview", connectionId, caseSetupId });
      setGate(res.gate);
    } catch (e) {
      addToast({ title: "Não foi possível montar o prompt", description: (e as Error).message, color: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onPress={build} isLoading={loading}>
          {gate ? "Montar de novo" : "Montar o prompt agora"}
        </Button>
        {gate && (
          <Button
            variant="secondary"
            onPress={() => {
              void navigator.clipboard.writeText(gate.prompt);
              addToast({ title: "Prompt copiado", color: "success" });
            }}
          >
            Copiar
          </Button>
        )}
      </div>
      {gate && (
        <>
          <div className="flex flex-wrap gap-2">
            {CHECKS.map((c) => (
              <span
                key={c.key}
                className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
                  gate[c.key] ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {gate[c.key] ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-sm border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            {gate.prompt}
          </pre>
        </>
      )}
      {!gate && (
        <p className="text-sm text-slate-500">
          Monte depois de salvar um ajuste para ver como ele chega ao comprador. A chamada usa este mesmo prompt.
        </p>
      )}
    </div>
  );
}
