"use client";

import { useId, useMemo, useState } from "react";
import { Select, SelectItem } from "@heroui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { EnvironmentBadge } from "@/app/components/ui/environment-badge";
import {
  CONNECTION_SEARCH_THRESHOLD,
  connectionBlockReason,
  connectionLabel,
  connectionName,
  filterConnections,
  isProduction,
} from "@/app/lib/connection-label";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import type { Connection } from "@/app/lib/types";

/**
 * Seletor único da conta de destino. Mostra o ambiente como selo (Produção em
 * vermelho) na lista E no valor escolhido, desabilita conta sem gestor dizendo
 * o motivo, ganha busca quando a lista é longa e explica quando a leitura das
 * contas falhou — em vez de um seletor vazio.
 */
export function ConnectionPicker({
  connections,
  value,
  onChange,
  label = "Conta de destino",
  placeholder = "Escolha a conta",
  description,
  isRequired,
  isDisabled,
  loadError,
  onRetry,
  productionHint = "Conta de produção: o que for enviado aparece para o cliente.",
  className,
}: {
  /** null = ainda carregando. */
  connections: Connection[] | null;
  value: string;
  onChange: (connectionId: string) => void;
  label?: string;
  placeholder?: string;
  description?: React.ReactNode;
  isRequired?: boolean;
  isDisabled?: boolean;
  /** Motivo da falha ao listar as contas (ver `useConnections`). */
  loadError?: string | null;
  onRetry?: () => void;
  /** Aviso sob o seletor quando a conta escolhida é de produção; null esconde. */
  productionHint?: string | null;
  className?: string;
}) {
  const labelId = useId();
  const [query, setQuery] = useState("");
  const all = useMemo(() => connections ?? [], [connections]);
  const searchable = all.length > CONNECTION_SEARCH_THRESHOLD;
  const visible = useMemo(
    () => (searchable ? filterConnections(all, query, value) : all),
    [all, query, searchable, value],
  );
  const disabledKeys = useMemo(
    () => all.filter((c) => connectionBlockReason(c) != null).map((c) => c.id),
    [all],
  );
  const selected = all.find((c) => c.id === value) ?? null;
  const loading = connections === null;

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ""}`}>
      <span id={labelId} className="text-sm text-slate-700">
        {label}
        {isRequired && <span className="text-red-600"> *</span>}
      </span>

      {searchable && (
        <label className="flex min-h-[44px] items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 focus-within:border-slate-300 sm:min-h-[40px]">
          <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filtrar as ${all.length} contas por nome, id ou ambiente`}
            aria-label="Filtrar contas"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </label>
      )}

      <Select
        aria-labelledby={labelId}
        placeholder={
          loading
            ? "Carregando contas…"
            : all.length === 0
              ? "Nenhuma conta disponível"
              : searchable && visible.length === 0
                ? "Nenhuma conta com esse filtro"
                : placeholder
        }
        items={visible}
        selectedKeys={value ? [value] : []}
        disabledKeys={disabledKeys}
        onSelectionChange={(keys) => onChange(String(Array.from(keys)[0] ?? ""))}
        isDisabled={isDisabled || loading}
        radius="sm"
        variant="bordered"
        classNames={managerSelectClassNames}
        renderValue={() =>
          selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentBadge environment={selected.environment} />
              <span className="truncate text-sm text-slate-800">{connectionName(selected)}</span>
            </span>
          ) : null
        }
      >
        {(c) => (
          <SelectItem
            key={c.id}
            textValue={connectionLabel(c)}
            description={connectionBlockReason(c) ?? undefined}
            startContent={<EnvironmentBadge environment={c.environment} />}
            classNames={selectItemClassNames}
          >
            {connectionName(c)}
          </SelectItem>
        )}
      </Select>

      {loadError ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-red-700">
          <span>Não foi possível carregar as contas: {loadError}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2 hover:text-red-900 sm:min-h-0"
            >
              Tentar de novo
            </button>
          )}
        </p>
      ) : !loading && all.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nenhuma conta sincronizada. Abra Contas, no menu, e sincronize.
        </p>
      ) : null}

      {description && <div className="text-xs text-slate-500">{description}</div>}

      {productionHint && isProduction(selected) && (
        <p className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {productionHint}
        </p>
      )}
    </div>
  );
}
