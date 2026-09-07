# Сервер: установка, деплой, обслуживание

Как устроено приложение целиком — `docs/PROJECT.md`. Здесь только сервер.

## Что где живёт

| Что | Где |
| --- | --- |
| Код выпуска | `/var/www/studio/releases/<sha>`, симлинк `/var/www/studio/current` |
| База (SQLite) | `/var/lib/studio/studio.db` |
| Кадры и озвучка | `/var/lib/studio/media/films/<videoId>/scene_N.jpg\|mp3` |
| Референсы | `/var/lib/studio/media/refs/<userId>/` |
| Переменные | `/etc/studio.env` (root:studio, 640) |
| Копии базы | `/var/backups/studio/studio-<дата>.db.gz` (7 последних) |
| Служба | `systemctl status studio`, журнал `journalctl -u studio -f` |

Сборка на сервере не делается никогда: `next build` требует 1,5–2 ГБ памяти, а
на сервере 1 ГБ. Собирает GitHub Actions, на сервер уезжает готовый `standalone`
(~7 МБ) и запускается `node server.js`. Нативных модулей нет — база на `node:sqlite`.

## Сервер и домен

- hoster.kz, Cloud 1-1-25 (1 vCPU, 1 ГБ, 25 ГБ NVMe), Ubuntu 24.04 без панелей.
  IP `89.207.249.30`. Вход только по SSH-ключу `~/.ssh/studio_admin`.
- Домен `innovasantehservis.kz` на ps.kz; DNS-зона в Plesk хостинга
  (srv-plesk54.ps.kz → «Сайты и домены → DNS»): `A @ → 89.207.249.30`, `www` CNAME на корень.
- TLS — Let's Encrypt (certbot), продлевается таймером, nginx перечитывает сертификат сам.

## Первичная настройка (один раз)

```bash
scp -r deploy root@<IP>:/root/deploy
scp ~/.ssh/studio_deploy.pub root@<IP>:/root/deploy/
ssh root@<IP> "DEPLOY_PUBKEY_FILE=/root/deploy/studio_deploy.pub bash /root/deploy/server-setup.sh innovasantehservis.kz"
```

Скрипт ставит пакеты и Node 24, swap 2 ГБ, пользователя `studio`, каталоги,
`/etc/studio.env` со сгенерированным `SESSION_SECRET`, службу и таймеры
уборки (04:30) и бэкапа (03:30), sudo только на перезапуск службы, ufw
(22/80/443), nginx и сертификат. Домен к этому моменту уже должен указывать на сервер.

После первого запуска: вписать в `/etc/studio.env` `ADMIN_EMAIL` и
`ADMIN_CODE_HASH` (`npm run hash-code -- "<код>"`), `systemctl restart studio`.
Вход по паролю в SSH отключён: `/etc/ssh/sshd_config.d/00-studio.conf`.

## Деплой

Секреты репозитория (Settings → Secrets and variables → Actions): `SSH_HOST` — IP,
`SSH_USER` — `studio`, `SSH_KEY` — приватный ключ деплоя целиком.

Каждый push в `main` → `.github/workflows/deploy.yml`: `npm ci` → типы → `next build`
→ архив → `scp` → `release.sh`: распаковка в `releases/<sha>`, переключение
`current`, `systemctl restart studio`, проверка `127.0.0.1:3000/api/health`,
хранятся пять последних выпусков. Около 4 минут; генерация, идущая в момент
перезапуска, оборвётся.

Откат:

```bash
ssh studio@<IP>
ls /var/www/studio/releases
ln -sfn /var/www/studio/releases/<старый-sha> /var/www/studio/current.new
mv -Tf /var/www/studio/current.new /var/www/studio/current
sudo systemctl restart studio
```

## Обслуживание

```bash
systemctl status studio
journalctl -u studio -f
systemctl list-timers | grep studio
sudo -u studio node /var/www/studio/current/scripts/cleanup.mjs --dry   # что удалит уборка
sudo studio-backup                                                       # копия базы сейчас
sqlite3 /var/lib/studio/studio.db 'select email, status from users;'
df -h /
```

**Уборка** (04:30): кадры и озвучка фильмов старше `MEDIA_TTL_DAYS` (30) стираются,
в записи ставится `media_purged_at`; текст сцен и стоимость остаются. Заодно —
папки фильмов, которых нет в базе, референсы старше суток, попытки входа старше
недели, сессии старше месяца.

**Бэкап** (03:30): `sqlite3 .backup` живой базы, gzip, семь копий в `/var/backups/studio`.
Медиа не копируется — кадры живут 30 дней. Восстановление — в шапке `deploy/backup.sh`.

## Место

25 ГБ минус система ≈ 20 ГБ. Фильм на 15 минут — 30 кадров JPEG (~0,5 МБ) плюс
MP3 128 кбит/с (~14 МБ): около 30 МБ. Это ~600 фильмов одновременно; с уборкой
через 30 дней предел практически не достигается. Расход виден в панели («Медиа на
диске») и по `df -h`.

## Локальная разработка

```bash
subst X: "C:\Users\oatmeal\Desktop\Nurtaskot#08"
```

Путь проекта содержит `#`, из-за которого Next не собирается — работаем через
букву диска. Дальше `X: && npm install && npm run dev`. В `.env.local` достаточно
`SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_CODE_HASH`. База и медиа — в `.data/`.
