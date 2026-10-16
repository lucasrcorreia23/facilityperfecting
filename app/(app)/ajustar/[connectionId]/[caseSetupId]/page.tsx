"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Tab, Tabs, addToast } from "@heroui/react";
import { ArrowTopRightOnSquareIcon, ArrowPathIcon, ChevronDownIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { MENU_CONTENT_CLASSES, MENU_ITEM_HOVER } from "@/app/lib/menu-hover-classes";
import { PageHeader } from "@/app/components/ui/page-header";
import { Button } from "@/app/components/ui/button";
import { LoadingView } from "@/app/components/ui/loading-view";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ConfirmDialog, type ConfirmConfig } from "@/app/components/ui/confirm-dialog";
import { TabIntro } from "@/app/components/adjust/ui";
import { describeImpact } from "@/app/components/adjust/impact";
import { ObjectionListEditor } from "@/app/components/content/objection-list-editor";
import { GuardrailListEditor } from "@/app/components/content/guardrail-list-editor";
import { StringListEditor } from "@/app/components/adjust/string-list-editor";
import { GeneralTab } from "@/app/components/adjust/general-tab";
import { StepKnowledgeTab } from "@/app/components/adjust/step-knowledge-tab";
import { PersonaTab } from "@/app/components/adjust/persona-tab";
import { PromptTab } from "@/app/components/adjust/prompt-tab";
import { HistoryTab, SECTION_LABELS } from "@/app/components/adjust/history-tab";
import { AdjustRequestError, invokeAdjust } from "@/app/lib/db";
import { perfectingRoleplayUrl } from "@/app/lib/perfecting-app";
import {
  type AdjustObjection,
  type AdjustSection,
  type AdjustSections,
  type AdjustState,
  stableHash,
} from "@/supabase/functions/_shared/roleplay-adjust-model";

interface ConnectionMeta {
  environment: string;
  org_id: number;
  org_name: string | null;
}

type TabKey = AdjustSection | "prompt" | "history";

/**
 * Ajustar um roleplay que já está na Perfecting. Cada aba salva sozinha; o que é
 * salvo vale a partir da próxima chamada (a Perfecting remonta o prompt na hora).
 */
export default function AjustarRoleplayPage() {
  const params = useParams<{ connectionId: string; caseSetupId: string }>();
  const connectionId = params.connectionId;
  const caseSetupId = Number(params.caseSetupId);

  const [state, setState] = useState<AdjustState | null>(null);
  const [drafts, setDrafts] = useState<AdjustSections | null>(null);
  const [meta, setMeta] = useState<ConnectionMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("general");
  const [saving, setSaving] = useState<AdjustSection | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const isProd = meta?.environment === "prod";

  const load = useCallback(async () => {
    try {
      const res = await invokeAdjust<{ state: AdjustState; connection: ConnectionMeta }>({
        op: "load",
        connectionId,
        caseSetupId,
      });
      setLoadError(null);
      setState(res.state);
      setDrafts(structuredClone(res.state.sections));
      setMeta(res.connection);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [connectionId, caseSetupId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const dirty = useMemo(() => {
    const out = new Set<AdjustSection>();
    if (!state || !drafts) return out;
    for (const s of Object.keys(state.hashes) as AdjustSection[]) {
      if (stableHash(drafts[s]) !== state.hashes[s]) out.add(s);
    }
    return out;
  }, [state, drafts]);

  // Sair da página com alteração não salva perde o trabalho: avisa.
  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function setSection<K extends AdjustSection>(section: K, value: AdjustSections[K]) {
    setDrafts((d) => (d ? { ...d, [section]: value } : d));
  }

  function discard(section: AdjustSection) {
    if (!state) return;
    setSection(section, structuredClone(state.sections[section]));
  }

  async function doSave(section: AdjustSection) {
    if (!state || !drafts) return;
    setSaving(section);
    try {
      const res = await invokeAdjust<{ state: AdjustState; summary: string[] }>({
        op: "save",
        connectionId,
        caseSetupId,
        section,
        value: drafts[section],
        baseHash: state.hashes[section],
        confirmProd: isProd,
      });
      setState(res.state);
      // Só a aba salva volta para o que está na Perfecting; as outras mantêm o rascunho.
      setDrafts((d) => (d ? { ...d, [section]: structuredClone(res.state.sections[section]) } : d));
      setHistoryKey((k) => k + 1);
      addToast({
        title: res.summary.length > 0 ? "Salvo — vale a partir da próxima chamada" : "Nada mudou",
        description: res.summary.join(" · ") || undefined,
        color: res.summary.length > 0 ? "success" : "default",
      });
    } catch (e) {
      const err = e as AdjustRequestError;
      addToast({
        title: err.status === 409 ? "Alguém mudou este trecho enquanto você editava" : "Não foi possível salvar",
        description: err.status === 409 ? "Recarregue para ver a versão atual (seu rascunho será descartado)." : err.message,
        color: "danger",
      });
    } finally {
      setSaving(null);
    }
  }

  function save(section: AdjustSection) {
    if (!state || !drafts) return;
    const impact = describeImpact(section, state.sections, drafts, state);
    if (!impact.critical && !isProd) {
      void doSave(section);
      return;
    }
    setConfirm({
      title: isProd ? "Salvar em produção?" : "Confirme o impacto desta mudança",
      message: (
        <div className="flex flex-col gap-3">
          {isProd && (
            <p>
              Esta conta é de <b>produção</b> ({meta?.org_name ?? `org ${meta?.org_id}`}): os vendedores sentem a
              mudança na próxima chamada.
            </p>
          )}
          {impact.items.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              {impact.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">O valor anterior fica no Histórico, para desfazer à mão.</p>
        </div>
      ),
      confirmLabel: "Salvar mesmo assim",
      onConfirm: () => void doSave(section),
    });
  }

  async function doRegenerate(what: "behavior" | "next_stage_summary") {
    setRegenerating(what);
    try {
      const res = await invokeAdjust<{ state: AdjustState; summary: string[] }>({
        op: "regenerate",
        connectionId,
        caseSetupId,
        what,
        confirmProd: isProd,
      });
      setState(res.state);
      setHistoryKey((k) => k + 1);
      addToast({ title: "Feito", description: res.summary.join(" · "), color: "success" });
    } catch (e) {
      addToast({ title: "Não foi possível regenerar", description: (e as Error).message, color: "danger" });
    } finally {
      setRegenerating(null);
    }
  }

  function regenerate(what: "behavior" | "next_stage_summary") {
    setConfirm({
      title: what === "behavior" ? "Regenerar o comportamento com IA?" : "Atualizar o resumo da etapa seguinte?",
      message:
        what === "behavior" ? (
          <p>
            A IA da Perfecting reescreve o &quot;# Comportamento&quot; do comprador a partir dos blocos e do tipo de
            chamada. Pode desfazer ajustes finos que estavam lá. Use depois de mudar bastante o conteúdo.
          </p>
        ) : (
          <p>
            A IA reescreve o resumo da chamada anterior que o vendedor vê na etapa seguinte, a partir do que este
            roleplay tem agora.
          </p>
        ),
      confirmLabel: "Regenerar",
      onConfirm: () => void doRegenerate(what),
    });
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Calibrar roleplay" backHref="/ajustar" />
        <EmptyState
          title="Não foi possível abrir este roleplay"
          description={loadError}
          action={<Button onPress={() => void load()}>Tentar de novo</Button>}
        />
      </div>
    );
  }
  if (!state || !drafts || !meta) return <LoadingView label="Lendo o roleplay na Perfecting…" />;

  const nextStage = state.siblings.find((s) => s.is_next_stage);
  const objectionTypes = state.catalog.objection_types;

  const footer = (section: AdjustSection) => (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center justify-end gap-3 rounded-b-sm border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {dirty.has(section) ? (
        <>
          <span className="text-sm text-amber-700">Alterações não salvas</span>
          <Button variant="link" onPress={() => discard(section)}>
            Descartar
          </Button>
        </>
      ) : (
        <span className="text-sm text-slate-400">Tudo salvo</span>
      )}
      <Button onPress={() => save(section)} isLoading={saving === section} isDisabled={!dirty.has(section)}>
        Salvar
      </Button>
    </div>
  );

  const tabTitle = (key: AdjustSection) => (
    <span>
      {SECTION_LABELS[key]}
      {dirty.has(key) && <span className="ml-1 text-[var(--primary)]">•</span>}
    </span>
  );

  return (
    <div>
      <PageHeader
        title={state.case_setup.training_name || `Roleplay ${caseSetupId}`}
        description={`Roleplay ${caseSetupId} · ${meta.org_name ?? `org ${meta.org_id}`}${
          state.playbook ? ` · ${state.playbook.call_type_name}` : ""
        }`}
        backHref={`/ajustar?connection=${connectionId}`}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <Dropdown classNames={{ content: MENU_CONTENT_CLASSES }} placement="bottom-end">
              <DropdownTrigger>
                <Button
                  variant="secondary"
                  startContent={<SparklesIcon className="w-4 h-4" />}
                  endContent={<ChevronDownIcon className="w-3.5 h-3.5" />}
                  isLoading={regenerating != null}
                >
                  Regenerar com IA
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Regenerar com IA"
                disabledKeys={nextStage ? [] : ["next_stage_summary"]}
                onAction={(k) => regenerate(String(k) as "behavior" | "next_stage_summary")}
              >
                <DropdownItem
                  key="behavior"
                  className={MENU_ITEM_HOVER}
                  description="Reescreve o comportamento do comprador"
                >
                  Comportamento
                </DropdownItem>
                <DropdownItem
                  key="next_stage_summary"
                  className={MENU_ITEM_HOVER}
                  description={nextStage ? "O resumo que a etapa seguinte recebe" : "Sem etapa seguinte"}
                >
                  Resumo da etapa seguinte
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <Button
              variant="secondary"
              isIconOnly
              aria-label="Recarregar"
              title="Recarregar da Perfecting"
              onPress={() => {
                if (dirty.size > 0) {
                  setConfirm({
                    title: "Recarregar e descartar o que não foi salvo?",
                    message: <p>Há alterações não salvas em: {[...dirty].map((s) => SECTION_LABELS[s]).join(", ")}.</p>,
                    confirmLabel: "Recarregar",
                    onConfirm: () => void load(),
                  });
                } else void load();
              }}
            >
              <ArrowPathIcon className="w-4 h-4" />
            </Button>
            <Button
              as="a"
              href={perfectingRoleplayUrl(meta.environment, caseSetupId)}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              isIconOnly
              aria-label="Abrir na Perfecting"
              title="Abrir na Perfecting"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {isProd && (
        <div className="mb-4 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          Produção: o que for salvo aqui chega aos vendedores na próxima chamada.
        </div>
      )}
      {state.warnings.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1 text-sm text-amber-700">
          {state.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {(state.last_call_info || state.siblings.length > 0) && (
        <div className="mb-6 flex max-w-4xl flex-col gap-1 text-sm text-slate-500">
          {state.last_call_info && (
            <p>
              <span className="text-slate-700">{state.last_call_info.title}:</span> {state.last_call_info.content}
            </p>
          )}
          {state.siblings.length > 0 && (
            <p>
              <span className="text-slate-700">Mesmo contexto:</span>{" "}
              {state.siblings.map((s, i) => (
                <span key={s.case_setup_id}>
                  {i > 0 && " · "}
                  <a className="underline hover:text-slate-700" href={`/ajustar/${connectionId}/${s.case_setup_id}`}>
                    {s.training_name}
                  </a>
                  {s.is_next_stage ? " (etapa seguinte)" : ""}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

        <Tabs
          selectedKey={tab}
          onSelectionChange={(k) => setTab(String(k) as TabKey)}
          variant="underlined"
          classNames={{
            base: "w-full overflow-x-auto",
            tabList: "w-full gap-6 border-b border-slate-200 p-0",
            tab: "w-auto shrink-0 px-0 h-10",
            cursor: "w-full",
            panel: "mt-4 rounded-sm border border-slate-200 bg-white px-4 pt-6 sm:px-6",
          }}
          aria-label="Abas do ajuste"
        >
          <Tab key="general" title={tabTitle("general")}>
            <GeneralTab value={drafts.general} onChange={(v) => setSection("general", v)} />
            {footer("general")}
          </Tab>

          <Tab key="prior_knowledge" title={tabTitle("prior_knowledge")}>
            <TabIntro>
              A cola que o vendedor vê antes e durante a chamada. Não muda o comprador: o que ele sabe ao começar fica no
              ponto de partida do 1º bloco, em Conhecimento por bloco.
            </TabIntro>
            <StringListEditor
              label="Item"
              items={drafts.prior_knowledge}
              onChange={(v) => setSection("prior_knowledge", v)}
              addLabel="Adicionar item"
              emptyText="Nada definido: o vendedor não vê cola nesta chamada."
            />
            {footer("prior_knowledge")}
          </Tab>

          <Tab key="step_knowledge" title={tabTitle("step_knowledge")}>
            <StepKnowledgeTab items={drafts.step_knowledge} onChange={(v) => setSection("step_knowledge", v)} />
            {footer("step_knowledge")}
          </Tab>

          <Tab key="objections" title={tabTitle("objections")}>
            <TabIntro>
              O comprador levanta as objeções na hora oportuna e cede quando o vendedor faz o que está em &quot;Ele cede
              quando&quot;. A Perfecting usa no máximo três por conversa: mais que isso, as últimas não aparecem.
            </TabIntro>
            {drafts.objections.length > 3 && (
              <p className="mb-4 text-sm text-amber-700">
                Há {drafts.objections.length} objeções: só três entram na conversa. Deixe as três mais importantes.
              </p>
            )}
            <div>
              <ObjectionListEditor<AdjustObjection>
                layout="card"
                items={drafts.objections}
                onChange={(v) => setSection("objections", v)}
                typeOptions={objectionTypes}
                showDetails
                badge={(o) => (o.scope === "context" ? "vale para o contexto" : null)}
                newItem={() => ({
                  key: null,
                  scope: "case_setup",
                  titulo: "",
                  tipo: objectionTypes[0]?.slug ?? "",
                  fala_exemplo: "",
                  detalhes: "",
                  ceder_se: "",
                  levels: [],
                })}
              />
            </div>
            {footer("objections")}
          </Tab>

          <Tab key="persona" title={tabTitle("persona")} isDisabled={!drafts.persona}>
            {drafts.persona && (
              <>
                <PersonaTab
                  value={drafts.persona}
                  onChange={(v) => setSection("persona", v)}
                  catalog={state.catalog}
                />
                {footer("persona")}
              </>
            )}
          </Tab>

          <Tab key="guardrails" title={tabTitle("guardrails")}>
            <TabIntro>
              Regras que o comprador segue em toda a conversa, como &quot;não inventa números&quot;. Valem para todos os
              roleplays do contexto.
            </TabIntro>
            <div>
              <GuardrailListEditor
                items={drafts.guardrails}
                onChange={(v) => setSection("guardrails", v)}
                editableNames
                newItem={() => ({ id: null, nome: "", instrucao: "" })}
              />
            </div>
            {footer("guardrails")}
          </Tab>

          <Tab key="prompt" title="Prompt montado">
            <TabIntro>
              O texto que o comprador recebe hoje, montado pela Perfecting do mesmo jeito que na chamada. Só leitura.
            </TabIntro>
            <PromptTab connectionId={connectionId} caseSetupId={caseSetupId} />
          </Tab>

          <Tab key="history" title="Histórico">
            <TabIntro>Quem mudou o quê e quando, com o antes e o depois para desfazer à mão.</TabIntro>
            <HistoryTab connectionId={connectionId} caseSetupId={caseSetupId} refreshKey={historyKey} />
          </Tab>
        </Tabs>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
