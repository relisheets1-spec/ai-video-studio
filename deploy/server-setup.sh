#!/usr/bin/env bash
#
# Первичная настройка сервера под AI Video Studio (Ubuntu 24.04, от root):
#
#     bash server-setup.sh innovasantehservis.kz
#
# Домен уже должен указывать на этот сервер: сертификат берётся у Let's Encrypt.
# Скрипт идемпотентный — повторный запуск ничего не ломает. Сборка приложения
# на сервере не делается, её выполняет GitHub Actions.
#
# Необязательно: DEPLOY_PUBKEY_FILE=/root/deploy/studio_deploy.pub — публичный
# ключ GitHub Actions, будет добавлен пользователю studio.
set -euo pipefail

DOMAIN="${1:-}"
NODE_MAJOR=24
APP_USER=studio
APP_DIR=/var/www/studio
DATA_DIR=/var/lib/studio
ENV_FILE=/etc/studio.env
REPO_DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Запускать от root: sudo bash $0 <домен>" >&2
  exit 1
fi
if [[ -z "$DOMAIN" ]]; then
  echo "Укажите домен: bash $0 innovasantehservis.kz" >&2
  exit 1
fi

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git nginx sqlite3 ufw rsync unzip jq certbot python3-certbot-nginx

echo "==> Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> Swap 2 ГБ"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -qw vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "==> Пользователь ${APP_USER} и каталоги"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/releases" "$DATA_DIR/media/films" "$DATA_DIR/media/refs" /var/backups/studio
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
# nginx отдаёт /media напрямую: каталоги проходимы для всех, файлы пишет только studio.
chmod 755 "$DATA_DIR" "$DATA_DIR/media" "$DATA_DIR/media/films" "$DATA_DIR/media/refs"
chmod 750 /var/backups/studio

if [[ -n "${DEPLOY_PUBKEY_FILE:-}" && -f "$DEPLOY_PUBKEY_FILE" ]]; then
  echo "==> Ключ деплоя для ${APP_USER}"
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  touch "/home/$APP_USER/.ssh/authorized_keys"
  grep -qF "$(cut -d' ' -f2 "$DEPLOY_PUBKEY_FILE")" "/home/$APP_USER/.ssh/authorized_keys" \
    || cat "$DEPLOY_PUBKEY_FILE" >> "/home/$APP_USER/.ssh/authorized_keys"
  chown "$APP_USER:$APP_USER" "/home/$APP_USER/.ssh/authorized_keys"
  chmod 600 "/home/$APP_USER/.ssh/authorized_keys"
fi

echo "==> Переменные (${ENV_FILE})"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ENV_FILE" <<ENV
SESSION_SECRET=${SECRET}
# главный администратор и scrypt-хэш кода администратора (npm run hash-code -- "<код>")
ADMIN_EMAIL=
ADMIN_CODE_HASH=
APP_URL=https://${DOMAIN}
APP_NAME=AI Video Studio
DATA_DIR=${DATA_DIR}
MEDIA_TTL_DAYS=30
MAX_SESSIONS=3
PORT=3000
HOSTNAME=127.0.0.1
ENV
  echo "    создан ${ENV_FILE} — впишите ADMIN_EMAIL и ADMIN_CODE_HASH"
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

echo "==> Служба, уборщик и бэкап"
install -m 644 "$REPO_DEPLOY_DIR/studio.service" /etc/systemd/system/studio.service
install -m 644 "$REPO_DEPLOY_DIR/studio-cleanup.service" /etc/systemd/system/studio-cleanup.service
install -m 644 "$REPO_DEPLOY_DIR/studio-cleanup.timer" /etc/systemd/system/studio-cleanup.timer
install -m 644 "$REPO_DEPLOY_DIR/studio-backup.service" /etc/systemd/system/studio-backup.service
install -m 644 "$REPO_DEPLOY_DIR/studio-backup.timer" /etc/systemd/system/studio-backup.timer
install -m 755 "$REPO_DEPLOY_DIR/backup.sh" /usr/local/bin/studio-backup
systemctl daemon-reload
systemctl enable studio.service studio-cleanup.timer studio-backup.timer >/dev/null
systemctl start studio-cleanup.timer studio-backup.timer

# Деплой перезапускает службу без пароля — больше root-прав у studio нет.
cat > /etc/sudoers.d/studio-deploy <<SUDO
studio ALL=(root) NOPASSWD: /usr/bin/systemctl restart studio, /usr/bin/systemctl status studio, /bin/systemctl restart studio, /bin/systemctl status studio
SUDO
chmod 440 /etc/sudoers.d/studio-deploy
visudo -cf /etc/sudoers.d/studio-deploy >/dev/null

echo "==> Файрвол"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'ssh' >/dev/null
ufw allow 80/tcp comment 'http' >/dev/null
ufw allow 443/tcp comment 'https' >/dev/null
ufw --force enable >/dev/null

echo "==> nginx и сертификат Let's Encrypt"
rm -f /etc/nginx/sites-enabled/default
mkdir -p /etc/ssl/studio
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  # Пока идёт проверка домена, nginx отдаёт http-конфиг — certbot ходит через него.
  cp "$REPO_DEPLOY_DIR/nginx-http.conf" /etc/nginx/sites-available/studio
  ln -sf /etc/nginx/sites-available/studio /etc/nginx/sites-enabled/studio
  nginx -t && (systemctl reload nginx || systemctl restart nginx)
  certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" -d "www.${DOMAIN}" \
    || certbot certonly --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN"
fi
ln -sf "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" /etc/ssl/studio/fullchain.pem
ln -sf "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" /etc/ssl/studio/privkey.pem
# Продление раз в сутки делает таймер certbot; после продления nginx перечитывает сертификат.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sed "s/DOMAIN/${DOMAIN}/g" "$REPO_DEPLOY_DIR/nginx.conf" > /etc/nginx/sites-available/studio
ln -sf /etc/nginx/sites-available/studio /etc/nginx/sites-enabled/studio
nginx -t
systemctl enable nginx >/dev/null
systemctl reload nginx || systemctl restart nginx

sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|" "$ENV_FILE"
if systemctl is-active --quiet studio; then systemctl restart studio; fi

echo
echo "Готово. Дальше:"
echo "  1) впишите в ${ENV_FILE} ADMIN_EMAIL и ADMIN_CODE_HASH (npm run hash-code -- \"<код>\"), затем systemctl restart studio;"
echo "  2) секреты GitHub: SSH_HOST, SSH_USER=${APP_USER}, SSH_KEY — и push в main разложит приложение;"
echo "  3) systemctl status studio && journalctl -u studio -f"
