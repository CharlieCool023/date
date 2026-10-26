#!/usr/bin/env bash
# Velum local run driver (Git Bash on Windows; also POSIX shells with docker + node).
# Usage: driver.sh <up|dev|wait|smoke|shot|stop>   (run from the repo root)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT="${VELUM_RUN_DIR:-${TMPDIR:-/tmp}/velum-run}"
mkdir -p "$OUT"
cd "$ROOT"

load_env() {
  [ -f .env ] || { echo "Missing .env - copy .env.example and fill secrets (see SKILL.md)" >&2; exit 1; }
  set -a; . ./.env; set +a
}

psql_q() { docker compose exec -T postgres psql -U velum -d velum -tAc "$1"; }

find_chrome() {
  for c in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
           "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
           "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
  echo "No Chrome/Edge/Chromium found" >&2; exit 1
}

case "${1:-}" in
  up)
    # Infra + schema + seed. Idempotent.
    load_env
    docker info >/dev/null 2>&1 || { echo "Docker daemon not running - start Docker Desktop first" >&2; exit 1; }
    docker compose up -d --wait postgres redis storage
    docker compose up storage-buckets >/dev/null
    if [ "$(psql_q "select to_regclass('public.zones') is not null")" != "t" ]; then
      echo "Applying packages/db/migrations/0001_initial.sql (drizzle-kit migrate cannot: no meta/_journal.json)"
      docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U velum -d velum < packages/db/migrations/0001_initial.sql
    fi
    pnpm db:seed >/dev/null
    echo "infra ready; zones=$(psql_q 'select count(*) from zones')"
    ;;
  dev)
    # Foreground; run this in the background (agent: run_in_background). Log -> $OUT/dev.log
    load_env
    exec pnpm dev > "$OUT/dev.log" 2>&1
    ;;
  wait)
    # Block until web + realtime + worker are up, or fail loudly.
    for _ in $(seq 1 120); do
      if grep -aq "Ready in" "$OUT/dev.log" 2>/dev/null && grep -aq "Server listening at" "$OUT/dev.log"; then
        sleep 5
        if grep -aqE "ERR_|Error:|TransformError" "$OUT/dev.log"; then
          echo "Startup errors in $OUT/dev.log:" >&2; grep -aE "ERR_|Error:" "$OUT/dev.log" | head -5 >&2; exit 1
        fi
        echo "ready (log: $OUT/dev.log)"; exit 0
      fi
      sleep 1
    done
    echo "timed out; tail of $OUT/dev.log:" >&2; tail -20 "$OUT/dev.log" >&2; exit 1
    ;;
  smoke)
    curl -fsS http://localhost:3000/api/v1/health; echo
    curl -fsS http://localhost:3000/api/v1/zones | head -c 300; echo
    for p in / /signin /invite; do printf '%-8s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$p")"; done
    printf 'realtime %s (403 expected without session/origin)\n' "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/ws)"
    load_env
    echo "pg-boss schedules: $(psql_q "select string_agg(name, ',') from pgboss.schedule")"
    ;;
  shot)
    # driver.sh shot [path] [name] -> $OUT/<name>.png (headless Chrome, 1280x900)
    path="${2:-/}"; name="${3:-$(echo "${path#/}" | tr '/' '-')}"; name="${name:-home}"
    "$(find_chrome)" --headless=new --disable-gpu --user-data-dir="$OUT/chrome" --window-size=1280,900 \
      --virtual-time-budget=8000 --screenshot="$OUT/$name.png" "http://localhost:3000$path" 2>/dev/null || true
    [ -s "$OUT/$name.png" ] && echo "$OUT/$name.png" || { echo "screenshot failed" >&2; exit 1; }
    ;;
  email)
    # driver.sh email <template> -> $OUT/email-<template>.html + .png (no email is sent)
    t="${2:-invite}"
    cat > packages/email/.preview.ts <<EOF
import { writeFileSync } from "node:fs";
import { renderEmail } from "./src/index.ts";
const mail = await renderEmail("$t", "http://localhost:3000", "example-token");
writeFileSync(process.argv[2], mail.html);
console.log("subject:", mail.subject);
EOF
    (cd packages/email && npx tsx .preview.ts "$OUT/email-$t.html"); rm -f packages/email/.preview.ts
    "$(find_chrome)" --headless=new --disable-gpu --user-data-dir="$OUT/chrome" --window-size=700,820 \
      --screenshot="$OUT/email-$t.png" "file:///$(cd "$OUT" && pwd -W 2>/dev/null || pwd)/email-$t.html" 2>/dev/null || true
    [ -s "$OUT/email-$t.png" ] && echo "$OUT/email-$t.png" || { echo "email screenshot failed" >&2; exit 1; }
    ;;
  stop)
    # pnpm/turbo children outlive the parent on Windows; kill by port + worker command line.
    if command -v powershell.exe >/dev/null; then
      powershell.exe -NoProfile -Command '
        Get-NetTCPConnection -LocalPort 3000,4001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
        Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "apps[\\/]worker|velum/worker|turbo" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
    else
      pkill -f "turbo dev" || true; pkill -f "next dev" || true; pkill -f "tsx watch src/index.ts" || true
    fi
    echo stopped
    ;;
  *) echo "usage: $0 <up|dev|wait|smoke|shot [path] [name]|email [template]|stop>" >&2; exit 2 ;;
esac
