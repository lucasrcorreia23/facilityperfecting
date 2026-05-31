"use client";

import { useEffect, useState } from "react";
import { Select, SelectItem, Input, addToast } from "@heroui/react";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/ui/page-header";
import { LoadingView } from "@/app/components/ui/loading-view";
import { managerSelectClassNames } from "@/app/lib/select-classnames";
import { createClient } from "@/app/lib/supabase/client";

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [callContext, setCallContext] = useState("");
  const [userGroupId, setUserGroupId] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      if (data) {
        setDifficulty(data.default_difficulty ?? "medium");
        setCallContext(data.default_call_context_slug ?? "");
        setUserGroupId(data.default_user_group_id ? String(data.default_user_group_id) : "");
      }
      setLoading(false);
    })();
  }, []);

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
    </div>
  );
}
