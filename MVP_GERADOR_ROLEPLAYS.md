# MVP — Gerador externo de roleplays (React + Supabase)

> Complementa `INTEGRACAO_GERADOR_EXTERNO_ROLEPLAYS.md` (contrato da API Perfecting e modelo de
> produto). Este doc é o **plano de MVP**: escopo mínimo para entregar valor — importar texto →
> armazenar → exportar para a conta certa do cliente na Perfecting — com **React + Supabase** e
> **design igual ao da Perfecting**.

---

## 1. Objetivo do MVP

Provar a ponta-a-ponta com o **mínimo**: o CEO **cola/sobe um texto**, vira um rascunho de
roleplay armazenado, e com 1 clique **exporta para a conta (org) certa** na Perfecting (HML),
onde o roleplay aparece pronto (persona, empresa, critérios, agente de voz).

### Escopo — DENTRO do MVP
- Login no produto (Supabase Auth) — só uso interno (você/CEO).
- **Importar de múltiplas fontes** (requisito) — todas normalizam para **texto** (ver §4.5):
  - Colar texto
  - Upload de **PDF / DOCX**
  - **URL** (lê e extrai o conteúdo do site)
  - **Áudio** (upload ou gravação → **transcrição**)
  - **Google Drive** (conectar conta → escolher arquivos/pasta → importar)
- **Biblioteca**: listar rascunhos com status (`draft | exporting | exported | error`).
- **Conexões (multi-org)**: cadastrar credencial **superadmin** (1×) + listar orgs da Perfecting
  e escolher a org de destino no export.
- **Export** (Edge Function): superadmin login → `login_as_user` → cadeia `generate→create` (HML).
- Defaults globais (dificuldade, ambiente).

### Escopo — FORA do MVP (backlog, §11)
LLM leve de seed (auto offer_name + segmentação), reuso avançado de ofertas/contextos por conexão,
export em lote, edição rica do rascunho + preview, revisão antes de publicar, PROD.

---

## 2. Stack

| Camada | Escolha | Motivo |
|--------|---------|--------|
| Front | **Next.js (App Router) + React 19 + TypeScript** | Espelha a stack da Perfecting → reaproveita design/components. (Vite+React serve, mas Next facilita server actions/secrets.) |
| UI | **Tailwind CSS + HeroUI 2 + Heroicons** | Mesmo kit visual da Perfecting (ver §4). |
| Backend | **Supabase**: Postgres + Auth + **Edge Functions** (Deno) + Storage + **Vault** | DB, auth do produto, orquestração server-side e secrets. |
| Chamadas à Perfecting | **só de Edge Function** | Token superadmin nunca no browser. |

---

## 3. Arquitetura do MVP

```
 Browser (Next.js + HeroUI)                Supabase
 ────────────────────────────             ───────────────────────────────────────────
 Importar  ── upload/paste ──▶  Storage + Edge Fn `extract-text` ──▶ insert draft (Postgres)
 Biblioteca ── lista ──────────────────────────────────────────────▶ select drafts (RLS)
 Conexões  ── "listar orgs" ──▶ Edge Fn `list-orgs` ──▶ Perfecting /superadmin/organizations
 Export    ── "enviar" ───────▶ Edge Fn `export-roleplay` ──▶ Perfecting (login→impersonate→chain)
                                        └─ grava perfecting ids + status no draft
```

- Segredos (superadmin Perfecting, etc.) em **Vault / Function secrets**.
- Edge Functions acessam Postgres com **service role** (server-side).

---

## 4. Design (igual à Perfecting)

Replicar os tokens do `CLAUDE.md` da Perfecting. Resumo prático:

**Cores**
- Primária `#2E63CD` (hover `#3A71DB`). Botão primário pode usar o gradiente
  `linear-gradient(175.88deg, #3D75DD 6.17%, #2E63CD 93.83%)`.
- Neutros: família **slate** (textos `slate-600/700/800`, bordas `slate-200`).

**Raios (override do Tailwind — atenção!)**
```css
/* globals.css @theme inline */
--radius-sm: 8px;   /* rounded-sm = 8px (default de cards/botões/inputs/tabelas) */
--radius-md: 12px;  /* rounded-md */
--radius-lg: 16px;  /* rounded-lg (containers grandes) */
```
> Evitar `rounded` sem sufixo (Tailwind mapeia para 4px). Usar sempre `rounded-sm`/`-md`/`-lg`.

**Superfícies / cards (flat)**
```
bg-white rounded-sm border border-slate-200
```

**Layout**
- **Nunca** `space-y-*`. Empilhamento vertical = `flex flex-col gap-*`.
- Mobile-first; tap targets ≥ 44×44 no mobile; `min-h-[100dvh]`.

**Tabelas/listas** (espelhar a Perfecting)
- Outer: `bg-white rounded-sm border border-slate-200 overflow-hidden`.
- Header: `bg-slate-50 border-b border-slate-200`, texto `text-xs font-semibold uppercase tracking-wider text-slate-600`, `px-4 py-2.5`.
- Linhas: `px-4 py-4 h-14 text-sm font-medium text-slate-800`, sem border-b entre linhas.

**Componentes base a criar** (mesma linguagem): `Card`, `Button` (primary/secondary),
`BackButton` (44×44 outline), `StatusBadge` (draft/exported/error com tints sutis),
`LoadingView`/`LoadingTips` (spinner + frase amigável — reaproveitar a ideia da Perfecting),
`EmptyState`. Dropdowns/menus com cantos `rounded-sm` e hover slate sutil.

---

## 4.5. Fontes de importação (requisito do MVP)

Princípio: **toda fonte vira TEXTO** (→ `general_description`). Cada fonte cria um `source` e
preenche o rascunho. Tudo o que toca credenciais/serviços externos roda em **Edge Function**.

| Fonte | Como obter o texto | Implementação | Libs / serviço |
|-------|--------------------|---------------|----------------|
| **Colar texto** | Direto do textarea | Front → insert `source(type='paste')` | — |
| **PDF / DOCX** | Upload → Storage → extrair | Edge `extract-text` (§7.3) | `unpdf` (PDF), `mammoth` (DOCX) |
| **URL** | Fetch do HTML → limpar | Edge `ingest-url` (§7.4) | `@mozilla/readability` + `linkedom` (parse server-side) |
| **Áudio** | Upload/gravação → Storage → transcrever | Edge `transcribe-audio` (§7.5) | **OpenAI Whisper** (`/v1/audio/transcriptions`) ou equivalente |
| **Google Drive** | OAuth → escolher arquivo → baixar → extrair | Google Picker (front) + Edge `gdrive-*` (§7.6) | Google Identity Services + Drive API; reusa parsers de PDF/DOCX; Google Docs → export `text/plain` |

**Notas:**
- **Áudio (gravação):** usar `MediaRecorder` no browser → sobe o blob ao Storage → `transcribe-audio`.
  Definir limite de tamanho/duração; arquivos grandes → fila/async.
- **Google Drive (recomendado):** **per-user OAuth** (o CEO conecta a própria conta), escopo
  **`drive.readonly`**. Guardar `refresh_token` por usuário (tabela `google_accounts`, em Vault/cifrado).
  Seleção de arquivos via **Google Picker** (evita listar a Drive inteira). Google Docs/Sheets/Slides
  são exportados como texto pela Drive API; PDF/DOCX reusam o `extract-text`.
- Todas as fontes podem alimentar **um único rascunho** (ex.: site + um PDF) — concatenar os textos
  em `general_description` e guardar cada origem como `source` ligado ao draft.

---

## 5. Telas do MVP

**Shell:** header fixo + sidebar colapsável (igual Perfecting). Itens: Importar, Biblioteca,
Conexões, Config.

### 5.1 Importar
```
┌─────────────────────────────────────────────────────────────┐
│  Importar roleplay                                            │
│  [ Texto ] [ Arquivo ] [ URL ] [ Áudio ] [ Google Drive ]    │  ← abas de fonte (§4.5)
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  (conteúdo da aba: textarea / dropzone / campo URL /     │ │
│  │   gravar-ou-subir áudio / botão "Conectar e escolher")   │ │
│  └─────────────────────────────────────────────────────────┘ │
│  Texto extraído (preview, editável): [ .......................]│  ← resultado normalizado
│  Nome da oferta:   [ sugerido, editável ....................] │
│  Conta de destino: [ selecionar (Conexões) ▾ ] (opcional)    │
│  + Adicionar outra fonte a este rascunho                      │  ← concatena fontes
│                                        [ Salvar rascunho ]    │
└─────────────────────────────────────────────────────────────┘
```
Cada aba aciona a Edge Function da fonte (§7) → devolve **texto** → vai para o preview e sugere o
nome. "Salvar rascunho" insere o(s) `source(s)` + o `draft`. Estados de loading amigáveis durante
extração/transcrição (áudio/URL podem demorar).

### 5.2 Biblioteca
Tabela (estilo Perfecting): **Oferta | Conta destino | Status | Criado | Ações**.
Ações por linha: **Enviar para Perfecting** (abre seletor de conta se não definido) · Ver texto · Excluir.
Estados: `draft` (cinza) · `exporting` (azul, spinner) · `exported` (verde, link p/ Perfecting) · `error` (vermelho, com motivo).

### 5.3 Conexões
- Botão **"Sincronizar contas"** → `list-orgs` → grava/atualiza `connections`.
- Tabela: **Org | Ambiente | Usuário-alvo (gestor) | Status**. (No MVP, resolver `target_user_id`
  automaticamente pegando um gestor da org.)

### 5.4 Config
- Credencial **superadmin** da Perfecting (vai para Vault via Edge Fn; **não** salvar em coluna aberta).
- Ambiente alvo (HML/PROD — MVP usa HML).
- Defaults: dificuldade, tipo de chamada, `user_group_id`.

---

## 6. Modelo de dados (SQL DDL — subset do MVP)

```sql
-- Conexões = contas (orgs) Perfecting de destino
create table connections (
  id              uuid primary key default gen_random_uuid(),
  environment     text not null default 'hml',         -- 'hml' | 'prod'
  org_id          integer not null,                    -- target_organization_id
  org_name        text,
  target_user_id  integer,                              -- gestor da org (p/ login_as_user)
  default_user_group_id integer,
  created_at      timestamptz not null default now(),
  unique (environment, org_id)
);

-- Import bruto (multi-fonte)
create table sources (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid,                                    -- preenchido ao salvar o rascunho
  type          text not null,                           -- 'paste'|'file'|'url'|'audio'|'gdrive'
  raw_text      text,                                    -- texto normalizado da fonte
  file_path     text,                                    -- Storage (file/audio)
  source_url    text,                                    -- URL importada
  gdrive_file_id text,                                   -- id do arquivo no Drive
  meta          jsonb default '{}'::jsonb,               -- ex.: { filename, mime, duration }
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now()
);

-- OAuth do Google Drive por usuário (per-user). Tokens em Vault/cifrado.
create table google_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) default auth.uid(),
  google_email  text,
  refresh_token text,                                    -- guardar cifrado / Vault
  scope         text default 'https://www.googleapis.com/auth/drive.readonly',
  created_at    timestamptz not null default now(),
  unique (user_id)
);

-- Rascunho do roleplay (o seed que vai para a Perfecting)
create table roleplay_drafts (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references sources(id) on delete set null,
  connection_id uuid references connections(id),        -- destino (pode definir no export)
  offer_name    text not null,
  general_description text not null,                     -- carrega quase tudo
  context_notes text,
  scenario      jsonb not null default '{}'::jsonb,      -- { call_context_slug, difficulty, skill, objective }
  status        text not null default 'draft',           -- draft|exporting|exported|error
  -- ids resultantes na Perfecting (POR conexão — ver §6 do doc de integração)
  perfecting_offer_id      integer,
  perfecting_context_id    integer,
  perfecting_case_setup_id integer,
  elevenlabs_agent_id      text,
  error_detail  jsonb,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auditoria do export
create table export_jobs (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid references roleplay_drafts(id) on delete cascade,
  state       text not null default 'queued',            -- queued|running|done|error
  step        text,                                      -- offer|context|case_setup
  attempts    int not null default 0,
  error_detail jsonb,
  started_at  timestamptz,
  finished_at timestamptz
);

-- RLS: cada usuário vê o que criou (ajustar à sua regra de time)
alter table sources         enable row level security;
alter table roleplay_drafts enable row level security;
alter table export_jobs     enable row level security;
alter table connections     enable row level security;
alter table google_accounts enable row level security;
create policy "own_rows" on roleplay_drafts for all using (created_by = auth.uid());
create policy "own_rows" on sources         for all using (created_by = auth.uid());
create policy "own_rows" on google_accounts for all using (user_id = auth.uid());
-- connections/export_jobs: liberar para usuários autenticados internos conforme seu modelo de time.
```
> Credencial superadmin: usar **Supabase Vault** (`vault.create_secret`) ou secret da Edge
> Function (`supabase secrets set PERFECTING_SUPERADMIN_EMAIL=… PERFECTING_SUPERADMIN_PASSWORD=…`).
> **Não** criar coluna de senha em texto.

---

## 7. Edge Functions (Deno) — esqueletos

### 7.1 `export-roleplay` (o coração do MVP)
```ts
// supabase/functions/export-roleplay/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const API = Deno.env.get('PERFECTING_API_BASE')!;            // https://api-hml.perfecting.app
const SA_EMAIL = Deno.env.get('PERFECTING_SUPERADMIN_EMAIL')!;
const SA_PASS  = Deno.env.get('PERFECTING_SUPERADMIN_PASSWORD')!;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function postJson(url: string, token: string, body: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, detail: data?.detail ?? data };
  return data;
}

Deno.serve(async (req) => {
  const { draftId } = await req.json();
  const { data: draft } = await db.from('roleplay_drafts').select('*, connections(*)').eq('id', draftId).single();
  await db.from('roleplay_drafts').update({ status: 'exporting' }).eq('id', draftId);

  try {
    // 1) login superadmin
    const form = new URLSearchParams({ grant_type: 'password', username: SA_EMAIL, password: SA_PASS });
    const saRes = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
    }).then((r) => r.json());
    const saToken = String(saRes.access_token).replace(/^Bearer\s+/i, '');

    // 2) impersonar a org de destino → token escopado no cliente
    const imp = await postJson(`${API}/superadmin/login_as_user`, saToken, {
      target_user_id: draft.connections.target_user_id,
      target_organization_id: draft.connections.org_id,
      password_confirmation: SA_PASS,
    });
    const T = String(imp.access_token).replace(/^Bearer\s+/i, '');
    const RP = `${API}/role_plays`;

    // 3) Offer (pula se já criado nesta conexão)
    let offerId = draft.perfecting_offer_id;
    if (!offerId) {
      const og = await postJson(`${RP}/offer/generate`, T, {
        offer_name: draft.offer_name, general_description: draft.general_description, infer: true,
      });
      const offer = await postJson(`${RP}/offer/create`, T, { ...og });
      offerId = offer.id;
      await db.from('roleplay_drafts').update({ perfecting_offer_id: offerId }).eq('id', draftId);
    }

    // 4) Context
    let ctxId = draft.perfecting_context_id;
    if (!ctxId) {
      const cg = await postJson(`${RP}/context/generate`, T, {
        offer_id: offerId, aditional_instructions: draft.context_notes ?? '', infer: true,
      });
      const ctx = await postJson(`${RP}/context/create`, T, { ...cg, offer_id: offerId });
      ctxId = ctx.id;
      await db.from('roleplay_drafts').update({ perfecting_context_id: ctxId }).eq('id', draftId);
    }

    // 5) Case Setup
    const s = draft.scenario ?? {};
    const csg = await postJson(`${RP}/generate`, T, {
      context_id: ctxId,
      call_context_type_slug: s.call_context_slug || undefined,
      scenario_difficulty_level: s.difficulty || undefined,
      training_objective: s.objective || undefined,
      infer: true,
    });
    const payload = buildCaseSetupCreate(csg, ctxId, draft.connections.default_user_group_id ?? null);
    const cs = await postJson(`${RP}/case_setup/create?generate_case_prompt=true`, T, payload);

    await db.from('roleplay_drafts').update({
      status: 'exported', perfecting_case_setup_id: cs.id, elevenlabs_agent_id: cs.elevenlabs_agent_id ?? null,
    }).eq('id', draftId);
    return new Response(JSON.stringify({ ok: true, caseSetupId: cs.id }), { status: 200 });

  } catch (e) {
    await db.from('roleplay_drafts').update({ status: 'error', error_detail: e }).eq('id', draftId);
    return new Response(JSON.stringify({ ok: false, error: e }), { status: 500 });
  }
});

// Monta o body do case_setup/create a partir da saída do generate (fallbacks — ver §5.3b do doc de integração)
function buildCaseSetupCreate(g: any, contextId: number, userGroupId: number | null) {
  const voice = Number.isInteger(g.persona_voice_id) && g.persona_voice_id > 0 ? g.persona_voice_id : 1;
  return {
    context_id: contextId,
    call_context_type_slug: g.call_context_type_slug,
    training_name: g.training_name,
    training_description: g.training_description,
    training_keywords: g.training_keywords ?? '',
    training_objective: g.training_objective,
    training_targeted_sales_skills: g.training_targeted_sales_skills ?? [],
    scenario_difficulty_level: g.scenario_difficulty_level,
    buyer_agent_instructions: g.buyer_agent_instructions ?? [],
    buyer_prior_knowledge: g.buyer_prior_knowledge ?? [],
    buyer_agent_initial_tone_and_mood: g.buyer_agent_initial_tone_and_mood ?? '',
    buyer_agent_first_messages: g.buyer_agent_first_messages ?? [],
    buyer_agent_success_criteria: g.buyer_agent_success_criteria ?? [],
    salesperson_instructions: g.salesperson_instructions ?? [],
    salesperson_desired_tone_and_mood: g.salesperson_desired_tone_and_mood ?? '',
    salesperson_desired_behaviors: g.salesperson_desired_behaviors ?? [],
    salesperson_undesired_behaviors: g.salesperson_undesired_behaviors ?? [],
    salesperson_success_criteria: g.salesperson_success_criteria ?? [],
    salesperson_evaluation_rubric_criteria: g.salesperson_evaluation_rubric_criteria ?? [],
    company_profile: g.company_profile,
    persona_profile: g.persona_profile,
    persona_voice_id: voice,
    persona_voice_model_id: g.persona_voice_model_id ?? null,
    successful_sale_dialogues_examples: g.successful_sale_dialogues_examples ?? [],
    unsuccessful_sale_dialogues_examples: g.unsuccessful_sale_dialogues_examples ?? [],
    ...(userGroupId != null ? { user_group_id: userGroupId } : {}),
  };
}
```
> **Robustez (adicionar):** timeout alto por `fetch` (os `/generate` levam minutos) + 2–3 retries
> com backoff em 5xx/timeout; **não** retentar 422. Como os ids parciais são gravados, reexecutar
> o job **retoma** sem duplicar offer/context.

### 7.2 `list-orgs`
Recebe nada → login superadmin → `GET {API}/superadmin/organizations` → para cada org pega um
gestor em `GET {API}/superadmin/users?organization_id=<id>` → **upsert** em `connections`.

### 7.3 `extract-text` (PDF/DOCX)
Recebe arquivo (Storage path) → extrai texto (PDF: `unpdf`; DOCX: `mammoth`) → retorna texto +
sugestão de `offer_name` (nome do arquivo / 1ª linha). (Paste não precisa desta função.)

### 7.4 `ingest-url`
Recebe `{ url }` → `fetch` do HTML → extrair conteúdo principal (`@mozilla/readability` +
`linkedom`) → retorna texto limpo + título sugerido. Cuidar de timeout, sites que bloqueiam bot e
tamanho máximo.

### 7.5 `transcribe-audio`
Recebe arquivo de áudio (Storage path) → envia para transcrição (**OpenAI Whisper**
`POST https://api.openai.com/v1/audio/transcriptions`, `model=whisper-1`, idioma `pt`) → retorna
texto. Arquivos grandes/longos → processar assíncrono (status no `source.meta`).

### 7.6 `gdrive-auth` + `gdrive-import`
- **`gdrive-auth`**: troca o `code` do OAuth do Google por tokens; guarda `refresh_token` em
  `google_accounts` (cifrado/Vault). Escopo `drive.readonly`.
- **`gdrive-import`**: recebe `{ gdrive_file_id }` → usa o `refresh_token` para obter access token →
  baixa o arquivo via Drive API (`files.get?alt=media`); Google Docs/Slides/Sheets via
  `files.export` (`text/plain`) → manda PDF/DOCX para o `extract-text` → retorna texto.
- **Seleção de arquivos:** front usa **Google Picker** (com o token do usuário) e envia só o
  `gdrive_file_id` para a função (não lista a Drive inteira no servidor).

---

## 8. Secrets / env

```
# Edge Functions (supabase secrets set ...)
PERFECTING_API_BASE=https://api-hml.perfecting.app
PERFECTING_SUPERADMIN_EMAIL=...
PERFECTING_SUPERADMIN_PASSWORD=...
OPENAI_API_KEY=...               # transcrição de áudio (Whisper)
GOOGLE_OAUTH_CLIENT_ID=...       # Google Drive
GOOGLE_OAUTH_CLIENT_SECRET=...   # Google Drive
SUPABASE_URL=...                 # injetado
SUPABASE_SERVICE_ROLE_KEY=...    # injetado

# Front (.env.local)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=... # Google Identity Services + Picker
NEXT_PUBLIC_GOOGLE_API_KEY=...   # Google Picker
```

---

## 9. Milestones do MVP (ordem de execução)

1. **Fundação:** projeto Supabase (Auth + DDL §6 + Storage buckets `imports`/`audio`); secrets §8.
   Next.js + Tailwind/HeroUI com tokens da Perfecting (§4); shell (header+sidebar) e Supabase
   client/auth.
2. **Importar — fontes base:** abas **Texto + Arquivo (PDF/DOCX)** → `extract-text` → preview →
   cria `source` + `draft`. Tela Importar + Biblioteca (listagem).
3. **Importar — fontes ricas (requisito):** **URL** (`ingest-url`), **Áudio** (gravar/subir →
   `transcribe-audio`), **Google Drive** (OAuth `gdrive-auth` + Picker + `gdrive-import`).
   Suporte a múltiplas fontes por rascunho.
4. **Conexões:** `list-orgs` + tela Conexões (sincronizar contas, resolver gestor-alvo).
5. **Export (HML):** `export-roleplay` (login→impersonate→cadeia, com retries/idempotência) +
   botão "Enviar para Perfecting" com seletor de conta + status/realtime do `draft`.
6. **Polimento:** estados de erro/empty, defaults em Config, loading amigável.

---

## 10. Definition of Done (verificação)

1. Importar por **cada fonte** e confirmar que vira texto no preview: colar, PDF/DOCX, **URL**,
   **áudio** (gravar/subir → transcrição), **Google Drive** (conectar → escolher arquivo → importar).
   Salvar → vira `draft` (com 1+ `source`) e `offer_name` sugerido.
2. Sincronizar contas → `connections` populadas a partir de `GET /superadmin/organizations`.
3. "Enviar para Perfecting" escolhendo a conta → `draft.status` vai `exporting → exported`;
   `perfecting_case_setup_id` gravado.
4. Logar na Perfecting **HML naquela org** → o roleplay aparece em `/roleplays` e abre em
   `/roleplays/{id}/details` (persona/empresa/critérios; chamada inicia → agente de voz ok).
5. Confirmar que **caiu na org certa**.
6. Forçar erro (rede/token) → `status: error` com `error_detail`; reexecutar **retoma** sem duplicar.

---

## 11. Backlog pós-MVP

LLM leve de seed (auto offer_name + segmentação descrição/contexto + sugestão de cenário) ·
reuso avançado (biblioteca de ofertas/contextos por conexão) · export em lote · edição rica do
rascunho + preview do que será gerado · revisão antes de publicar · sincronizar **pasta inteira**
do Drive (além de arquivos avulsos) · PROD (após HML validado) · métricas de uso/tempo economizado.

---

## Referências
- `docs/INTEGRACAO_GERADOR_EXTERNO_ROLEPLAYS.md` — contrato completo da API Perfecting (offer/context/case_setup), auth superadmin + impersonação, fallbacks do payload.
- `CLAUDE.md` (Perfecting) — design system / tokens a espelhar.
