#!/bin/sh
# Garde Auphine allumée sans pm2 (pour les comptes limités en nombre de processus).
#   sh scripts/keepalive.sh           → lance l'appli si elle ne tourne pas (à mettre dans cron chaque minute)
#   sh scripts/keepalive.sh restart   → redémarre l'appli (après une mise à jour)
# Variables : NODE (chemin de node, indispensable dans cron), PORT, HOST, TRUST_PROXY.
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$APP_DIR/data/auphine.pid"
LOG_FILE="$APP_DIR/data/auphine.log"
NODE="${NODE:-node}"

running() {
  [ -f "$PID_FILE" ] || return 1
  read -r pid < "$PID_FILE"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && grep -qa "server/index.js" "/proc/$pid/cmdline" 2>/dev/null
}

if [ "$1" = "restart" ] && running; then
  kill "$pid"
  i=0
  while running && [ $i -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
fi

running && exit 0

mkdir -p "$APP_DIR/data"
cd "$APP_DIR" || exit 1
# Moins de sous-processus : 2 pour les entrées/sorties, 1 pour V8 (au lieu d'une dizaine).
HOST="${HOST:-127.0.0.1}" TRUST_PROXY="${TRUST_PROXY:-1}" UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-2}" \
  nohup "$NODE" --v8-pool-size=1 --disable-warning=ExperimentalWarning server/index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Auphine lancée (pid $!), journal : $LOG_FILE"
