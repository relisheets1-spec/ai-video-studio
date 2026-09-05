#!/usr/bin/env bash
#
# Ночная резервная копия: база + медиа.
#
#   /var/backups/studio/studio-YYYY-MM-DD.db   — снимок базы (7 последних)
#   R2 (если настроен rclone):
#       studio:<bucket>/db/    — те же снимки базы
#       studio:<bucket>/media/ — зеркало каталога медиа
#
# Настройка R2 (один раз, от root):
#   rclone config create r2 s3 provider=Cloudflare \
#     access_key_id=... secret_access_key=... \
#     endpoint=https://<account>.r2.cloudflarestorage.com
#   echo 'BACKUP_REMOTE=r2:studio-backup' >> /etc/studio.env
#
# Проверка восстановления:
#   systemctl stop studio
#   cp /var/backups/studio/studio-<дата>.db /var/lib/studio/studio.db
#   chown studio:studio /var/lib/studio/studio.db && systemctl start studio
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/studio}"
DB_PATH="${DB_PATH:-$DATA_DIR/studio.db}"
MEDIA_ROOT="${MEDIA_ROOT:-$DATA_DIR/media}"
BACKUP_DIR=/var/backups/studio
KEEP_DAYS=7
STAMP="$(date +%F)"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "База $DB_PATH ещё не создана — копировать нечего"
  exit 0
fi

echo "==> Снимок базы"
# .backup работает на живой базе: WAL не мешает, копия целостная.
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/studio-$STAMP.db'"
gzip -f "$BACKUP_DIR/studio-$STAMP.db"

echo "==> Уборка старых копий (${KEEP_DAYS} дней)"
find "$BACKUP_DIR" -name 'studio-*.db.gz' -mtime "+$KEEP_DAYS" -delete

if [[ -n "${BACKUP_REMOTE:-}" ]] && command -v rclone >/dev/null; then
  echo "==> Отправка в $BACKUP_REMOTE"
  rclone copy "$BACKUP_DIR/studio-$STAMP.db.gz" "$BACKUP_REMOTE/db/" --quiet
  # Медиа синхронизируем, а не архивируем: файлы не меняются, льётся только новое.
  rclone sync "$MEDIA_ROOT" "$BACKUP_REMOTE/media" --quiet --transfers 4
  rclone delete "$BACKUP_REMOTE/db/" --min-age "${KEEP_DAYS}d" --quiet || true
else
  echo "==> rclone/BACKUP_REMOTE не настроены — копия только локальная"
fi

echo "Готово: $BACKUP_DIR/studio-$STAMP.db.gz ($(du -h "$BACKUP_DIR/studio-$STAMP.db.gz" | cut -f1))"
