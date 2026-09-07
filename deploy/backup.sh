#!/usr/bin/env bash
#
# Ночная копия базы: /var/backups/studio/studio-YYYY-MM-DD.db.gz, семь последних.
# Медиа не копируется: кадры живут 30 дней и пересобираются заново.
#
# Восстановление:
#   systemctl stop studio
#   gunzip -c /var/backups/studio/studio-<дата>.db.gz > /var/lib/studio/studio.db
#   chown studio:studio /var/lib/studio/studio.db && systemctl start studio
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/studio}"
DB_PATH="${DB_PATH:-$DATA_DIR/studio.db}"
BACKUP_DIR=/var/backups/studio
KEEP_DAYS=7
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "База $DB_PATH ещё не создана — копировать нечего"
  exit 0
fi

# .backup работает на живой базе: WAL не мешает, копия целостная.
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/studio-$STAMP.db'"
gzip -f "$BACKUP_DIR/studio-$STAMP.db"
find "$BACKUP_DIR" -name 'studio-*.db.gz' -mtime "+$KEEP_DAYS" -delete

echo "Готово: $BACKUP_DIR/studio-$STAMP.db.gz ($(du -h "$BACKUP_DIR/studio-$STAMP.db.gz" | cut -f1))"
