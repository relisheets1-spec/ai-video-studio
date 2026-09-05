-- Доступ по почте: регистрация юзеров (почта + инвайт-код + ключ ElevenLabs),
-- одобрение админом, админы по почте. Идемпотентно — можно применять повторно.
--
-- Применение: node scripts/apply-migration.mjs supabase/migrations/0002_email_auth_admins.sql
-- (Management API Supabase; прошлое утверждение «DDL недоступен» было неверным.)

-- ===== 0001 (в базе применена не была) =====
alter table public.access_codes add column if not exists frozen_until timestamptz;
comment on column public.access_codes.frozen_until is
  'До этого момента вход и API отклоняются. NULL — заморозки нет. 9999-12-31 — бессрочно.';

create table if not exists public.pipeline_errors (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid,
  user_id     uuid,
  stage       text not null check (stage in ('llm','tts','image','render','auth')),
  provider    text,
  message     text not null,
  http_status integer,
  created_at  timestamptz not null default now()
);
create index if not exists pipeline_errors_created_at_idx on public.pipeline_errors (created_at desc);
create index if not exists pipeline_errors_stage_idx      on public.pipeline_errors (stage, created_at desc);

-- ===== 1. access_codes: почта, зашифрованный ключ, момент регистрации, статусы =====
alter table public.access_codes
  add column if not exists email              text,
  add column if not exists elevenlabs_key_enc text,
  add column if not exists claimed_at         timestamptz;

comment on column public.access_codes.email is 'Почта пользователя, хранится в нижнем регистре.';
comment on column public.access_codes.elevenlabs_key_enc is 'Ключ ElevenLabs, AES-256-GCM (см. src/lib/crypto.ts).';
comment on column public.access_codes.claimed_at is 'Когда инвайт-код был занят регистрацией.';

create unique index if not exists access_codes_email_lower_uidx
  on public.access_codes (lower(email)) where email is not null;

alter table public.access_codes drop constraint if exists access_codes_status_check;
alter table public.access_codes add constraint access_codes_status_check
  check (status in ('invited','pending','approved','rejected','blocked'));
alter table public.access_codes alter column status set default 'invited';

-- ===== 2. Перенос заморозок из system_settings в колонку =====
update public.access_codes a
   set frozen_until = case when s.value = 'forever'
                           then timestamptz '9999-12-31 00:00:00+00'
                           else s.value::timestamptz end
  from public.system_settings s
 where s.key = 'freeze:' || a.id::text;
delete from public.system_settings where key like 'freeze:%';

-- ===== 3. login_attempts: раздельные лимиты по типу попытки =====
alter table public.login_attempts
  add column if not exists kind  text not null default 'login',
  add column if not exists email text;
create index if not exists login_attempts_ip_kind_time_idx
  on public.login_attempts (ip, kind, created_at desc);

-- ===== 4. Администраторы =====
create table if not exists public.admins (
  email        text primary key check (email = lower(btrim(email))),
  is_primary   boolean not null default false,
  appointed_by text,
  created_at   timestamptz not null default now()
);
create unique index if not exists admins_single_primary_uidx
  on public.admins (is_primary) where is_primary;
insert into public.admins (email, is_primary) values ('reli.sheets1@gmail.com', true)
  on conflict (email) do update set is_primary = true;

-- ===== 5. Существующая запись владельца: привязать к почте, чтобы архив из видео остался доступен =====
update public.access_codes
   set email      = 'reli.sheets1@gmail.com',
       user_name  = 'Администратор',
       claimed_at = coalesce(claimed_at, now())
 where secret_code = 'VIP-STUDIO-2026' and email is null;

-- ===== 6. Эпоха админ-сессий: bump при смене пароля инвалидирует выданные токены =====
insert into public.system_settings (key, value) values ('admin_session_epoch', '1')
  on conflict (key) do nothing;
