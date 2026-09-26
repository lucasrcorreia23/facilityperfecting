#!/usr/bin/env bash
# Fase 0 — contrato do FECHAMENTO do roleplay em HML, antes de confiar na
# complete-roleplay. Valida, num case_setup que já existe:
#   metodologias (GET/PUT) → rubricas → conteúdo por etapa → comportamento →
#   update_case_prompt → gate (role_play_prompt).
#
# Cronometra o passo de conteúdo por etapa: é ele que define o STEP_STALE_MS do
# fechamento (nº de personas × (nº de etapas + 1) chamadas de IA em série).
#
# Uso:
#   PERFECTING_API_BASE=https://api-hml.perfecting.app \
#   SA_EMAIL=...@... SA_PASS=... TARGET_ORG_ID=123 TARGET_USER_ID=456 \
#   CASE_SETUP_ID=160 [METHODOLOGY_ID=7] \
#   bash scripts/validate-completion-hml.sh
#
# Requer: curl, jq. NÃO roda em produção: gera conteúdo com IA na conta.
set -euo pipefail

API="${PERFECTING_API_BASE:-https://api-hml.perfecting.app}"
: "${SA_EMAIL:?defina SA_EMAIL}"
: "${SA_PASS:?defina SA_PASS}"
: "${TARGET_ORG_ID:?defina TARGET_ORG_ID}"
: "${TARGET_USER_ID:?defina TARGET_USER_ID}"
: "${CASE_SETUP_ID:?defina CASE_SETUP_ID (roleplay já criado em HML)}"

strip_bearer() { sed -E 's/^[Bb]earer[[:space:]]+//'; }
rp() { echo "$API/role_plays"; }

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

auth=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "3) catálogo de metodologias (só as ativas; a sentinela do Modo Rápido nunca aparece)…"
curl -sS "$(rp)/methodologies?only_active=true" "${auth[@]}" | jq -r '.[] | "   \(.id)\t\(.name)"'

echo "4) metodologias já vinculadas ao case_setup $CASE_SETUP_ID…"
curl -sS "$(rp)/case_setup_$CASE_SETUP_ID/methodologies" "${auth[@]}" | jq -c '.'

if [ -n "${METHODOLOGY_ID:-}" ]; then
  echo "5) PUT methodologies (substitui o conjunto — determinístico, sem IA)…"
  curl -sS -X PUT "$(rp)/case_setup_$CASE_SETUP_ID/methodologies" "${auth[@]}" \
    -d "{\"methodology_ids\":[$METHODOLOGY_ID]}" | jq -c '.'
else
  echo "5) PUT methodologies pulado (defina METHODOLOGY_ID para exercitar)"
fi

echo "6) rubricas: GET antes, generate (overwrite=false pula o que já existe)…"
curl -sS "$(rp)/case_setup_$CASE_SETUP_ID/feedback_rubrics" "${auth[@]}" | jq 'length as $n | "   \($n) rubrica(s) antes"' -r
time curl -sS -X POST "$(rp)/case_setup_$CASE_SETUP_ID/feedback_rubrics/generate" "${auth[@]}" \
  -d '{"rubric_type":"both","overwrite":false}' | jq -c '.'

echo "7) conteúdo por etapa — ⏱ CRONOMETRE: é o passo que estoura o wall clock…"
curl -sS "$(rp)/case_setup_$CASE_SETUP_ID/step_knowledge" "${auth[@]}" | jq 'length as $n | "   \($n) bloco(s) antes"' -r
time curl -sS -X POST "$(rp)/case_setup/step_knowledge/generate" "${auth[@]}" \
  -d "{\"case_setup_ids\":[$CASE_SETUP_ID],\"overwrite\":false}" | jq -c '.'

echo "8) comportamento (3 gerações, uma por nível)…"
time curl -sS -X POST "$(rp)/case_setup_$CASE_SETUP_ID/behavior_guidance/regenerate" "${auth[@]}" -d '{}' | jq -c '.'

echo "9) update_case_prompt (determinístico, sem IA)…"
curl -sS -X POST "$(rp)/case_setup_$CASE_SETUP_ID/unitary_cycle/update_case_prompt" "${auth[@]}" -d '{}' \
  | jq -c '{id, case_prompt: (.case_prompt | length)}'

echo "10) GATE — role_play_prompt (OUTRO mount: /role_plays_session)…"
curl -sS "$API/role_plays_session/role_play_prompt?case_setup_id=$CASE_SETUP_ID" "${auth[@]}" \
  | jq '{has_persona, has_behavior_guidance, has_knowledge_blocks, has_objections,
         has_difficulty_level, has_prior_knowledge, has_tone, has_persona_company,
         persona_randomly_selected, prompt_chars: (.prompt | length)}'

echo
echo "Esperado: has_persona, has_behavior_guidance, has_knowledge_blocks e has_difficulty_level = true."
echo "Se has_knowledge_blocks continuar false, confira se o case_setup tem metodologia vinculada."
