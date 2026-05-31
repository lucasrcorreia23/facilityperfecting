#!/usr/bin/env bash
# Fase 0 — Gate de validação HML do contrato Perfecting (antes de ligar o export).
# Valida: login superadmin → login_as_user → offer → context → case_setup numa org de teste.
#
# Uso:
#   PERFECTING_API_BASE=https://api-hml.perfecting.app \
#   SA_EMAIL=...@... SA_PASS=... TARGET_ORG_ID=123 TARGET_USER_ID=456 \
#   bash scripts/validate-hml.sh
#
# Requer: curl, jq.
set -euo pipefail

API="${PERFECTING_API_BASE:-https://api-hml.perfecting.app}"
: "${SA_EMAIL:?defina SA_EMAIL}"
: "${SA_PASS:?defina SA_PASS}"
: "${TARGET_ORG_ID:?defina TARGET_ORG_ID}"
: "${TARGET_USER_ID:?defina TARGET_USER_ID}"

strip_bearer() { sed -E 's/^[Bb]earer[[:space:]]+//'; }

echo "1) login superadmin (form-urlencoded)…"
SA_TOKEN=$(curl -sS -X POST "$API/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=$SA_EMAIL" \
  --data-urlencode "password=$SA_PASS" | jq -r '.access_token' | strip_bearer)
[ -n "$SA_TOKEN" ] && echo "   ok"

echo "2) login_as_user (impersonação na org $TARGET_ORG_ID)…"
TOKEN=$(curl -sS -X POST "$API/superadmin/login_as_user" \
  -H "Authorization: Bearer $SA_TOKEN" -H "Content-Type: application/json" \
  -d "{\"target_user_id\":$TARGET_USER_ID,\"target_organization_id\":$TARGET_ORG_ID,\"password_confirmation\":\"$SA_PASS\"}" \
  | jq -r '.access_token' | strip_bearer)
[ -n "$TOKEN" ] && echo "   ok"

echo "3) offer/generate (campo offer_description!)…"
OG=$(curl -sS -X POST "$API/role_plays/offer/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"offer_name":"Teste Validação","offer_description":"Software de gestão de vendas para PMEs. Reduz churn e acelera onboarding.","infer":true}')
echo "$OG" | jq -e '.' >/dev/null && echo "   ok"

echo "4) offer/create (campo general_description; resposta traz name)…"
OFFER_ID=$(curl -sS -X POST "$API/role_plays/offer/create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(echo "$OG" | jq '. + {general_description:"Software de gestão de vendas para PMEs.", url:""}')" \
  | jq -r '.id // .offer_id')
echo "   offer_id=$OFFER_ID"

echo "5) context/generate + create…"
CG=$(curl -sS -X POST "$API/role_plays/context/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"offer_id\":$OFFER_ID,\"aditional_instructions\":\"\",\"infer\":true}")
CTX_ID=$(curl -sS -X POST "$API/role_plays/context/create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(echo "$CG" | jq ". + {offer_id:$OFFER_ID}")" | jq -r '.id')
echo "   context_id=$CTX_ID"

echo "6) call_contexts (slug→id) + role_plays/generate (NÃO /case_setup/generate)…"
curl -sS "$API/role_plays/call_contexts" -H "Authorization: Bearer $TOKEN" | jq -c '.[0]' || true
SG=$(curl -sS -X POST "$API/role_plays/generate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"context_id\":$CTX_ID,\"scenario_difficulty_level\":\"medium\",\"infer\":true}")
echo "   generate ok"

echo "7) case_setup/create (SEM ?generate_case_prompt)…"
CASE=$(curl -sS -X POST "$API/role_plays/case_setup/create" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$(echo "$SG" | jq ". + {context_id:$CTX_ID, persona_voice_id:(.persona_voice_id // 1)}")")
echo "$CASE" | jq '{id, elevenlabs_agent_id}'

echo ""
echo "✅ Validação concluída. Confirme em app-hml.perfecting.app (logado na org $TARGET_ORG_ID)"
echo "   que o roleplay aparece em /roleplays e abre em /roleplays/<id>/details."
