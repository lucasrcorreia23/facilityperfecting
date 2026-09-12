#!/usr/bin/env bash
# Pré-check do modo Playbook: a org de destino tem playbook configurado e o
# gestor-alvo enxerga as etapas (PlaybookCallType)?
#
# Uso:
#   PERFECTING_API_BASE=https://api-hml.perfecting.app \
#   SA_EMAIL=...@... SA_PASS=... TARGET_ORG_ID=123 TARGET_USER_ID=456 \
#   bash scripts/validate-playbook-hml.sh
#
# Requer: curl, jq.
set -euo pipefail

API="${PERFECTING_API_BASE:-https://api-hml.perfecting.app}"
: "${SA_EMAIL:?defina SA_EMAIL}"
: "${SA_PASS:?defina SA_PASS}"
: "${TARGET_ORG_ID:?defina TARGET_ORG_ID}"
: "${TARGET_USER_ID:?defina TARGET_USER_ID}"

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

echo "3) playbook/list…"
PBS=$(curl -sS "$API/role_plays/playbook/list" -H "Authorization: Bearer $TOKEN")
echo "$PBS" | jq -c '.[] | {id, name, playbook_status_id}' || { echo "$PBS"; exit 1; }

PB_ID=$(echo "$PBS" | jq -r '.[0].id // empty')
if [ -z "$PB_ID" ]; then
  echo ""
  echo "⚠️  Nenhum playbook nesta org — o modo playbook não tem como ser testado aqui."
  echo "    Rode de novo apontando para uma org que já tenha playbook configurado."
  exit 1
fi

echo "4) playbook_$PB_ID/call_types (as etapas que virariam roleplays)…"
CTS=$(curl -sS "$API/role_plays/playbook_$PB_ID/call_types" -H "Authorization: Bearer $TOKEN")
echo "$CTS" | jq -c 'sort_by(.order // 0) | .[] | {id, name, order, call_context_type_id}'
echo "   total de etapas: $(echo "$CTS" | jq 'length')"

echo ""
echo "✅ Pré-check ok. playbook_id=$PB_ID geraria $(echo "$CTS" | jq 'length') roleplay(s)."
echo "   Guarde esse playbook_id/org para o teste ponta a ponta da Criação express."
