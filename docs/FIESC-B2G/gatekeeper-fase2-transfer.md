# Gatekeeper → decisor na mesma ligação (Fase 2, backend)

Hoje o roleplay de gatekeeper (`scripts/fiesc-gatekeeper-hml.ts`) termina quando quem atende "transfere" ou marca a reunião: o agente chama `end_call` e o vendedor abre o roleplay do decisor (116, 117 ou 118) em seguida. Este documento reúne o que o `../backend` precisaria para que a transferência acontecesse de verdade, na mesma ligação, usando o `transfer_to_agent` da ElevenLabs. Levantado em 2026-09-26 no `origin/homolog`.

## Como é hoje
- **Um agente por case_setup.** `elevenlabs_create_agent.py:84-214` cria o agente com o prompt do momento da criação, `gemini-3.5-flash-lite` e só um `built_in_tools`: `end_call` (`:116-128`). Não há `transfer_to_agent`, workflow nem ferramenta customizada. Depois de criado, nada altera as ferramentas do agente.
- **O prompt de verdade vem do cliente, a cada ligação.** `GetAgentLink` (`s1_eleven_lab_integration.py:61-132`) monta o prompt com `AgentCallDataBuilder` (persona, nível, conhecimento, objeções) e o devolve ao front. O `small-mvp` (`app/lib/call-session-overrides.ts`) envia esse prompt como override de `agent.prompt.prompt`, `first_message` e `tts.voice_id`. O prompt gravado no agente quase nunca é usado.
- **O pós-call conhece um único roleplay.** O webhook entrega a transcrição. O `ref_token` (dynamic variable) leva `case_setup_id` e `tranning_session_id` (`s1_received_transcriptions.py:53-97`). Rubricas, critérios e feedback saem desse único case_setup.

## O que quebraria se ligássemos o `transfer_to_agent` hoje
1. **O agente de destino não recebe o override.** Ele rodaria o `case_prompt` gravado e a voz do agente, sem a persona escolhida, sem nível e sem conhecimento por persona. Para o 116/117/118 isso é o prompt antigo da criação.
2. **As falas se misturam.** `post_call_extractor.py:194-210` transforma toda fala de `agent` em `buyer` e ignora `agent_metadata.agent_id`. Gatekeeper e decisor viram um só comprador, e o evento da transferência (fala com `message=None`) é descartado.
3. **O feedback avalia só a triagem.** Tudo depois do S1 usa o `case_setup_id` do `ref_token`, e `TranningSessionModel.agent_id` guarda um único agente.
4. **Falta confirmar na ElevenLabs** se o `ref_token` sobrevive à transferência (como variável da conversa) e se o webhook vem do agente de origem.

## O que precisaria mudar
1. **Configuração do agente de gatekeeper:** acrescentar `transfer_to_agent` ao `built_in_tools`, com uma regra por persona apontando para o `elevenlabs_agent_id` do case_setup do decisor daquela conta. É preciso guardar esse vínculo no banco, por exemplo `cases_setup.handoff_case_setup_id` ou um mapa persona → case_setup. Uma alternativa é reaproveitar `PlaybookCallTypeModel.precedent_call_type_id`, que já liga etapas.
2. **Prompt do destino:** montar o prompt do decisor no `GetAgentLink` junto com o do gatekeeper e deixá-lo utilizável pelo agente de destino. Dois caminhos:
   - atualizar o prompt gravado do agente de destino antes da ligação: simples, mas corre risco de conflito entre sessões simultâneas;
   - fazer o prompt do destino ser `{{handoff_prompt}}` e passar o texto como dynamic variable da conversa: precisa confirmar o limite de tamanho da ElevenLabs.
3. **Pós-call:** separar as falas por `agent_metadata.agent_id` (gatekeeper × decisor) e guardar o momento da transferência.
4. **Feedback em duas partes:** a triagem avaliada pelas rubricas do gatekeeper e a conversa pelas rubricas do decisor, cada trecho com a sua transcrição. A sessão teria dois `case_setup_id` (ou uma sessão filha).
5. **Front (small-mvp):** mostrar a troca de interlocutor e as duas notas.

## Alternativa sem transferência
Um único agente com blocos de chamada do playbook (`parent_call_block_id`, `role_plays.py:3915-3964`): o mesmo prompt interpreta a triagem e depois o decisor. Resolve a transcrição e o feedback sem mexer no pós-call, mas a voz é a mesma nos dois papéis e o prompt fica grande. Serve como protótipo antes do `transfer_to_agent`.
