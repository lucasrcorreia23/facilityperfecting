"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@heroui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { PageHeader } from "@/app/components/ui/page-header";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { LoadingView } from "@/app/components/ui/loading-view";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ConnectionPicker } from "@/app/components/ui/connection-picker";
import { invokeAdjust, listConnections } from "@/app/lib/db";
import type { Connection } from "@/app/lib/types";

interface RoleplayListItem {
  id: number;
  training_name: string;
  context_id: number | null;
  call_context_type_name: string | null;
  role_play_status_name: string | null;
  updated_at: string | null;
}

/** Escolha do roleplay a calibrar: conta → roleplay da org (lista ou id). */
function AjustarIndex() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [connectionId, setConnectionId] = useState<string>(searchParams.get("connection") ?? "");
  // A lista carregada guarda de qual conexão ela é: trocar de conta = "carregando".
  const [list, setList] = useState<{
    connectionId: string;
    roleplays: RoleplayListItem[] | null;
    error: string | null;
  } | null>(null);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [directId, setDirectId] = useState("");

  useEffect(() => {
    listConnections()
      .then((cs) => {
        setConnections(cs);
        if (!connectionId && cs.length === 1) setConnectionId(cs[0].id);
      })
      .catch((e) => setConnectionsError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    let alive = true;
    invokeAdjust<{ roleplays: RoleplayListItem[] }>({ op: "list", connectionId })
      .then((res) => alive && setList({ connectionId, roleplays: res.roleplays, error: null }))
      .catch((e) => alive && setList({ connectionId, roleplays: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [connectionId]);

  const current = list?.connectionId === connectionId ? list : null;
  const roleplays = current?.roleplays ?? null;
  const listError = current?.error ?? connectionsError;
  const loadingList = Boolean(connectionId) && !current;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!roleplays) return [];
    if (!q) return roleplays;
    return roleplays.filter((r) => r.training_name.toLowerCase().includes(q) || String(r.id) === q);
  }, [roleplays, query]);

  function openDirect() {
    const id = Number(directId.trim());
    if (!connectionId || !Number.isInteger(id) || id <= 0) return;
    router.push(`/ajustar/${connectionId}/${id}`);
  }

  return (
    <div>
      <PageHeader
        title="Calibração"
        description="Calibre um roleplay que já está na Perfecting: objeções, conhecimento, persona, regras. Cada ajuste vale a partir da próxima chamada."
      />

      <Card className="mb-6 flex flex-col gap-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionPicker
            connections={connections}
            value={connectionId}
            onChange={(k) => {
              setConnectionId(k);
              router.replace(k ? `/ajustar?connection=${k}` : "/ajustar");
            }}
            label="Conta"
            loadError={connectionsError}
            productionHint="Conta de produção: os ajustes chegam aos vendedores na próxima chamada."
          />
          <div className="flex items-end gap-2">
            <Input
              label="Abrir pelo id do roleplay"
              labelPlacement="outside"
              placeholder="ex.: 126"
              value={directId}
              onValueChange={setDirectId}
              onKeyDown={(e) => e.key === "Enter" && openDirect()}
              radius="sm"
              variant="bordered"
              inputMode="numeric"
              isDisabled={!connectionId}
              classNames={{ inputWrapper: "bg-white" }}
            />
            <Button onPress={openDirect} isDisabled={!connectionId || !directId.trim()}>
              Abrir
            </Button>
          </div>
        </div>
      </Card>

      {!connectionId ? (
        <EmptyState title="Escolha uma conta" description="A lista mostra todos os roleplays da organização dessa conta." />
      ) : loadingList ? (
        <LoadingView label="Listando os roleplays da conta…" />
      ) : listError ? (
        <EmptyState title="Não foi possível listar os roleplays" description={listError} />
      ) : (
        <Card className="p-4 sm:p-6">
          <Input
            aria-label="Buscar roleplay"
            placeholder="Buscar por nome ou id"
            value={query}
            onValueChange={setQuery}
            startContent={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
            radius="sm"
            variant="bordered"
            className="mb-4"
            classNames={{ inputWrapper: "bg-white" }}
          />
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum roleplay encontrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/ajustar/${connectionId}/${r.id}`}
                    className="flex flex-col gap-0.5 rounded-sm px-2 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-medium text-slate-700">{r.training_name}</span>
                    <span className="text-xs text-slate-400">
                      #{r.id}
                      {r.call_context_type_name ? ` · ${r.call_context_type_name}` : ""}
                      {r.role_play_status_name ? ` · ${r.role_play_status_name}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export default function AjustarPage() {
  return (
    <Suspense fallback={<LoadingView />}>
      <AjustarIndex />
    </Suspense>
  );
}
