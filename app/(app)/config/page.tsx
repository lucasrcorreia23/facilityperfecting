"use client";

import { useEffect, useState } from "react";
import { Select, SelectItem, Input, addToast } from "@heroui/react";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";
import { updateAppWeights } from "@/app/lib/db";

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [callContext, setCallContext] = useState("");
  const [userGroupId, setUserGroupId] = useState("");

  // Pesos dos critérios da Prontidão (globais).
  const [wPrompt, setWPrompt] = useState("30");
  const [wRoteiro, setWRoteiro] = useState("40");
  const [wTeste, setWTeste] = useState("30");
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      if (data) {
        setDifficulty(data.default_difficulty ?? "medium");
        setCallContext(data.default_call_context_slug ?? "");
        setUserGroupId(data.default_user_group_id ? String(data.default_user_group_id) : "");
        if (data.weight_prompt != null) setWPrompt(String(Math.round(data.weight_prompt * 100)));
        if (data.weight_roteiro != null)
          setWRoteiro(String(Math.round(data.weight_roteiro * 100)));
        if (data.weight_teste != null) setWTeste(String(Math.round(data.weight_teste * 100)));
      }
      setLoading(false);
    })();
  }, []);

  async function saveWeights() {
    const p = Number(wPrompt);
    const r = Number(wRoteiro);
    const t = Number(wTeste);
    if ([p, r, t].some((n) => Number.isNaN(n) || n < 0)) {
      addToast({ title: "Pesos inválidos", color: "warning" });
      return;
    }
    if (p + r + t !== 100) {
      addToast({ title: "Os pesos devem somar 100%", color: "warning" });
      return;
    }
    setSavingWeights(true);
    try {
      await updateAppWeights({
        weight_prompt: p / 100,
        weight_roteiro: r / 100,
        weight_teste: t / 100,
      });
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
            Pesos dos critérios da Prontidão
          </h2>
          <p className="text-sm text-slate-500">
            Definem quanto cada critério (Prompt Contextual, Realismo da Fala e Testes) pesa no
            score de prontidão de cada roleplay, na tela de Prontidão. Valem para todos os
            roleplays e devem somar 100%.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Input
            label="Prompt Contextual (%)"
            labelPlacement="outside"
            type="number"
            value={wPrompt}
            onValueChange={setWPrompt}
            radius="sm"
            variant="bordered"
            className="w-40"
          />
          <Input
            label="Realismo da Fala (%)"
            labelPlacement="outside"
            type="number"
            value={wRoteiro}
            onValueChange={setWRoteiro}
            radius="sm"
            variant="bordered"
            className="w-40"
          />
          <Input
            label="Testes (%)"
            labelPlacement="outside"
            type="number"
            value={wTeste}
            onValueChange={setWTeste}
            radius="sm"
            variant="bordered"
            className="w-40"
          />
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
