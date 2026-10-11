#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (copie cohérente même pendant l'utilisation).
# Garde 14 jours d'historique. À lancer par cron, voir DEPLOY.md.
set -euo pipefail

DB=/opt/auphine/data/auphine.db
DEST=/var/backups/auphine

mkdir -p "$DEST"
sqlite3 "$DB" ".backup '$DEST/auphine-$(date +%F).db'"
find "$DEST" -name 'auphine-*.db' -mtime +14 -delete
