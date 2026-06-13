"use client";

import { useEffect, useState } from "react";
import { Select, SelectItem, Input, addToast } from "@heroui/react";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";
import { getEvalWeights, updateEvalWeights } from "@/app/lib/db";
import { EVALUATION_CRITERIA, defaultEvalWeights } from "@/app/lib/evaluation-criteria";

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [callContext, setCallContext] = useState("");
  const [userGroupId, setUserGroupId] = useState("");

  // Pesos dos critérios de avaliação (key → % como string).
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data }, ew] = await Promise.all([
        supabase.from("app_settings").select("*").maybeSingle(),
        getEvalWeights(),
      ]);
      if (data) {
        setDifficulty(data.default_difficulty ?? "medium");
        setCallContext(data.default_call_context_slug ?? "");
        setUserGroupId(data.default_user_group_id ? String(data.default_user_group_id) : "");
      }
      const base = defaultEvalWeights();
      setWeights(
        Object.fromEntries(
          EVALUATION_CRITERIA.map((c) => [c.key, String(ew[c.key] ?? base[c.key])]),
        ),
      );
      setLoading(false);
    })();
  }, []);

  async function saveWeights() {
    const nums = EVALUATION_CRITERIA.map((c) => Number(weights[c.key]));
    if (nums.some((n) => Number.isNaN(n) || n < 0)) {
      addToast({ title: "Pesos inválidos", color: "warning" });
      return;
    }
    if (nums.reduce((a, b) => a + b, 0) !== 100) {
      addToast({ title: "Os pesos devem somar 100%", color: "warning" });
      return;
    }
    setSavingWeights(true);
    try {
      await updateEvalWeights(
        Object.fromEntries(EVALUATION_CRITERIA.map((c) => [c.key, Number(weights[c.key])])),
      );
      addToast({ title: "Pesos salvos", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar pesos",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSavingWeights(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("app_settings").upsert(
        {
          created_by: user.id,
          default_difficulty: difficulty,
          default_call_context_slug: callContext || null,
          default_user_group_id: userGroupId ? Number(userGroupId) : null,
          environment: "hml",
        },
        { onConflict: "created_by" },
      );
      if (error) throw error;
      addToast({ title: "Configurações salvas", color: "success" });
    } catch (err) {
      addToast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : String(err),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingView label="Carregando configurações…" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Defaults aplicados a cada export." />

      <Card className="flex flex-col gap-6 p-5">
        <Select
          label="Dificuldade padrão"
          labelPlacement="outside"
          selectedKeys={[difficulty]}
          onSelectionChange={(k) => setDifficulty(String(Array.from(k)[0] ?? "medium"))}
          radius="sm"
          variant="bordered"
          classNames={managerSelectClassNames}
        >
          <SelectItem key="easy">Fácil</SelectItem>
          <SelectItem key="medium">Médio</SelectItem>
          <SelectItem key="hard">Difícil</SelectItem>
        </Select>

        <Input
          label="Slug do tipo de chamada (opcional)"
          labelPlacement="outside"
          placeholder="ex.: cold_call (vazio = IA escolhe)"
          value={callContext}
          onValueChange={setCallContext}
          radius="sm"
          variant="bordered"
        />

        <Input
          label="user_group_id padrão (opcional)"
          labelPlacement="outside"
          placeholder="vazio = org-wide"
          value={userGroupId}
          onValueChange={setUserGroupId}
          radius="sm"
          variant="bordered"
        />

        <div className="flex justify-end">
          <Button onPress={save} isLoading={saving}>
            Salvar
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate-800">
            Pesos dos critérios de avaliação
          </h2>
          <p className="text-sm text-slate-500">
            Definem quanto cada critério pesa na qualidade média de cada roleplay, na tela de
            Prontidão. Valem para todos os roleplays e devem somar 100%.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          {EVALUATION_CRITERIA.map((c) => (
            <Input
              key={c.key}
              label={`${c.label} (%)`}
              labelPlacement="outside"
              type="number"
              description={c.description}
              value={weights[c.key] ?? ""}
              onValueChange={(v) => setWeights((prev) => ({ ...prev, [c.key]: v }))}
              radius="sm"
              variant="bordered"
              className="w-52"
            />
          ))}
        </div>
        <div className="flex justify-end">
          <Button onPress={saveWeights} isLoading={savingWeights}>
            Salvar pesos
          </Button>
        </div>
      </Card>
    </div>
  );
}
