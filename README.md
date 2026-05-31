# Gerador externo de roleplays — Perfecting

Produto interno que **elimina o preenchimento manual** de roleplays na Perfecting.
O CEO importa um texto (colar ou PDF/DOCX), o app armazena um rascunho e, com 1 clique,
**exporta para a conta (org) certa do cliente** na Perfecting — onde a IA da Perfecting
gera persona, empresa, diálogos, critérios e voz a partir de um texto mínimo.

Stack: **Next.js (App Router) + React 19 + Tailwind 4 + HeroUI 2** · **Supabase**
(Postgres + Auth + Edge Functions + Storage). Design espelha os tokens da Perfecting.

> Escopo v1: import por **texto + PDF/DOCX**, **reuso** de ofertas/contextos (ids por conexão),
> **export em lote**, ambiente **HML**. URL/áudio/Google Drive e PROD ficam no roadmap.

---

## 1. Pré-requisitos

- Node 20+, npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Credencial **superadmin** da Perfecting (HML)
- `curl` + `jq` para o gate de validação (Fase 0)

## 2. Fase 0 — Validar o contrato em HML (antes de tudo)

Prova a cadeia `login → impersonação → offer → context → case_setup` direto na API,
sem depender do app. **Não pule** — é o que dá confiança no motor de export.

```bash
PERFECTING_API_BASE=https://api-hml.perfecting.app \
SA_EMAIL=superadmin@... SA_PASS=... \
TARGET_ORG_ID=<org de teste> TARGET_USER_ID=<gestor da org> \
bash scripts/validate-hml.sh
```

Depois confirme em `app-hml.perfecting.app` (logado naquela org) que o roleplay aparece em
`/roleplays` e abre em `/roleplays/<id>/details`. Anote o enum real de
`scenario_difficulty_level` e os slugs de `call_contexts`.

## 3. Provisionar o Supabase

```bash
supabase login
supabase link --project-ref <project-ref>     # cria o projeto antes, no dashboard
supabase db push                              # aplica supabase/migrations/*.sql
```

Isso cria tabelas, RLS, o bucket `imports` e o usuário interno (Auth). Crie o login do CEO no
dashboard (Authentication → Users) — o signup está desativado (uso interno).

### Secrets das Edge Functions (NUNCA no browser)

```bash
supabase secrets set \
  PERFECTING_API_BASE=https://api-hml.perfecting.app \
  PERFECTING_SUPERADMIN_EMAIL=... \
  PERFECTING_SUPERADMIN_PASSWORD=...
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente.
```

### Deploy das funções

```bash
supabase functions deploy extract-text
supabase functions deploy list-orgs
supabase functions deploy export-roleplay
```

## 4. Front local

```bash
cp .env.local.example .env.local   # preencha NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npm install
npm run dev                        # http://localhost:3000
```

## 5. Fluxo do produto

1. **Conexões** → "Sincronizar contas" (`list-orgs`) popula as orgs da Perfecting.
2. **Importar** → cole texto ou suba PDF/DOCX (`extract-text`) → "Salvar rascunho".
3. **Biblioteca** → "Enviar para Perfecting" (individual ou lote) escolhendo a conta.
   O status muda `rascunho → enviando → exportado` (realtime). Exportado vira link para a Perfecting.
4. **Novo cenário desta oferta** reusa a oferta; no export para a mesma conta, oferta/contexto
   são **pulados** (pontes `*_perfecting_ids`).

## 6. Verificação end-to-end

Ver a seção "Verificação" do plano. Resumo: importar → sincronizar → enviar → conferir na
Perfecting (org certa) → reuso pula offer/context → falha no meio retoma sem duplicar.

---

## Arquitetura & contrato

- `supabase/functions/_shared/perfecting.ts` — **cliente da API Perfecting com o contrato
  verificado** (login form-urlencoded + strip Bearer; `offer_description` no generate vs
  `general_description` no create; `call_context_type_id` resolvido de `/role_plays/call_contexts`;
  case setup em `/role_plays/generate` + `/role_plays/case_setup/create` sem query; retries/backoff,
  sem retry em 422).
- `supabase/functions/export-roleplay/` — orquestra a cadeia com reuso por conexão e idempotência.
- `app/(app)/*` — telas Importar / Biblioteca / Conexões / Config.
- `app/lib/db.ts` — acesso a dados (RLS) + invocação das Edge Functions.

Fonte da verdade do contrato: código real da Perfecting em `../small-mvp` (ver plano).
