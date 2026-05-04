#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-auth.sh — end-to-end auth + workspace bootstrap sanity check.
#
# What it does (in order):
#
#   1. POST /auth/login                       → captures the access token
#   2. GET  /auth/me                          → confirms the token is valid
#   3. GET  /memberships/me                   → resolves the workspace list,
#                                               picks the first companyId
#   4. GET  /companies/:companyId/clients     → confirms the tenant-scoped
#                                               permission stack (JwtAuthGuard
#                                               + CompanyMemberGuard +
#                                               ResourcePermissionGuard) lets
#                                               the seeded OWNER through
#
# Hard requirements:
#   - The API must be running and reachable at $API_URL (default
#     http://localhost:3000).
#   - The seed (`yarn workspace @orkestree/api seed`) must have been run
#     against the same database the API is talking to. The defaults below
#     match apps/api/prisma/seed.ts — change them in lockstep.
#   - `curl` and `jq` must be on PATH. `jq` is the only non-standard
#     dependency; install with `apt-get install jq` / `brew install jq`.
#
# Usage:
#   ./apps/api/scripts/smoke-auth.sh
#   API_URL=http://localhost:4000 ./apps/api/scripts/smoke-auth.sh
#   EMAIL=other@user.dev PASSWORD=hunter2 ./apps/api/scripts/smoke-auth.sh
#
# Exit codes:
#   0 — all four checks passed
#   1 — preflight failure (missing tool, unreachable API, etc.)
#   2 — a check returned a non-2xx status or unexpected body shape
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-owner@orkestree.dev}"
PASSWORD="${PASSWORD:-orkestree-dev-password}"

# ── Preflight ───────────────────────────────────────────────────────────────
if ! command -v curl >/dev/null 2>&1; then
    echo "✗ curl is required" >&2
    exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq is required (apt-get install jq / brew install jq)" >&2
    exit 1
fi

# Quiet helper around curl that captures HTTP status + body and fails the
# whole script if status is not 2xx. We avoid `curl -f` because we want the
# response body in the error message for debugging.
http_call() {
    local method="$1"
    local path="$2"
    local extra_args=("${@:3}")

    local tmp_body
    tmp_body=$(mktemp)
    local status
    status=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
        -X "$method" \
        -H 'Accept: application/json' \
        "${extra_args[@]}" \
        "${API_URL}${path}")

    if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
        echo "✗ ${method} ${path} → HTTP ${status}" >&2
        echo "  body: $(cat "$tmp_body")" >&2
        rm -f "$tmp_body"
        exit 2
    fi

    cat "$tmp_body"
    rm -f "$tmp_body"
}

echo "▶ smoke-auth against ${API_URL}"
echo "  user: ${EMAIL}"
echo

# ── 1) POST /auth/login ─────────────────────────────────────────────────────
echo "1/4  POST /auth/login"
LOGIN_BODY=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")
LOGIN_RESPONSE=$(http_call POST /auth/login \
    -H 'Content-Type: application/json' \
    --data "$LOGIN_BODY")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')
if [[ -z "$TOKEN" ]]; then
    echo "✗ login response did not include accessToken" >&2
    echo "  body: $LOGIN_RESPONSE" >&2
    exit 2
fi
USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id // empty')
echo "     ✓ accessToken received (userId=${USER_ID})"
echo

# ── 2) GET /auth/me ─────────────────────────────────────────────────────────
echo "2/4  GET  /auth/me"
ME_RESPONSE=$(http_call GET /auth/me -H "Authorization: Bearer ${TOKEN}")
ME_EMAIL=$(echo "$ME_RESPONSE" | jq -r '.email // empty')
if [[ "$ME_EMAIL" != "$EMAIL" ]]; then
    echo "✗ /auth/me returned unexpected email: $ME_EMAIL (expected $EMAIL)" >&2
    echo "  body: $ME_RESPONSE" >&2
    exit 2
fi
echo "     ✓ token resolves to ${ME_EMAIL}"
echo

# ── 3) GET /memberships/me ──────────────────────────────────────────────────
echo "3/4  GET  /memberships/me"
MEMBERSHIPS_RESPONSE=$(http_call GET /memberships/me \
    -H "Authorization: Bearer ${TOKEN}")
MEMBERSHIP_COUNT=$(echo "$MEMBERSHIPS_RESPONSE" | jq -r '.memberships | length')
if [[ -z "$MEMBERSHIP_COUNT" || "$MEMBERSHIP_COUNT" -lt 1 ]]; then
    echo "✗ /memberships/me returned no memberships" >&2
    echo "  body: $MEMBERSHIPS_RESPONSE" >&2
    exit 2
fi

COMPANY_ID=$(echo "$MEMBERSHIPS_RESPONSE" | jq -r '.memberships[0].company.id')
COMPANY_LABEL=$(echo "$MEMBERSHIPS_RESPONSE" \
    | jq -r '.memberships[0].company.tradeName // .memberships[0].company.legalName')
ROLE=$(echo "$MEMBERSHIPS_RESPONSE" | jq -r '.memberships[0].role')
echo "     ✓ ${MEMBERSHIP_COUNT} workspace(s); selecting first:"
echo "       companyId = ${COMPANY_ID}"
echo "       label     = ${COMPANY_LABEL}"
echo "       role      = ${ROLE}"
echo

# ── 4) GET /companies/:companyId/clients ────────────────────────────────────
echo "4/4  GET  /companies/${COMPANY_ID}/clients"
CLIENTS_RESPONSE=$(http_call GET "/companies/${COMPANY_ID}/clients" \
    -H "Authorization: Bearer ${TOKEN}")

# We don't assert clients exist (the seed deliberately doesn't create any).
# We only assert that the response is JSON the controller produced — i.e.
# the full guard chain passed.
if ! echo "$CLIENTS_RESPONSE" | jq -e . >/dev/null 2>&1; then
    echo "✗ /clients returned non-JSON" >&2
    echo "  body: $CLIENTS_RESPONSE" >&2
    exit 2
fi
echo "     ✓ tenant-scoped endpoint reachable; guards accepted the token"
echo

echo "✓ smoke-auth: all 4 checks passed."
