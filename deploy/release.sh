#!/usr/bin/env bash
#
# Раскладка сборки на сервере. Вызывается из GitHub Actions по SSH:
#
#     bash release.sh /tmp/studio-<sha>.tar.gz <sha>
#
# Прошлые выпуски остаются рядом, откат — переставить симлинк current
# на нужный каталог и перезапустить службу.
set -euo pipefail

TARBALL="${1:?нужен путь к архиву}"
SHA="${2:?нужен идентификатор выпуска}"

APP_DIR=/var/www/studio
RELEASE_DIR="$APP_DIR/releases/$SHA"
KEEP=5

echo "==> Распаковка в $RELEASE_DIR"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar xzf "$TARBALL" -C "$RELEASE_DIR"
rm -f "$TARBALL"

echo "==> Переключение current"
ln -sfn "$RELEASE_DIR" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"

echo "==> Перезапуск службы"
sudo systemctl restart studio

sleep 3
if ! sudo systemctl status studio --no-pager | head -5; then
  echo "Служба не поднялась" >&2
  exit 1
fi

echo "==> Проверка ответа"
for i in $(seq 1 10); do
  if curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/site; then
    break
  fi
  if [[ $i -eq 10 ]]; then
    echo "Приложение не отвечает на 127.0.0.1:3000" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Уборка старых выпусков (оставляем $KEEP)"
cd "$APP_DIR/releases"
ls -1t | tail -n +$((KEEP + 1)) | while read -r old; do
  [[ "$APP_DIR/releases/$old" == "$(readlink -f "$APP_DIR/current")" ]] && continue
  rm -rf -- "$old"
done

echo "Выпуск $SHA развёрнут"
