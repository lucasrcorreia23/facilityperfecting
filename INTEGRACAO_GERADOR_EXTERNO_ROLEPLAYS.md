# Plano de produto — Gerador externo de roleplays ("importar texto → roleplay")

> **Para quem é este doc:** brief para o Claude Code **no outro projeto** (o produto externo).
> Objetivo de negócio: **eliminar o preenchimento manual de dezenas de campos**. O CEO importa
> textos (colar / arquivo / áudio / URL / Google Drive), a IA monta e **armazena os roleplays no
> próprio produto (Supabase)**, e depois ele **exporta/integra** para a plataforma Perfecting.

---

## 1. Visão e decisões alinhadas

**Dor atual:** criar um roleplay exige preencher muitos campos (oferta, persona, empresa,
diálogos, critérios…). Queremos reduzir isso a **"jogar um texto e pronto"**.

**Destravador técnico (confirmado no código da Perfecting):** a Perfecting **gera tudo a partir de
um texto mínimo** — basta `offer_name` + `general_description`; persona, empresa, diálogos,
critérios e voz são preenchidos pela IA dela (endpoints `/generate`). Ou seja, o campo que o CEO
realmente precisa fornecer é **um texto descritivo**. Todo o resto é gerado.

| Tema | Decisão |
|------|---------|
| Fluxo | **Duas fases:** (A) importar+gerar+**armazenar no produto externo (Supabase)**; (B) **exportar/integrar** para a Perfecting sob demanda. |
| Fontes de input | Colar texto, **upload de arquivo (PDF/DOCX)**, **áudio (transcrição)**, **URL do site**, **Google Drive** (arquivos/pasta). |
| Geração do conteúdo do roleplay | **IA da Perfecting** (endpoints `/generate`) no momento do export. |
| Backend do produto externo | **Supabase** (Postgres + Auth + Edge Functions + Storage + secrets). |
| Reuso | Modelo flexível: **biblioteca de ofertas/contextos reutilizáveis** + criação rápida de novos cenários. |
| Conta de destino | **Várias contas de clientes** (multi-org). Destino escolhido **manualmente no export**. |
| Auth na Perfecting | **Superadmin + impersonação** (`POST /superadmin/login_as_user`). Guarda **só a credencial do superadmin** (Vault), não a senha de cada cliente. Sem mudança no backend Perfecting. |

---

## 2. Como isso reduz o tempo do CEO (o "porquê")

1. **Um campo, não trinta.** Ele cola/importa um texto; `offer_name` e a descrição saem
   automaticamente dele. Os ~25 campos de persona/empresa/diálogo **nunca são digitados** — a IA
   da Perfecting gera no export.
2. **Importa de onde o material já está** (Google Drive, PDF, áudio de uma call) — zero
   redigitação.
3. **Reuso:** depois que uma oferta/contexto existe, criar um novo roleplay é só escolher um
   cenário (ou aceitar o default) — sem refazer nada.
4. **Lote:** importar vários documentos de uma vez → vários rascunhos → exportar em lote.
5. **Sem pressão de "acertar na hora":** tudo fica salvo no produto (Supabase); ele revisa/edita
   quando quiser e só então exporta para a Perfecting.

---

## 3. Arquitetura (visão macro)

```
            ┌──────────── PRODUTO EXTERNO (Supabase) ─────────────┐
 Fontes      │  Ingestão      Normalização     Armazenamento       │   Export (sob demanda)
 ───────     │  ─────────     ────────────     ─────────────       │   ──────────────────────
 Colar texto │  Edge Fn   →   extrai TEXTO  →  seed + rascunho  →   │→  Motor de export  →  API
 PDF/DOCX    │  (parsers)     (+ LLM leve     (Postgres)            │   (Edge Fn / worker)   Perfecting
 Áudio       │                p/ estruturar)                        │   generate→create ×3   (§7)
 URL         │                                                      │   grava ids de volta
 Google Drive│                                                      │
            └──────────────────────────────────────────────────────┘
```

- **Tudo server-side** (Edge Functions). O token de admin da Perfecting e chaves de LLM/Drive
  ficam em **Supabase secrets**, nunca no browser.
- A **geração pesada de conteúdo** é da Perfecting (no export). O LLM próprio do produto é
  **opcional e leve**, só para transformar o texto bruto em um bom *seed* (ver §5).

---

## 4. Ingestão multi-fonte → TEXTO (camada que mata o preenchimento)

Toda fonte é normalizada para **texto puro**, que vira o *seed* do roleplay.

| Fonte | Como obter o texto | Notas de implementação |
|-------|--------------------|------------------------|
| Colar texto | Direto | Caso base, sempre disponível. |
| Arquivo PDF/DOCX | Extrair texto | `pdf-parse`/`unpdf` (PDF), `mammoth` (DOCX). Rodar em Edge Function ou no upload. |
| Áudio | Transcrever | API de transcrição (ex.: OpenAI Whisper). Guardar transcrição como fonte. |
| URL do site | Fetch + extrair conteúdo | Buscar HTML e limpar (readability). Cuidar de timeouts/sites bloqueados. |
| **Google Drive** | OAuth Google + Drive API | OAuth do Google (escopo `drive.readonly`); listar/baixar arquivos de uma pasta; reaproveitar os parsers de PDF/DOCX/Google Docs (export como texto). É a fonte mais valiosa (o material já vive lá). |

> **MVP sugerido:** começar por **colar texto + upload de arquivo**. Adicionar **Google Drive**
> e **áudio** logo em seguida (maior esforço de OAuth/serviço). URL é fácil e pode entrar cedo.

---

## 5. Do TEXTO ao SEED (mínimo preenchimento, opcional LLM leve)

O *seed* é o pacote mínimo que alimenta a Perfecting. Objetivo: **derivar o seed do texto, sem
o CEO digitar nada** (ele só confere/edita se quiser).

Campos do seed (todos auto-deriváveis):
- `offer_name` — título da oferta. Auto: primeira linha / nome do arquivo / 1ª frase; ou via LLM leve.
- `general_description` — o texto importado (limpo). **É o campo que carrega quase tudo.**
- `context_notes` (opcional) — público-alvo/dores, se o texto trouxer; senão deixar a IA da Perfecting inferir.
- `scenario` (opcional) — `call_context_type_slug`, `scenario_difficulty_level`, skill/objetivo.
  Default global configurável (ex.: dificuldade "medium") → **zero escolha por roleplay**.

**Duas estratégias (configurável):**
- **Sem LLM próprio (mais simples):** `general_description` = texto inteiro; `offer_name` =
  heurística (nome do arquivo / 1ª linha). Funciona — a Perfecting infere o resto.
- **Com LLM leve (recomendado para "zero campos"):** uma chamada barata ao LLM só para (a) sugerir
  `offer_name`, (b) separar "descrição da oferta" de "notas de contexto", (c) sugerir cenário.
  **Não** gera persona/diálogo (isso é da Perfecting) — só organiza o seed. Mantém a Perfecting
  como fonte do conteúdo do roleplay.

---

## 6. Modelo de dados (Supabase / Postgres)

Tabelas sugeridas (nomes livres):

- **`sources`** — cada import bruto: `id`, `type` (paste|file|audio|url|gdrive), `raw_text`,
  `file_url` (Storage), `gdrive_file_id`, `created_by`, `created_at`.
- **`offers`** — biblioteca de ofertas: `id`, `offer_name`, `general_description`, `url`,
  `source_id`, **`perfecting_offer_id`** (null até exportar), `status`, timestamps.
- **`contexts`** — biblioteca de contextos: `id`, `offer_id` (FK local), `name`, `target_notes`,
  **`perfecting_context_id`** (null até exportar), timestamps.
- **`roleplay_drafts`** — o rascunho do roleplay: `id`, `offer_id`, `context_id` (FKs locais,
  podem reusar itens existentes), `scenario` (jsonb: call_context_slug, difficulty, skill,
  objective), `title`, `status` (`draft|exporting|exported|error`),
  **`perfecting_case_setup_id`** (null até exportar), **`elevenlabs_agent_id`**, timestamps.
- **`export_jobs`** — auditoria do export: `id`, `draft_id`, `state`, `step`
  (offer|context|case_setup), `attempts`, `error_detail` (jsonb), `started_at`, `finished_at`.
- **`perfecting_credentials`** — credencial do **superadmin** (única): `environment` (hml|prod),
  `email`, `password` (**em Supabase Vault/secret**, não em coluna aberta), `created_at`.
- **`connections`** — uma por **conta de cliente (org Perfecting)**: `id`, `environment`,
  `org_id` (= `target_organization_id`), `org_name`, `target_user_id` (um gestor da org, p/
  impersonar), `default_user_group_id` (opcional), `created_at`. Cada `roleplay_draft` aponta
  para uma `connection_id` (o destino escolhido no export). Popular via
  `GET /superadmin/organizations` + `GET /superadmin/users?organization_id=`.
- **`app_settings`** — defaults (dificuldade padrão, call context padrão, ambiente alvo, usar LLM
  leve sim/não, `user_group_id` padrão).

**Reuso (o ponto-chave do "misto"):** como `roleplay_drafts` referencia `offers`/`contexts`
locais que carregam `perfecting_offer_id`/`perfecting_context_id`, criar um **novo cenário sobre
oferta existente** = criar só um `roleplay_draft` novo apontando para a mesma offer/context. No
export, se a offer/context já tem id da Perfecting, **pula as etapas 1 e 2** e roda só a 3.

> **Multi-org:** `perfecting_offer_id`/`perfecting_context_id` são **por conta de destino** — uma
> oferta criada na org do cliente A **não existe** na org do cliente B. Guardar esses ids
> atrelados à `connection_id` (ex.: tabela ponte `offer_perfecting_ids(offer_id, connection_id,
> perfecting_offer_id)`), e só pular etapas quando o destino do export for a mesma conexão.

**Segurança:** RLS por usuário; credenciais da Perfecting e chaves (LLM, Drive, transcrição) em
**Supabase Vault / Function secrets**. Acesso à API Perfecting **só de Edge Function**.

---

## 7. Motor de export → Perfecting (fase B, sob demanda)

Aciona ao clicar "Enviar para Perfecting" (individual ou em lote). Roda numa **Edge Function /
worker** (idealmente assíncrono — os `/generate` levam segundos a minutos).

**Base URLs:** HML `https://api-hml.perfecting.app` · PROD `https://api.perfecting.app` ·
role plays em `{API_BASE}/role_plays` · superadmin em `{API_BASE}/superadmin`.

**Auth com mira na conta certa (superadmin → impersonação):**
```
1) POST {API_BASE}/auth/login      (Content-Type: application/x-www-form-urlencoded)
   grant_type=password&username=<email_superadmin>&password=<senha_superadmin>
   → access_token (com user_scope.superadmin = true)

2) (uma vez por conta, p/ montar `connections`)
   GET {API_BASE}/superadmin/organizations            → lista de orgs (escolher destino)
   GET {API_BASE}/superadmin/users?organization_id=ID  → pegar um target_user_id (gestor)

3) POST {API_BASE}/superadmin/login_as_user
   { "target_user_id": <id>, "target_organization_id": <org_id>,
     "password_confirmation": "<senha_superadmin>" }
   → access_token JÁ ESCOPADO na org de destino
```
Usar o **token impersonado** (passo 3) como `Authorization: Bearer <access_token>` em **toda a
cadeia generate/create** abaixo → o roleplay nasce **na conta do cliente**. (Remover prefixo
"Bearer " duplicado se vier no token.) Todos os endpoints `/superadmin/*` exigem o token
superadmin do passo 1.

> Se a org de destino não tiver um gestor para impersonar, criar um via
> `POST {API_BASE}/superadmin/users { name, email, password, organization_id, role_uuid: "manager" }`
> e usar o `id` retornado como `target_user_id`.

**Cadeia (cada entidade = generate + create; ids encadeiam):**

1. **Offer** — pular se `perfecting_offer_id` já existe; senão:
   - `POST {base}/role_plays/offer/generate` `{ offer_name, general_description, infer: true }`
   - `POST {base}/role_plays/offer/create` `{ ...saídaDoGenerate, url }` → guardar `id` em `perfecting_offer_id`.
   - Obrigatórios no create: `offer_name`, `general_description`.
2. **Context** — pular se `perfecting_context_id` já existe; senão:
   - `POST {base}/role_plays/context/generate` `{ offer_id, aditional_instructions: context_notes ?? '', infer: true }` *(typo "aditional" é da API)*
   - `POST {base}/role_plays/context/create` `{ ...saída, offer_id }` → `perfecting_context_id`.
   - Obrigatórios: `offer_id`, `name`, `target_description`.
3. **Case Setup** (sempre):
   - `POST {base}/role_plays/generate` `{ context_id, call_context_type_slug?, scenario_difficulty_level?, training_objective?, training_targeted_sales_skills?, aditional_instructions?, infer: true }` *(é `/generate`, não `/case_setup/generate`)*
   - `POST {base}/role_plays/case_setup/create?generate_case_prompt=true` com o payload montado
     a partir da saída do generate (passar quase 1:1, com fallbacks: arrays ausentes → `[]`,
     strings → `''`, `persona_voice_id` → `1`, `user_group_id` → `null` ou default).
   - **Response 201** → `{ id: <case_setup_id>, elevenlabs_agent_id }` = o roleplay. Gravar em
     `roleplay_drafts.perfecting_case_setup_id` + `elevenlabs_agent_id`, status `exported`.

**Valores válidos:** `GET {base}/role_plays/call_contexts` lista os `call_context_type_slug`
(pode omitir e deixar a IA escolher). `scenario_difficulty_level`: confirmar enum em HML
(ex.: easy|medium|hard).

**Robustez:** timeouts altos (minutos) nos `/generate`; 2–3 retries com backoff em 5xx/timeout;
**não** retentar 422 (validação). Idempotência: como os ids da Perfecting ficam salvos por etapa,
um job que falhar no meio **retoma** sem recriar offer/context. Logar `detail[]` do 422.

> Detalhe fino da montagem do payload do case setup (campos + fallbacks) está espelhado de
> `app/components/agents/create-wizard/wizard-container.tsx` (`handleReviewComplete`).

---

## 8. UX para mínimo preenchimento

- **Tela "Importar":** uma área única — arrastar arquivo / colar / gravar áudio / colar URL /
  "escolher do Google Drive". Ao soltar, o produto extrai o texto e mostra **1 linha editável**
  (nome da oferta sugerido). Botão **"Salvar rascunho"**. (Sem formulário de 30 campos.)
- **Tela "Biblioteca":** lista de rascunhos/ofertas com status (rascunho / exportado). Ações:
  "Enviar para Perfecting", "Novo cenário a partir desta oferta" (reuso), "Editar texto".
- **Escolher a conta no export:** o botão "Enviar para Perfecting" abre um seletor de **conta de
  destino** (lista de `connections` = orgs dos clientes, vinda de `GET /superadmin/organizations`).
  Pode pré-vincular o destino na importação (ex.: pasta do Drive do cliente X → conexão X).
- **Lote:** selecionar vários rascunhos → "Enviar para Perfecting" de uma vez (fila), todos para a
  conta escolhida.
- **Defaults globais** (em Config): dificuldade, tipo de chamada, ambiente (HML/PROD), grupo —
  para que cada roleplay individual não peça nada.

---

## 9. Roadmap incremental (sugestão de fases)

- **Fase 0 — Fundação:** projeto Supabase (Auth, Postgres, Storage, secrets); tabelas (§6);
  guardar credencial Perfecting (HML) em Vault; tela de login do produto.
- **Fase 1 — Import básico + armazenamento:** colar texto + upload PDF/DOCX → extrai texto →
  cria `source` + `offer` + `roleplay_draft` (com defaults). Sem export ainda.
- **Fase 2 — Conexões (multi-org) + motor de export (HML):** guardar credencial **superadmin**
  (Vault); listar orgs (`GET /superadmin/organizations`) → tabela `connections`; resolver
  `target_user_id` (gestor) por org. Edge Function que faz **superadmin login → `login_as_user` →
  cadeia §7** contra **HML**, com retries/idempotência; grava ids de volta; tela "Enviar para
  Perfecting" com **seletor de conta** + status do job.
- **Fase 3 — Reuso + lote:** biblioteca de ofertas/contextos (ids da Perfecting **por conexão**);
  "novo cenário sobre oferta existente"; export em lote.
- **Fase 4 — Mais fontes:** **Google Drive** (OAuth + Drive API), **áudio** (transcrição), **URL**.
- **Fase 5 — LLM leve de seed** (opcional): auto `offer_name`, segmentação descrição/contexto,
  sugestão de cenário.
- **Fase 6 — PROD:** validar tudo em HML, depois apontar credencial/ambiente para PROD.

---

## 10. Verificação (end-to-end)

1. Importar um PDF/colar texto → confere que vira `source` + `offer` + `roleplay_draft` no Supabase.
2. Conexões: `GET /superadmin/organizations` lista as orgs; escolher 1 como destino e resolver um
   `target_user_id` gestor (`GET /superadmin/users?organization_id=`).
3. "Enviar para Perfecting" (HML) escolhendo a conta → acompanhar `export_jobs`: superadmin login →
   `login_as_user` → offer→context→case_setup, ids gravados.
4. Abrir o app Perfecting (HML) **logado naquela org** em `/roleplays` → roleplay aparece, abre em
   `/roleplays/{id}/details` (persona/empresa/critérios preenchidos; chamada inicia → agente de voz ok).
5. **Conta certa:** confirmar que o roleplay caiu **na org escolhida** e não em outra.
6. Reuso: 2º cenário sobre a mesma oferta/mesma conta → export **pula** offer/context.
7. Falhas: derrubar a rede no meio do job → **retomada** sem duplicar offer/context.
8. Repetir contra **PROD** só após HML ok.

---

## 11. A confirmar (não bloqueia o início)

- **Saída exata de `POST /role_plays/generate`** (case setup): confirmar se traz os campos extras
  (buyer_prior_knowledge, salesperson_*, persona_voice_id…). Sem eles o create ainda funciona com
  fallbacks, mas o roleplay fica menos rico.
- **Enum de `scenario_difficulty_level`** e **slugs** reais de `call_contexts` (HML).
- **Expiração do token** (superadmin e o impersonado) — provavelmente relogar/impersonar a cada job.
- **`login_as_user`:** confirmar em HML que o token impersonado **cria role_plays** na org alvo
  (esperado, é token de usuário normal) e qual `target_user_id` usar (de preferência um **gestor**,
  para `user_group_id` e edições futuras funcionarem).
- **Semântica de `user_group_id: null`** (org-wide) no ambiente de vocês.
- **Google Drive:** confirmar contas/escopo OAuth permitidos pela org.
- **Custo/limite:** cada export = ~3 gerações de IA da Perfecting (+ eventual LLM/transcrição
  próprios) — enfileirar e limitar concorrência.

---

## Apêndice — Fonte da verdade do contrato (neste repositório Perfecting)

- `docs/api-role-plays.md` — endpoints de role plays.
- `app/lib/types/sta.ts` — shapes de request/response (Offer/Context/CaseSetup, persona, empresa, diálogos).
- `app/lib/sta-service.ts` — `generateOffer/createOffer/generateContext/createContext/generateCaseSetup/createCaseSetup`, `getCallContextValues`.
- `app/components/agents/create-wizard/wizard-container.tsx` — orquestração real (ordem, payload do create, retries/timeouts).
- `app/api/role_plays/**/route.ts` — paths upstream exatos. `app/api/login/route.ts` — login OAuth2 (form-urlencoded).
