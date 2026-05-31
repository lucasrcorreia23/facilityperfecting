"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, addToast } from "@heroui/react";
import { createClient } from "@/app/lib/supabase/client";
import { Button } from "@/app/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        addToast({ title: "Não foi possível entrar", description: error.message, color: "danger" });
        return;
      }
      router.replace("/importar");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-xl font-semibold text-slate-800">Gerador de Roleplays</h1>
          <p className="text-sm text-slate-500">
            Importe textos e gere roleplays prontos na Perfecting.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-4 bg-white rounded-sm border border-slate-200 p-6"
        >
          <Input
            type="email"
            label="Email"
            labelPlacement="outside"
            placeholder="voce@empresa.com"
            value={email}
            onValueChange={setEmail}
            isRequired
            radius="sm"
            variant="bordered"
          />
          <Input
            type="password"
            label="Senha"
            labelPlacement="outside"
            placeholder="••••••••"
            value={password}
            onValueChange={setPassword}
            isRequired
            radius="sm"
            variant="bordered"
          />
          <Button type="submit" isLoading={loading} fullWidth>
            Entrar
          </Button>
        </form>
      </div>
    </main>
  );
}
