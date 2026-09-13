#!/usr/bin/env bash
# Gate de validação HML do modo "múltiplas personas por etapa do playbook",
# antes de confiar no pipeline novo em produção do Facility.
#
# Confirma, contra a API real:
#   1) GET /persona/list?context_id= — baseline
#   2) GET /persona/generate_batch/sse — nomes dos eventos, formato do wire,
#      e que batch_ready.persona_ids bate com o diff de /persona/list
#   3) GET /playbook_{id}/implementation/sse SEM persona_id — cada case_setup
#      criado fica com persona_id NULL (a asserção que decide a feature)
#   4) GET /persona/catalog?context_id= — o case_setup aparece sob TODAS as
#      personas do contexto, com has_specific_persona=false
#   5) PUT /case_setup_{id}?generate_case_prompt=false {persona_id} — faz
#      merge parcial (não apaga outros campos do case_setup)
#   6) o mesmo PUT SEM ?generate_case_prompt=false — documenta o erro esperado
#
# Uso:
#   PERFECTING_API_BASE=https://api-hml.perfecting.app \
#   SA_EMAIL=...@... SA_PASS=... TARGET_ORG_ID=123 TARGET_USER_ID=456 \
#   CONTEXT_ID=789 PLAYBOOK_ID=12 \
#   bash scripts/validate-personas-hml.sh
#
# CONTEXT_ID: um contexto já existente na org (reusa `resolveOfferContext`, ou
# pegue de um envio anterior pela Criação). PLAYBOOK_ID: um playbook com pelo
# menos 1 etapa — use `scripts/validate-playbook-hml.sh` para achar um.
#
# ⚠️ Este script CRIA DADOS REAIS na org de teste (personas, case_setups). Não
# rode contra uma org de cliente.
#
# Requer: curl, jq.
set -euo pipefail

API="${PERFECTING_API_BASE:-https://api-hml.perfecting.app}"
: "${SA_EMAIL:?defina SA_EMAIL}"
: "${SA_PASS:?defina SA_PASS}"
: "${TARGET_ORG_ID:?defina TARGET_ORG_ID}"
: "${TARGET_USER_ID:?defina TARGET_USER_ID}"
: "${CONTEXT_ID:?defina CONTEXT_ID (contexto já existente na org de teste)}"
: "${PLAYBOOK_ID:?defina PLAYBOOK_ID (playbook com pelo menos 1 etapa)}"

strip_bearer() { sed -E 's/^[Bb]earer[[:space:]]+//'; }

echo "1) login superadmin…"
SA_TOKEN=$(curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=$SA_EMAIL" \
  --data-urlencode "password=$SA_PASS" | jq -r '.access_token' | strip_bearer)
[ -n "$SA_TOKEN" ] && echo "   ok"

echo "2) login_as_user (org $TARGET_ORG_ID)…"
TOKEN=$(curl -sS -X POST "$API/superadmin/login_as_user" \
  -H "Authorization: Bearer $SA_TOKEN" -H "Content-Type: application/json" \
  -d "{\"target_user_id\":$TARGET_USER_ID,\"target_organization_id\":$TARGET_ORG_ID,\"password_confirmation\":\"$SA_PASS\"}" \
  | jq -r '.access_token' | strip_bearer)
[ -n "$TOKEN" ] && echo "   ok"

echo "3) baseline — persona/list?context_id=$CONTEXT_ID…"
BEFORE_PERSONAS=$(curl -sS "$API/role_plays/persona/list?context_id=$CONTEXT_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$BEFORE_PERSONAS" | jq -c '.[] | {id, name}'
BEFORE_COUNT=$(echo "$BEFORE_PERSONAS" | jq 'length')
echo "   personas hoje no contexto: $BEFORE_COUNT"

echo ""
echo "4) lote de personas — persona_quantity=3 (streaming, veja os eventos abaixo)…"
BATCH_RAW=$(curl -sS -N \
  -H "Authorization: Bearer $TOKEN" -H "Accept: text/event-stream" \
  "$API/role_plays/persona/generate_batch/sse?context_id=$CONTEXT_ID&persona_quantity=3")
echo "$BATCH_RAW"
echo ""
echo "   --- eventos vistos: ---"
echo "$BATCH_RAW" | grep -o '^event:.*' | sort -u || true

# batch_ready costuma vir no último bloco `data:` — pega o JSON depois do
# último `event: batch_ready`.
BATCH_READY_JSON=$(echo "$BATCH_RAW" | awk '/^event: batch_ready/{f=1} f && /^data:/{sub(/^data: ?/,""); print; f=0}')
if [ -z "$BATCH_READY_JSON" ]; then
  echo "   ⚠️  não achei um bloco 'event: batch_ready' — confira o dump acima manualmente."
  BATCH_PERSONA_IDS="[]"
else
  BATCH_PERSONA_IDS=$(echo "$BATCH_READY_JSON" | jq -c '.persona_ids // []')
  echo "   batch_ready.persona_ids = $BATCH_PERSONA_IDS"
fi

echo ""
echo "5) persona/list de novo — o diff deve bater com persona_ids do evento…"
AFTER_PERSONAS=$(curl -sS "$API/role_plays/persona/list?context_id=$CONTEXT_ID" \
  -H "Authorization: Bearer $TOKEN")
AFTER_COUNT=$(echo "$AFTER_PERSONAS" | jq 'length')
NEW_IDS=$(jq -n --argjson before "$BEFORE_PERSONAS" --argjson after "$AFTER_PERSONAS" \
  '($before | map(.id)) as $b | ($after | map(.id)) as $a | $a - $b')
echo "   personas novas (diff): $NEW_IDS"
if [ "$AFTER_COUNT" -lt $((BEFORE_COUNT + 3)) ]; then
  echo "   ⚠️  esperava pelo menos 3 personas novas; confira o dump do passo 4."
else
  echo "   ok — pelo menos 3 personas novas"
fi

echo ""
echo "6) implementation/sse SEM persona_id — asserção que decide a feature…"
BEFORE_CS=$(curl -sS "$API/role_plays/case_setup/context_$CONTEXT_ID/list" \
  -H "Authorization: Bearer $TOKEN" | jq -c '[.[].id]')
echo "   case_setups antes: $BEFORE_CS"

IMPL_RAW=$(curl -sS -N \
  -H "Authorization: Bearer $TOKEN" -H "Accept: text/event-stream" \
  "$API/role_plays/playbook_$PLAYBOOK_ID/implementation/sse?context_id=$CONTEXT_ID")
echo "$IMPL_RAW" | grep -o '^event:.*' | sort -u || true

AFTER_CS=$(curl -sS "$API/role_plays/case_setup/context_$CONTEXT_ID/list" \
  -H "Authorization: Bearer $TOKEN" | jq -c '[.[].id]')
NEW_CS=$(jq -n --argjson before "$BEFORE_CS" --argjson after "$AFTER_CS" '$after - $before')
echo "   case_setups criados: $NEW_CS"

FIRST_CS=$(echo "$NEW_CS" | jq -r '.[0] // empty')
if [ -z "$FIRST_CS" ]; then
  echo "   ⚠️  nenhum case_setup novo — não dá para checar persona_id/voz. Pare e investigue."
else
  echo ""
  echo "   6a) GET case_setup_$FIRST_CS — persona_id deve ser null, persona_voice_model_id não:"
  CS_DETAIL=$(curl -sS "$API/role_plays/case_setup_$FIRST_CS" -H "Authorization: Bearer $TOKEN")
  echo "$CS_DETAIL" | jq '{persona_id, persona_voice_model_id, training_name, playbook_call_type_id}'
  PID=$(echo "$CS_DETAIL" | jq -r '.persona_id')
  VOICE=$(echo "$CS_DETAIL" | jq -r '.persona_voice_model_id')
  if [ "$PID" = "null" ]; then echo "   ✅ persona_id é null (genérico)"; else echo "   ❌ persona_id veio preenchido: $PID — o pinning do plano precisa inverter (destravar em vez de travar)"; fi
  if [ "$VOICE" != "null" ] && [ -n "$VOICE" ]; then echo "   ✅ persona_voice_model_id preenchido (voz emprestada)"; else echo "   ❌ persona_voice_model_id vazio — a etapa pode ter sido pulada, confira results"; fi

  echo ""
  echo "   6b) GET persona/catalog?context_id=$CONTEXT_ID — case_setup deve aparecer sob TODAS as personas:"
  CATALOG=$(curl -sS "$API/role_plays/persona/catalog?context_id=$CONTEXT_ID" -H "Authorization: Bearer $TOKEN")
  echo "$CATALOG" | jq --argjson cs "$FIRST_CS" \
    '[.[].contexts[].personas[] | select(.case_setups[]?.id == $cs) | {persona_id: .id, has_specific_persona: (.case_setups[] | select(.id == $cs) | .has_specific_persona)}]'

  echo ""
  echo "   7) PUT case_setup_$FIRST_CS?generate_case_prompt=false — merge parcial?"
  P1=$(echo "$AFTER_PERSONAS" | jq -r '.[0].id')
  BEFORE_NAME=$(echo "$CS_DETAIL" | jq -r '.training_name')
  curl -sS -X PUT "$API/role_plays/case_setup_$FIRST_CS?generate_case_prompt=false" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"persona_id\": $P1}" | jq '{id, persona_id, training_name}'
  AFTER_PUT=$(curl -sS "$API/role_plays/case_setup_$FIRST_CS" -H "Authorization: Bearer $TOKEN")
  AFTER_NAME=$(echo "$AFTER_PUT" | jq -r '.training_name')
  if [ "$BEFORE_NAME" = "$AFTER_NAME" ]; then
    echo "   ✅ training_name intacto ($AFTER_NAME) — o PUT fez merge parcial"
  else
    echo "   ❌ training_name mudou ($BEFORE_NAME → $AFTER_NAME) — o PUT NÃO é merge parcial!"
  fi

  echo ""
  echo "   8) o mesmo PUT SEM ?generate_case_prompt=false (esperado: erro — documenta por que o param é obrigatório):"
  curl -sS -o /dev/null -w "   status: %{http_code}\n" -X PUT "$API/role_plays/case_setup_$FIRST_CS" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"persona_id\": $P1}" || true
fi

echo ""
echo "9) lote avulso (a ação 'Adicionar personas' da Biblioteca) — agora que JÁ"
echo "   existem case_setups no contexto, o lote deve rodar o estágio de conteúdo"
echo "   por persona (generating_step_knowledge) sobre eles…"
TOPUP_RAW=$(curl -sS -N \
  -H "Authorization: Bearer $TOKEN" -H "Accept: text/event-stream" \
  "$API/role_plays/persona/generate_batch/sse?context_id=$CONTEXT_ID&persona_quantity=1")
echo "$TOPUP_RAW" | grep -o '"stage":"[^"]*"' | sort -u || true
if echo "$TOPUP_RAW" | grep -q "step_knowledge"; then
  echo "   ✅ o lote faz backfill de conteúdo nos case_setups existentes"
else
  echo "   ⚠️  não vi estágio de step_knowledge — o backfill pode não estar acontecendo."
  echo "       Se confirmar, a ação 'Adicionar personas' cria a persona mas ela fica"
  echo "       sem conteúdo próprio nos roleplays já criados."
fi

echo ""
echo "✅ Validação concluída. Releia os ✅/❌ acima antes de confiar no pipeline novo."
echo "   Lembrete: este script deixou personas e case_setups novos na org $TARGET_ORG_ID."
