"use client";

import { Input, Select, SelectItem, Textarea } from "@heroui/react";
import { managerSelectClassNames, selectItemClassNames } from "@/app/lib/select-classnames";
import { EmptyNote, FormSection, ItemCard, TabIntro, fieldClassNames } from "@/app/components/adjust/ui";
import type {
  AdjustPersona,
  AdjustState,
  RevealLevel,
} from "@/supabase/functions/_shared/roleplay-adjust-model";

const REVEAL_OPTIONS: Array<{ key: RevealLevel; label: string; hint: string }> = [
  { key: "surface", label: "Conta logo", hint: "fala disso no começo da conversa" },
  { key: "probed", label: "Se perguntarem", hint: "revela quando o vendedor entra no assunto" },
  { key: "hidden", label: "Escondida", hint: "só com pergunta direta e aprofundamento" },
];

/** Seletor "ligar mais um item do catálogo da oferta". */
function CatalogPicker({
  label,
  options,
  onPick,
}: {
  label: string;
  options: Array<{ id: number; label: string }>;
  onPick: (id: number) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Select
      aria-label={label}
      placeholder={label}
      selectedKeys={[]}
      onSelectionChange={(keys) => {
        const id = Number(Array.from(keys)[0]);
        if (Number.isFinite(id)) onPick(id);
      }}
      radius="sm"
      className="max-w-md"
      classNames={managerSelectClassNames}
    >
      {options.map((o) => (
        <SelectItem key={String(o.id)} textValue={o.label} classNames={selectItemClassNames}>
          {o.label}
        </SelectItem>
      ))}
    </Select>
  );
}

export function PersonaTab({
  value,
  onChange,
  catalog,
}: {
  value: AdjustPersona;
  onChange: (next: AdjustPersona) => void;
  catalog: AdjustState["catalog"];
}) {
  const pains = value.pains;
  const products = value.products;
  const freePains = (catalog.offer_pains ?? []).filter((p) => !pains?.some((x) => x.offer_pain_id === p.id));
  const freeProducts = (catalog.offer_products ?? []).filter(
    (p) => !products?.some((x) => x.offer_product_id === p.id),
  );

  return (
    <div>
      <TabIntro>
        Quem é o comprador, quais dores ele tem e quando revela cada uma. Vale para todos os roleplays desta persona.
      </TabIntro>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nome"
              labelPlacement="outside"
              value={value.name}
              onValueChange={(v) => onChange({ ...value, name: v })}
              radius="sm"
              variant="bordered"
              classNames={fieldClassNames}
            />
            <Input
              label="Cargo"
              labelPlacement="outside"
              value={value.job_title}
              onValueChange={(v) => onChange({ ...value, job_title: v })}
              radius="sm"
              variant="bordered"
              classNames={fieldClassNames}
            />
          </div>
          <Textarea
            label="Como ela pensa, fala e reage"
            labelPlacement="outside"
            description="O prompt da persona: história, o que sabe, tom de voz e como reage ao vendedor."
            value={value.persona_prompt}
            onValueChange={(v) => onChange({ ...value, persona_prompt: v })}
            radius="sm"
            variant="bordered"
            minRows={12}
            classNames={fieldClassNames}
          />
        </div>

        <FormSection
          title="Dores"
          hint="Quando o comprador revela cada dor e como ela aparece para esta pessoa. Não cite nome de produto."
        >
          {pains === null ? (
            <EmptyNote>Este ambiente não tem dores × portfólio: as dores ficam no prompt acima.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {pains.length === 0 && <EmptyNote>Nenhuma dor ligada a esta persona.</EmptyNote>}
              {pains.map((p, i) => (
                <ItemCard
                  key={p.offer_pain_id}
                  index={i + 1}
                  title={p.title}
                  badge={
                    <span className="shrink-0 text-xs text-slate-500">
                      {REVEAL_OPTIONS.find((r) => r.key === p.reveal_level)?.label}
                    </span>
                  }
                  onRemove={() => onChange({ ...value, pains: pains.filter((_, j) => j !== i) })}
                  removeLabel="Desligar dor"
                >
                  <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
                    <Select
                      label="Quando revela"
                      labelPlacement="outside-top"
                      selectedKeys={[p.reveal_level]}
                      onSelectionChange={(keys) => {
                        const k = Array.from(keys)[0] as RevealLevel | undefined;
                        if (k) onChange({ ...value, pains: pains.map((x, j) => (j === i ? { ...x, reveal_level: k } : x)) });
                      }}
                      radius="sm"
                      classNames={managerSelectClassNames}
                    >
                      {REVEAL_OPTIONS.map((r) => (
                        <SelectItem key={r.key} textValue={r.label} description={r.hint} classNames={selectItemClassNames}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </Select>
                    <Textarea
                      label="Como aparece para esta pessoa"
                      labelPlacement="outside"
                      placeholder="A fala dela sobre a dor e em que momento ela traz isso"
                      value={p.detail}
                      onValueChange={(v) =>
                        onChange({ ...value, pains: pains.map((x, j) => (j === i ? { ...x, detail: v } : x)) })
                      }
                      radius="sm"
                      variant="bordered"
                      minRows={3}
                      classNames={fieldClassNames}
                    />
                  </div>
                </ItemCard>
              ))}
              <CatalogPicker
                label="Ligar outra dor da oferta…"
                options={freePains.map((x) => ({ id: x.id, label: x.title }))}
                onPick={(id) => {
                  const found = freePains.find((x) => x.id === id);
                  if (found) {
                    onChange({
                      ...value,
                      pains: [...pains, { offer_pain_id: found.id, title: found.title, reveal_level: "probed", detail: "" }],
                    });
                  }
                }}
              />
            </div>
          )}
        </FormSection>

        {products !== null && (
          <FormSection
            title="Postura diante dos produtos"
            hint="Como esta pessoa vê cada tipo de solução. O comprador nunca recebe o nome do produto."
          >
            <div className="flex flex-col gap-4">
              {products.length === 0 && <EmptyNote>Nenhuma postura definida.</EmptyNote>}
              {products.map((p, i) => (
                <ItemCard
                  key={p.offer_product_id}
                  index={i + 1}
                  title={p.name}
                  onRemove={() => onChange({ ...value, products: products.filter((_, j) => j !== i) })}
                  removeLabel="Remover postura"
                >
                  <Textarea
                    label="Como ela vê este tipo de solução"
                    labelPlacement="outside"
                    value={p.stance}
                    onValueChange={(v) =>
                      onChange({ ...value, products: products.map((x, j) => (j === i ? { ...x, stance: v } : x)) })
                    }
                    radius="sm"
                    variant="bordered"
                    minRows={2}
                    classNames={fieldClassNames}
                  />
                </ItemCard>
              ))}
              <CatalogPicker
                label="Adicionar postura para outro produto…"
                options={freeProducts.map((x) => ({ id: x.id, label: x.name }))}
                onPick={(id) => {
                  const found = freeProducts.find((x) => x.id === id);
                  if (found) {
                    onChange({ ...value, products: [...products, { offer_product_id: found.id, name: found.name, stance: "" }] });
                  }
                }}
              />
            </div>
          </FormSection>
        )}
      </div>
    </div>
  );
}
