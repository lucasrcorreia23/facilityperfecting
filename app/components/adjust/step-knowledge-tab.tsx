"use client";

import { Accordion, AccordionItem, Textarea } from "@heroui/react";
import { StringListEditor } from "@/app/components/adjust/string-list-editor";
import { EmptyNote, KeyValueEditor, TabIntro, fieldClassNames } from "@/app/components/adjust/ui";
import type { AdjustStepItem } from "@/supabase/functions/_shared/roleplay-adjust-model";

/** Um lado do bloco: o que é do comprador ou o que é do vendedor. */
function Side({ who, children }: { who: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium text-slate-800">{who}</p>
      {children}
    </div>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm text-slate-700">{title}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Conhecimento por bloco do playbook (ou por etapa da metodologia). Cada bloco separa
 * o que é do comprador (o que sabe e o que revela) do que é do vendedor (a cola).
 */
export function StepKnowledgeTab({
  items,
  onChange,
}: {
  items: AdjustStepItem[];
  onChange: (next: AdjustStepItem[]) => void;
}) {
  const update = (index: number, patch: Partial<AdjustStepItem>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const copyToAll = (index: number, field: "facts" | "briefing") =>
    onChange(items.map((it) => ({ ...it, [field]: structuredClone(items[index][field]) })));

  const copyButton = (i: number, field: "facts" | "briefing") =>
    items.length > 1 ? (
      <button
        type="button"
        onClick={() => copyToAll(i, field)}
        className="self-start rounded-sm px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        Copiar para todos os blocos
      </button>
    ) : null;

  return (
    <div>
      <TabIntro>
        Cada bloco é um momento da conversa. &quot;Para o comprador&quot; muda o comportamento dele; &quot;Para o vendedor&quot; muda só a
        tela da chamada. Números e datas que não estão no material não devem aparecer aqui.
      </TabIntro>

      {items.length === 0 ? (
        <EmptyNote>Este roleplay não tem conhecimento por bloco.</EmptyNote>
      ) : (
        <Accordion selectionMode="multiple" variant="splitted" className="gap-2 px-0">
          {items.map((it, i) => (
            <AccordionItem
              key={it.id}
              aria-label={it.block_name ?? it.title}
              title={
                <span className="text-sm text-slate-800">
                  <span className="text-slate-400">{i + 1}.</span> {it.block_name ?? it.title}
                </span>
              }
              subtitle={
                <span className="text-xs text-slate-400">
                  {it.facts.length} fato(s) · {it.briefing.length} item(ns) de briefing
                </span>
              }
              classNames={{
                base: "rounded-sm border border-slate-200 shadow-none px-4",
                title: "text-sm",
                content: "pb-5 pt-1",
              }}
            >
              <div className="flex flex-col gap-6">
                <Side who="Para o comprador">
                  <Field
                    title="Ponto de partida"
                    hint={
                      i === 0
                        ? "O que ele já sabe ao começar a conversa (contexto, o que aconteceu antes)."
                        : "Só vale quando o treino começa por este bloco; na chamada inteira vale o do 1º bloco."
                    }
                  >
                    <Textarea
                      aria-label="Ponto de partida"
                      value={it.prior}
                      onValueChange={(v) => update(i, { prior: v })}
                      radius="sm"
                      variant="bordered"
                      minRows={3}
                      classNames={fieldClassNames}
                    />
                  </Field>
                  <Field title="Fatos que ele revela" hint="Assunto → o que ele conta quando o vendedor entrar no tema.">
                    <KeyValueEditor
                      items={it.facts}
                      onChange={(facts) => update(i, { facts })}
                      keyLabel="Assunto"
                      valueLabel="O que ele conta"
                      addLabel="Adicionar fato"
                      emptyText="Nenhum fato neste bloco."
                    />
                    {copyButton(i, "facts")}
                  </Field>
                  {(i === 0 || it.first_messages.length > 0) && (
                    <Field title="Falas de abertura" hint="Só usadas quando o treino começa por este bloco.">
                      <StringListEditor
                        label="Fala de abertura"
                        items={it.first_messages}
                        onChange={(first_messages) => update(i, { first_messages })}
                        addLabel="Adicionar fala"
                        emptyText="Sem fala própria neste bloco."
                      />
                    </Field>
                  )}
                </Side>

                <hr className="border-slate-100" />

                <Side who="Para o vendedor">
                  <Field title="Briefing" hint="O que já foi conversado e o que ele precisa saber antes deste momento.">
                    <KeyValueEditor
                      items={it.briefing}
                      onChange={(briefing) => update(i, { briefing })}
                      keyLabel="Assunto"
                      valueLabel="O que o vendedor precisa saber"
                      addLabel="Adicionar item de briefing"
                      emptyText="Nenhum item de briefing neste bloco."
                    />
                    {copyButton(i, "briefing")}
                  </Field>
                  <Field title="Orientação neste bloco" hint="Gerada pela IA da Perfecting: confira datas e números.">
                    <Textarea
                      aria-label="Orientação ao vendedor"
                      value={it.seller_instruction}
                      onValueChange={(v) => update(i, { seller_instruction: v })}
                      radius="sm"
                      variant="bordered"
                      minRows={4}
                      classNames={fieldClassNames}
                    />
                  </Field>
                </Side>
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
