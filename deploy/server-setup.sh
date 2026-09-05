#!/usr/bin/env bash
#
# Первичная настройка сервера под AI Video Studio.
# Ubuntu 24.04 LTS, запускать от root:
#
#     bash server-setup.sh studio.example.com
#
# Скрипт идемпотентный: можно запускать повторно после изменений.
# Сборка приложения на сервере не делается — её выполняет GitHub Actions.
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

echo "==> Пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git nginx sqlite3 ufw rsync unzip jq

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
  sysctl -w vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "==> Пользователь ${APP_USER} и каталоги"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR/releases" "$DATA_DIR/media/films" "$DATA_DIR/media/refs" /var/backups/studio
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"
# nginx отдаёт /media напрямую — ему нужен проход внутрь каталога данных.
usermod -aG "$APP_USER" www-data
chmod 755 "$DATA_DIR" "$DATA_DIR/media"

echo "==> Ключи и переменные (${ENV_FILE})"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ENV_FILE" <<ENV
SESSION_SECRET=${SECRET}
OPENAI_API_KEY=
ADMIN_EMAILS=
APP_URL=https://${DOMAIN:-example.com}
APP_NAME=AI Video Studio
DATA_DIR=${DATA_DIR}
MEDIA_TTL_DAYS=30
DEFAULT_GENERATION_LIMIT=5
MAIL_FROM=AI Video Studio <no-reply@${DOMAIN:-example.com}>
RESEND_API_KEY=
SITE_PASSWORD=
ELEVENLABS_API_KEY=
PORT=3000
HOSTNAME=127.0.0.1
ENV
  echo "    создан ${ENV_FILE} — впишите OPENAI_API_KEY, ADMIN_EMAILS и почту"
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
install -m 755 "$REPO_DEPLOY_DIR/cloudflare-ufw.sh" /usr/local/bin/studio-cloudflare-ufw
systemctl daemon-reload
systemctl enable studio-cleanup.timer studio-backup.timer >/dev/null
systemctl start studio-cleanup.timer studio-backup.timer

# Деплой перезапускает службу без пароля — больше root-прав у studio нет.
cat > /etc/sudoers.d/studio-deploy <<SUDO
studio ALL=(root) NOPASSWD: /bin/systemctl restart studio, /bin/systemctl status studio, /usr/bin/systemctl restart studio, /usr/bin/systemctl status studio
SUDO
chmod 440 /etc/sudoers.d/studio-deploy

echo "==> nginx"
if [[ -n "$DOMAIN" ]]; then
  sed "s/DOMAIN/${DOMAIN}/g" "$REPO_DEPLOY_DIR/nginx.conf" > /etc/nginx/sites-available/studio
  ln -sf /etc/nginx/sites-available/studio /etc/nginx/sites-enabled/studio
  rm -f /etc/nginx/sites-enabled/default
  mkdir -p /etc/ssl/cloudflare
  if [[ ! -f /etc/ssl/cloudflare/origin.pem ]]; then
    echo "    ВНИМАНИЕ: положите origin-сертификат Cloudflare в /etc/ssl/cloudflare/origin.pem и origin.key,"
    echo "    затем: nginx -t && systemctl reload nginx"
  else
    nginx -t && systemctl reload nginx
  fi
else
  echo "    домен не передан — конфиг nginx не установлен"
fi

echo "==> Файрвол"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'ssh' >/dev/null
/usr/local/bin/studio-cloudflare-ufw
ufw --force enable >/dev/null
ufw status numbered | head -20

echo
echo "Готово. Дальше:"
echo "  1) впишите ключи в ${ENV_FILE} (OPENAI_API_KEY, ADMIN_EMAILS, RESEND_API_KEY);"
echo "  2) положите SSH-ключ деплоя в /home/${APP_USER}/.ssh/authorized_keys;"
echo "  3) запушьте в main — GitHub Actions соберёт и разложит приложение;"
echo "  4) systemctl status studio && journalctl -u studio -f"
