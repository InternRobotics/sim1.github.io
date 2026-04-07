#!/usr/bin/env bash

set -euo pipefail

# One-click manager for SIM1 demo services:
# 1) local static server (python http.server on 8000)
# 2) cloudflared tunnel (using ~/.cloudflared/config.yml)

ROOT_DIR="/home/pjlab/code/Webpage"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/.logs"

WEB_PORT="8000"
WEB_URL="http://127.0.0.1:${WEB_PORT}"

CLOUDFLARED_CONFIG="${HOME}/.cloudflared/config.yml"

WEB_PID_FILE="$RUN_DIR/web.pid"
CF_PID_FILE="$RUN_DIR/cloudflared.pid"

WEB_LOG="$LOG_DIR/web.log"
CF_LOG="$LOG_DIR/cloudflared.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

is_pid_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

pid_from_file_if_running() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if is_pid_running "$pid"; then
      echo "$pid"
      return 0
    fi
  fi
  return 1
}

start_web() {
  if pid="$(pid_from_file_if_running "$WEB_PID_FILE")"; then
    echo "[web] already running (pid=$pid)"
    return
  fi

  # If another process already serves this port and responds, reuse it.
  if have_cmd curl && curl -sS --max-time 2 -I "$WEB_URL" >/dev/null 2>&1; then
    echo "[web] already active on port $WEB_PORT (no managed pid file)"
    return
  fi

  if ! have_cmd python3; then
    echo "[web] python3 not found" >&2
    exit 1
  fi

  (
    cd "$ROOT_DIR"
    nohup python3 -m http.server "$WEB_PORT" >"$WEB_LOG" 2>&1 &
    echo $! >"$WEB_PID_FILE"
  )

  sleep 0.8
  if pid="$(pid_from_file_if_running "$WEB_PID_FILE")"; then
    echo "[web] started (pid=$pid, port=$WEB_PORT)"
  else
    echo "[web] failed to start, check $WEB_LOG" >&2
    exit 1
  fi
}

start_cloudflared() {
  if pid="$(pid_from_file_if_running "$CF_PID_FILE")"; then
    echo "[cf ] already running (pid=$pid)"
    return
  fi

  # Avoid duplicate cloudflared tunnel runs even without pid file.
  if have_cmd pgrep && pgrep -af "cloudflared tunnel --config ${CLOUDFLARED_CONFIG} run" >/dev/null 2>&1; then
    echo "[cf ] already active (no managed pid file)"
    return
  fi

  if ! have_cmd cloudflared; then
    echo "[cf ] cloudflared not found" >&2
    exit 1
  fi
  if [[ ! -f "$CLOUDFLARED_CONFIG" ]]; then
    echo "[cf ] config missing: $CLOUDFLARED_CONFIG" >&2
    exit 1
  fi

  nohup cloudflared tunnel --config "$CLOUDFLARED_CONFIG" run >"$CF_LOG" 2>&1 &
  echo $! >"$CF_PID_FILE"

  sleep 1.2
  if pid="$(pid_from_file_if_running "$CF_PID_FILE")"; then
    echo "[cf ] started (pid=$pid)"
  else
    echo "[cf ] failed to start, check $CF_LOG" >&2
    exit 1
  fi
}

stop_one() {
  local name="$1"
  local pid_file="$2"

  if ! [[ -f "$pid_file" ]]; then
    echo "[$name] not running (no pid file)"
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if is_pid_running "$pid"; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 0.5
    if is_pid_running "$pid"; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    echo "[$name] stopped (pid=$pid)"
  else
    echo "[$name] not running (stale pid=$pid)"
  fi

  rm -f "$pid_file"
}

status() {
  local web_state="stopped"
  local cf_state="stopped"

  if pid="$(pid_from_file_if_running "$WEB_PID_FILE")"; then
    web_state="running pid=$pid (managed)"
  elif have_cmd curl && curl -sS --max-time 2 -I "$WEB_URL" >/dev/null 2>&1; then
    web_state="running (external/no pid file)"
  fi
  if pid="$(pid_from_file_if_running "$CF_PID_FILE")"; then
    cf_state="running pid=$pid (managed)"
  elif have_cmd pgrep && pgrep -af "cloudflared tunnel --config ${CLOUDFLARED_CONFIG} run" >/dev/null 2>&1; then
    cf_state="running (external/no pid file)"
  fi

  echo "[web] $web_state"
  echo "[cf ] $cf_state"

  if have_cmd curl; then
    if curl -sS --max-time 3 -I "$WEB_URL" >/dev/null 2>&1; then
      echo "[chk] local web healthy: $WEB_URL"
    else
      echo "[chk] local web unreachable: $WEB_URL"
    fi
  fi
}

start_all() {
  start_web
  start_cloudflared
  status
}

stop_all() {
  stop_one "cf " "$CF_PID_FILE"
  stop_one "web" "$WEB_PID_FILE"
}

restart_all() {
  stop_all
  start_all
}

usage() {
  cat <<'EOF'
Usage:
  ./demo_services.sh start
  ./demo_services.sh stop
  ./demo_services.sh restart
  ./demo_services.sh status

Logs:
  ./.logs/web.log
  ./.logs/cloudflared.log
EOF
}

ACTION="${1:-restart}"
case "$ACTION" in
  start)   start_all ;;
  stop)    stop_all ;;
  restart) restart_all ;;
  status)  status ;;
  *)       usage; exit 1 ;;
esac

