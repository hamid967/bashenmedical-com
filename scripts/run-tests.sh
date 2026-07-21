#!/usr/bin/env bash
# سكربت CLI لتشغيل مجموعة الاختبارات كاملة محليًا.
# يختار تلقائيًا الطريقة المناسبة بالترتيب التالي:
#   1. داخل Devcontainer/Docker بالفعل  → تشغيل مباشر بـ bun
#   2. docker compose متاح             → docker-compose.test.yml
#   3. docker (بدون compose) متاح      → Dockerfile.test
#   4. bun محلي متاح                    → تشغيل مباشر
# استخدام:
#   bash scripts/run-tests.sh                 # كل الاختبارات
#   bash scripts/run-tests.sh --method=bun    # فرض طريقة معيّنة
#   bash scripts/run-tests.sh --explain       # عرض تفسير الاختيار فقط
#   bash scripts/run-tests.sh --explain-json  # نفس التفسير كـ JSON للاستهلاك الآلي
#   bash scripts/run-tests.sh --no-rls        # تخطّي اختبارات RLS
#   bash scripts/run-tests.sh -- bun test x   # مرّر أمرًا مخصّصًا للحاوية
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

METHOD="auto"
RUN_RLS=1
WATCH=0
EXPLAIN=0
EXPLAIN_JSON=0
WATCH_PATHS=(src tests scripts package.json Dockerfile.test docker-compose.test.yml)
CUSTOM_CMD=()

# ---------- تحليل الوسائط ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --method=*) METHOD="${1#*=}"; shift ;;
    --method)   METHOD="$2"; shift 2 ;;
    --no-rls)   RUN_RLS=0; shift ;;
    --explain)  EXPLAIN=1; shift ;;
    --explain-json) EXPLAIN=1; EXPLAIN_JSON=1; shift ;;
    --watch|-w) WATCH=1; shift ;;
    --watch-path=*) WATCH_PATHS+=("${1#*=}"); shift ;;
    -h|--help)
      sed -n '2,19p' "$0"
      exit 0 ;;
    --) shift; CUSTOM_CMD=("$@"); break ;;
    *)  echo "❌ وسيطة غير معروفة: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
err() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

# ---------- الأوامر الافتراضية ----------
# ---------- الأوامر الافتراضية (مطابقة لخطوات CI بالترتيب) ----------
# مصدر الحقيقة: .github/workflows/ci.yml (jobs: lint-and-typecheck, rls-tests-*)
if [ ${#CUSTOM_CMD[@]} -eq 0 ]; then
  BASE_CMD='set -e && \
bun install --frozen-lockfile && \
bun run format:check && \
bun run lint:inserts && \
bun run lint:portal-tokens && \
bash tests/lint/book-docs-examples.sh && \
bun tests/unit/book-docs-keys.test.ts && \
for f in tests/unit/*.test.ts; do echo "── $f ──"; bun "$f"; done && \
bun run typecheck'
  if [ "$RUN_RLS" -eq 1 ]; then
    FULL_CMD="$BASE_CMD && bun run check:rls"
  else
    FULL_CMD="$BASE_CMD"
  fi
else
  FULL_CMD="${CUSTOM_CMD[*]}"
fi

# ---------- كشف البيئة الحالية ----------
has() { command -v "$1" >/dev/null 2>&1; }

detect_env() {
  # يعبّئ متغيرات عالمية + مصفوفة REASONS لعرض تفسير الاختيار.
  IN_CONTAINER=0; IN_CONTAINER_WHY=""
  HAS_DEVCONTAINER=0; DEVCONTAINER_PATH=""
  HAS_DOCKER=0; DOCKER_DAEMON=0; DOCKER_SOCK=""
  HAS_COMPOSE=0; COMPOSE_KIND=""
  HAS_COMPOSE_FILE=0; HAS_DOCKERFILE=0
  HAS_BUN=0; BUN_VERSION=""

  # داخل حاوية؟
  if [ -f /.dockerenv ]; then IN_CONTAINER=1; IN_CONTAINER_WHY="/.dockerenv موجود"; fi
  if [ "$IN_CONTAINER" -eq 0 ] && grep -qE '(docker|containerd|kubepods)' /proc/1/cgroup 2>/dev/null; then
    IN_CONTAINER=1; IN_CONTAINER_WHY="/proc/1/cgroup يشير لحاوية"
  fi
  if [ -n "${REMOTE_CONTAINERS:-}${CODESPACES:-}${DEVCONTAINER:-}" ]; then
    IN_CONTAINER=1
    IN_CONTAINER_WHY="${IN_CONTAINER_WHY:+$IN_CONTAINER_WHY, }متغيّر بيئة devcontainer/codespaces"
  fi

  # devcontainer.json؟
  for p in .devcontainer/devcontainer.json .devcontainer.json; do
    if [ -f "$p" ]; then HAS_DEVCONTAINER=1; DEVCONTAINER_PATH="$p"; break; fi
  done

  # docker + daemon
  if has docker; then
    HAS_DOCKER=1
    if docker info >/dev/null 2>&1; then
      DOCKER_DAEMON=1
      DOCKER_SOCK="${DOCKER_HOST:-}"
      [ -z "$DOCKER_SOCK" ] && [ -S /var/run/docker.sock ] && DOCKER_SOCK="unix:///var/run/docker.sock"
    fi
  fi

  # compose (v2 plugin أو v1 binary)
  if [ "$HAS_DOCKER" -eq 1 ] && docker compose version >/dev/null 2>&1; then
    HAS_COMPOSE=1; COMPOSE_KIND="docker compose (v2)"
  elif has docker-compose; then
    HAS_COMPOSE=1; COMPOSE_KIND="docker-compose (v1)"
  fi

  [ -f docker-compose.test.yml ] && HAS_COMPOSE_FILE=1
  [ -f Dockerfile.test ] && HAS_DOCKERFILE=1

  if has bun; then HAS_BUN=1; BUN_VERSION="$(bun --version 2>/dev/null || echo '?')"; fi
}

print_env_report() {
  printf '\033[1;34m── فحص البيئة ──\033[0m\n'
  printf '  داخل حاوية        : %s%s\n' "$([ $IN_CONTAINER -eq 1 ] && echo نعم || echo لا)" \
    "$([ -n "$IN_CONTAINER_WHY" ] && echo " ($IN_CONTAINER_WHY)")"
  printf '  devcontainer.json : %s\n' "$([ $HAS_DEVCONTAINER -eq 1 ] && echo "$DEVCONTAINER_PATH" || echo "غير موجود")"
  printf '  docker CLI        : %s\n' "$([ $HAS_DOCKER -eq 1 ] && echo متاح || echo غير متاح)"
  printf '  docker daemon     : %s%s\n' \
    "$([ $DOCKER_DAEMON -eq 1 ] && echo "متصل" || echo "غير متصل")" \
    "$([ -n "$DOCKER_SOCK" ] && echo " [$DOCKER_SOCK]")"
  printf '  docker compose    : %s\n' "$([ $HAS_COMPOSE -eq 1 ] && echo "$COMPOSE_KIND" || echo "غير متاح")"
  printf '  compose file      : %s\n' "$([ $HAS_COMPOSE_FILE -eq 1 ] && echo "docker-compose.test.yml" || echo "غير موجود")"
  printf '  Dockerfile.test   : %s\n' "$([ $HAS_DOCKERFILE -eq 1 ] && echo موجود || echo "غير موجود")"
  printf '  bun               : %s\n' "$([ $HAS_BUN -eq 1 ] && echo "v$BUN_VERSION" || echo "غير مثبّت")"
}

choose_method() {
  # يعيد METHOD + REASON.
  if [ "$IN_CONTAINER" -eq 1 ]; then
    if [ "$HAS_BUN" -eq 1 ]; then
      METHOD="bun"; REASON="نحن داخل حاوية ($IN_CONTAINER_WHY) و bun متاح — لا داعي لتشغيل docker متداخل."
    else
      METHOD="bun"; REASON="داخل حاوية لكن bun غير مثبّت — سيفشل التشغيل؛ ثبّت bun في الصورة الأساسية."
    fi
    return
  fi
  if [ "$HAS_DOCKER" -eq 1 ] && [ "$DOCKER_DAEMON" -eq 1 ] && [ "$HAS_COMPOSE" -eq 1 ] && [ "$HAS_COMPOSE_FILE" -eq 1 ]; then
    METHOD="compose"
    REASON="docker daemon متصل + $COMPOSE_KIND + docker-compose.test.yml موجود$([ $HAS_DEVCONTAINER -eq 1 ] && echo " (متوافق مع devcontainer الحالي)")."
    return
  fi
  if [ "$HAS_DOCKER" -eq 1 ] && [ "$DOCKER_DAEMON" -eq 1 ] && [ "$HAS_DOCKERFILE" -eq 1 ]; then
    METHOD="docker"
    REASON="docker daemon متصل و Dockerfile.test موجود، لكن لا يوجد compose أو ملف compose."
    return
  fi
  if [ "$HAS_DOCKER" -eq 1 ] && [ "$DOCKER_DAEMON" -eq 0 ]; then
    if [ "$HAS_BUN" -eq 1 ]; then
      METHOD="bun"; REASON="docker CLI موجود لكن الـdaemon غير متصل (لا socket) — تحويل إلى bun المحلي."
      return
    fi
    err "docker CLI موجود لكن الـdaemon غير متصل، و bun غير مثبّت. شغّل docker أو ثبّت bun."
    exit 1
  fi
  if [ "$HAS_BUN" -eq 1 ]; then
    METHOD="bun"; REASON="لا docker متاح — الرجوع إلى bun المحلي."
    return
  fi
  err "لم أجد docker (daemon) ولا bun. ثبّت أحدهما ثم أعد المحاولة."
  exit 1
}

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'; }

emit_explain_json() {
  cat <<JSON
{
  "environment": {
    "in_container": $([ $IN_CONTAINER -eq 1 ] && echo true || echo false),
    "in_container_reason": "$(json_escape "$IN_CONTAINER_WHY")",
    "devcontainer": {
      "present": $([ $HAS_DEVCONTAINER -eq 1 ] && echo true || echo false),
      "path": "$(json_escape "$DEVCONTAINER_PATH")"
    },
    "docker": {
      "cli": $([ $HAS_DOCKER -eq 1 ] && echo true || echo false),
      "daemon": $([ $DOCKER_DAEMON -eq 1 ] && echo true || echo false),
      "socket": "$(json_escape "$DOCKER_SOCK")"
    },
    "compose": {
      "available": $([ $HAS_COMPOSE -eq 1 ] && echo true || echo false),
      "kind": "$(json_escape "$COMPOSE_KIND")",
      "file_present": $([ $HAS_COMPOSE_FILE -eq 1 ] && echo true || echo false)
    },
    "dockerfile_test_present": $([ $HAS_DOCKERFILE -eq 1 ] && echo true || echo false),
    "bun": {
      "available": $([ $HAS_BUN -eq 1 ] && echo true || echo false),
      "version": "$(json_escape "$BUN_VERSION")"
    }
  },
  "decision": {
    "method": "$(json_escape "$METHOD")",
    "reason": "$(json_escape "$REASON")",
    "forced": $([ "$1" = "forced" ] && echo true || echo false)
  }
}
JSON
}

detect_env

FORCED="auto"
if [ "$METHOD" = "auto" ]; then
  if [ "$EXPLAIN_JSON" -eq 0 ]; then print_env_report; fi
  choose_method
else
  FORCED="forced"
  if [ "$EXPLAIN_JSON" -eq 0 ]; then print_env_report; fi
  REASON="مفروضة يدويًا عبر --method=$METHOD"
fi

if [ "$EXPLAIN_JSON" -eq 1 ]; then
  emit_explain_json "$FORCED"
  exit 0
fi

printf '\033[1;36m▶ الطريقة المختارة: %s\033[0m\n' "$METHOD"
printf '\033[0;36m  السبب: %s\033[0m\n' "$REASON"

if [ "$EXPLAIN" -eq 1 ]; then
  echo
  ok "وضع التفسير (--explain) — لم يُنفّذ أي اختبار."
  exit 0
fi

# ---------- تحقّق من .env.local عند الحاجة ----------
need_env_file() {
  if [ "$RUN_RLS" -eq 1 ] && [ "$METHOD" != "bun" ] && [ ! -f .env.local ]; then
    err ".env.local غير موجود. انسخ .env.example وعبّئ القيم:"
    echo "    cp .env.example .env.local && \$EDITOR .env.local" >&2
    exit 1
  fi
}

# ---------- منفّذ الجولة الواحدة ----------
run_once() {
  case "$METHOD" in
    bun)
      has bun || { err "bun غير مثبّت في المسار."; return 1; }
      if [ "$RUN_RLS" -eq 1 ] && [ -f .env.local ] && [ -z "${SUPABASE_URL:-}" ]; then
        log "تحميل .env.local"; set -a; . ./.env.local; set +a
      fi
      log "تنفيذ: $FULL_CMD"
      bash -lc "$FULL_CMD"
      ;;
    compose)
      need_env_file
      [ -f docker-compose.test.yml ] || { err "docker-compose.test.yml غير موجود."; return 1; }
      log "بناء الصورة (إن لزم)"
      docker compose -f docker-compose.test.yml build
      log "تنفيذ داخل Compose: $FULL_CMD"
      docker compose -f docker-compose.test.yml run --rm tests bash -lc "$FULL_CMD"
      ;;
    docker)
      need_env_file
      [ -f Dockerfile.test ] || { err "Dockerfile.test غير موجود."; return 1; }
      log "بناء الصورة app-tests"
      docker build -f Dockerfile.test -t app-tests .
      ENV_ARG=()
      [ -f .env.local ] && ENV_ARG=(--env-file .env.local)
      log "تنفيذ داخل Docker: $FULL_CMD"
      docker run --rm "${ENV_ARG[@]}" -v "$PWD":/app -w /app app-tests bash -lc "$FULL_CMD"
      ;;
    *)
      err "طريقة غير معروفة: $METHOD (المسموح: auto|bun|compose|docker)"; return 2 ;;
  esac
}

# ---------- مراقب الملفات ----------
watch_loop() {
  local existing=()
  for p in "${WATCH_PATHS[@]}"; do [ -e "$p" ] && existing+=("$p"); done
  [ ${#existing[@]} -gt 0 ] || { err "لا مسارات صالحة للمراقبة."; exit 1; }
  log "مراقبة: ${existing[*]}"
  run_once || true

  if has entr; then
    log "watcher: entr"
    while true; do
      find "${existing[@]}" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' -o -name '*.sh' -o -name '*.yml' -o -name 'Dockerfile*' \) \
        | entr -d -p bash -c 'exit 0' >/dev/null 2>&1 || true
      log "تغيير مُكتشف — إعادة التشغيل"
      run_once || true
    done
  elif has inotifywait; then
    log "watcher: inotifywait"
    while true; do
      inotifywait -qq -r -e modify,create,delete,move "${existing[@]}" || true
      log "تغيير مُكتشف — إعادة التشغيل"
      sleep 0.3
      run_once || true
    done
  elif has fswatch; then
    log "watcher: fswatch"
    fswatch -o -l 0.5 "${existing[@]}" | while read -r _; do
      log "تغيير مُكتشف — إعادة التشغيل"
      run_once || true
    done
  else
    log "watcher: polling (ثبّت entr/inotify-tools/fswatch لأداء أفضل)"
    touch /tmp/.run-tests-tick
    while sleep 2; do
      if find "${existing[@]}" -type f -newer /tmp/.run-tests-tick 2>/dev/null | grep -q .; then
        touch /tmp/.run-tests-tick
        log "تغيير مُكتشف — إعادة التشغيل"
        run_once || true
      fi
    done
  fi
}

# ---------- التنفيذ ----------
if [ "$WATCH" -eq 1 ]; then
  trap 'echo; ok "توقّف المراقب."; exit 0' INT TERM
  watch_loop
else
  run_once
  ok "انتهت مجموعة الاختبارات بنجاح."
fi
