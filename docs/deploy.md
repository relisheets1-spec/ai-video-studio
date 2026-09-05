# Сервер: установка, деплой, обслуживание

Прикладная инструкция к плану `docs/plan-vps-auth.md`. Всё, что здесь описано,
лежит в репозитории и запускается как есть.

## 0. Что где живёт

| Что | Где |
| --- | --- |
| Код выпуска | `/var/www/studio/releases/<sha>`, симлинк `/var/www/studio/current` |
| База (SQLite) | `/var/lib/studio/studio.db` |
| Кадры и озвучка | `/var/lib/studio/media/films/<videoId>/scene_N.png\|mp3` |
| Референсы | `/var/lib/studio/media/refs/<userId>/<uuid>.png` |
| Переменные | `/etc/studio.env` (владелец root, группа studio, права 640) |
| Локальные копии | `/var/backups/studio/studio-<дата>.db.gz` |
| Служба | `systemctl status studio`, журнал `journalctl -u studio -f` |

Сборка на сервере не делается никогда: `next build` требует 1,5–2 ГБ, а на
тарифе Cloud 1-1-25 всего 1 ГБ. Собирает GitHub Actions, на сервер уезжает
готовый `standalone` (около 7 МБ) и запускается обычным `node server.js`.

Нативных модулей в проекте нет: база — встроенный в Node модуль `node:sqlite`.
Поэтому выпуск, собранный на runner-е, работает на сервере без пересборки.

## 1. Заказ сервера

- hoster.kz, **Cloud 1-1-25**: 1 vCPU, 1 ГБ RAM, 25 ГБ NVMe, 1 IP.
- Образ — **Ubuntu 24.04 LTS**, без панелей (ISPmanager/Plesk съедят половину памяти).
- Вход по SSH-ключу, пароль root отключить.

Что понадобится дальше: IP сервера, домен, доступ к Cloudflare.

## 2. Первичная настройка (один раз)

```bash
# с локальной машины
scp -r deploy root@<IP>:/root/deploy
ssh root@<IP> "bash /root/deploy/server-setup.sh studio.example.com"
```

Скрипт идемпотентный и делает всё сразу:

- пакеты, **Node 24 LTS**, nginx, sqlite3, ufw;
- swap 2 ГБ и `vm.swappiness=10` — страховка от OOM при всплесках;
- пользователь `studio`, каталоги `/var/www/studio` и `/var/lib/studio`;
- `/etc/studio.env` со сгенерированным `SESSION_SECRET`;
- служба `studio`, таймеры уборки (04:30) и бэкапа (03:30);
- правило sudo: `studio` может только перезапускать свою службу;
- конфиг nginx с доменом, `/media` прямо с диска, таймауты 600 с;
- ufw: SSH отовсюду, 80/443 — только с диапазонов Cloudflare.

Дальше вручную:

1. вписать в `/etc/studio.env` ключи: `OPENAI_API_KEY`, `ADMIN_EMAILS`,
   `RESEND_API_KEY` (или `SMTP_*`), при желании `SITE_PASSWORD`;
2. положить origin-сертификат Cloudflare в `/etc/ssl/cloudflare/origin.pem`
   и ключ в `origin.key`, затем `nginx -t && systemctl reload nginx`;
3. добавить публичный ключ деплоя в `/home/studio/.ssh/authorized_keys`.

## 3. Cloudflare

1. Домен в Cloudflare, запись `A` на IP сервера, **оранжевое облако** (proxy).
2. SSL/TLS → режим **Full (strict)**, выпустить **Origin Certificate** (15 лет)
   и положить его на сервер (пункт 2.2).
3. Security → WAF → Rate limiting: на `/api/auth/*` и `/api/admin/*` не больше
   10 запросов в минуту с адреса.
4. По желанию: Cloudflare Access → One-time PIN на `/admin` — второй замок
   поверх нашего входа по коду, бесплатно до 50 человек.

Реальный IP сервера после этого не виден: ufw пускает 80/443 только с
диапазонов Cloudflare, а nginx восстанавливает адрес посетителя из
`CF-Connecting-IP` (иначе все лимиты считали бы один адрес прокси).

Список диапазонов Cloudflare меняется редко; обновить правила:

```bash
sudo studio-cloudflare-ufw
```

## 4. Деплой

Секреты репозитория (Settings → Secrets and variables → Actions):

| Секрет | Значение |
| --- | --- |
| `SSH_HOST` | IP сервера |
| `SSH_USER` | `studio` |
| `SSH_KEY` | приватный ключ деплоя целиком |
| `SSH_PORT` | если SSH не на 22 |

Дальше каждый push в `main` запускает `.github/workflows/deploy.yml`:
`npm ci` → проверка типов → `next build` → архив выпуска → `scp` → `release.sh`
на сервере: распаковка, переключение симлинка `current`, `systemctl restart
studio`, проверка ответа `127.0.0.1:3000/api/site`, удаление старых выпусков
(хранятся пять последних).

Откат — вручную, за пару секунд:

```bash
ssh studio@<IP>
ls /var/www/studio/releases
ln -sfn /var/www/studio/releases/<старый-sha> /var/www/studio/current.new
mv -Tf /var/www/studio/current.new /var/www/studio/current
sudo systemctl restart studio
```

## 5. Обслуживание

```bash
systemctl status studio            # жива ли служба
journalctl -u studio -f            # живой журнал
journalctl -u studio-cleanup -n 50 # что стёр уборщик
systemctl list-timers | grep studio

sudo -u studio node /var/www/studio/current/scripts/cleanup.mjs --dry  # что удалит уборка
sudo studio-backup                                                     # копия прямо сейчас
sqlite3 /var/lib/studio/studio.db 'select status, count(*) from users group by 1;'
df -h /                                                                # место на диске
```

**Уборка** (таймер, 04:30). Кадры и озвучка фильмов старше `MEDIA_TTL_DAYS`
(30 дней) удаляются, в записи ставится `media_purged_at`. Текст сцен,
стоимость и статистика остаются навсегда. Заодно удаляются папки фильмов,
которых уже нет в базе, просроченные коды и журнал попыток старше недели.

**Бэкап** (таймер, 03:30). `sqlite3 .backup` на живой базе, gzip, семь
последних копий в `/var/backups/studio`. Если задан `BACKUP_REMOTE` и настроен
rclone — копия базы уезжает в Cloudflare R2, а медиа синхронизируются туда же
(инкрементально, не архивом).

Настройка R2 (10 ГБ бесплатно):

```bash
rclone config create r2 s3 provider=Cloudflare \
  access_key_id=<KEY> secret_access_key=<SECRET> \
  endpoint=https://<account>.r2.cloudflarestorage.com
echo 'BACKUP_REMOTE=r2:studio-backup' >> /etc/studio.env
sudo studio-backup
```

Проверка восстановления (делать сразу после первой копии):

```bash
systemctl stop studio
gunzip -c /var/backups/studio/studio-<дата>.db.gz > /var/lib/studio/studio.db
chown studio:studio /var/lib/studio/studio.db
systemctl start studio
```

## 6. Ёмкость диска

25 ГБ минус система ≈ 20 ГБ. Фильм на 15 минут — 30 кадров PNG (~2 МБ) плюс
MP3 128 кбит/с: около 70–80 МБ. Это ~260 фильмов одновременно, а с уборкой
через 30 дней предел практически не достигается. Текущий расход видно в
панели администратора («Медиа на диске») и по `df -h`.

## 7. Локальная разработка

```bash
cp .env.example .env.local     # достаточно SESSION_SECRET, OPENAI_API_KEY, ADMIN_EMAILS
npm install
npm run dev
```

Без `RESEND_API_KEY` и `SMTP_HOST` письма не отправляются, а печатаются в
консоль сервера — код входа видно прямо там. База и медиа лежат в `.data/`
рядом с проектом и в git не попадают.

> Путь проекта содержит `#` (`…/Nurtaskot#08`), из-за чего Next не собирается.
> Обход: `subst X: "C:\Users\oatmeal\Desktop\Nurtaskot#08"` и работать из `X:\`.
> На сервере такой проблемы нет.
