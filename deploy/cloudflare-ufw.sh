#!/usr/bin/env bash
#
# Пускает на 80 и 443 только диапазоны Cloudflare: реальный IP сервера
# остаётся скрытым, а мимо WAF до nginx никто не достучится.
# Запускать после смены списка (Cloudflare обновляет его редко):
#
#     sudo studio-cloudflare-ufw
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Запускать от root" >&2
  exit 1
fi

# Снимаем прежние правила Cloudflare (по комментарию), чтобы не копились.
while ufw status numbered | grep -q 'cloudflare'; do
  NUM="$(ufw status numbered | grep 'cloudflare' | head -1 | sed 's/^\[ *\([0-9]*\).*/\1/')"
  ufw --force delete "$NUM" >/dev/null
done

fetch() {
  curl -fsSL --max-time 20 "$1" || true
}

V4="$(fetch https://www.cloudflare.com/ips-v4)"
V6="$(fetch https://www.cloudflare.com/ips-v6)"

if [[ -z "$V4" ]]; then
  echo "Не удалось получить список Cloudflare — правила не изменены" >&2
  exit 1
fi

for ip in $V4 $V6; do
  ufw allow proto tcp from "$ip" to any port 80,443 comment 'cloudflare' >/dev/null
done

echo "Разрешено диапазонов: $(echo "$V4 $V6" | wc -w)"
