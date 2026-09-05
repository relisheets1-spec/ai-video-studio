-- Схема этого проекта создавалась вручную в консоли Supabase: в репозитории
-- не было ни одного SQL-файла. Заводим каталог миграций, чтобы изменения
-- можно было воспроизвести.
--
-- Все изменения аддитивные: существующие колонки не трогаются, поэтому
-- старый код продолжает работать и после применения.

-- 1. Временная заморозка аккаунта.
-- Статус "blocked" в access_codes уже проверялся при входе, но ни одно
-- действие админки его не выставляло, и срока у блокировки не было.
alter table public.access_codes
  add column if not exists frozen_until timestamptz;

comment on column public.access_codes.frozen_until is
  'До этого момента вход по коду отклоняется. NULL — заморозки нет.';

-- 2. Лог ошибок по этапам пайплайна.
-- Раньше все 21 путь отказа делали только console.error, поля status="failed"
-- и error_message в video_generations не писались НИ РАЗУ, и упавшая
-- генерация навсегда оставалась в статусе generating_script.
create table if not exists public.pipeline_errors (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid,
  user_id     uuid,
  stage       text not null check (stage in ('llm', 'tts', 'image', 'render', 'auth')),
  provider    text,
  message     text not null,
  http_status integer,
  created_at  timestamptz not null default now()
);

create index if not exists pipeline_errors_created_at_idx
  on public.pipeline_errors (created_at desc);
create index if not exists pipeline_errors_stage_idx
  on public.pipeline_errors (stage, created_at desc);

comment on table public.pipeline_errors is
  'Отказы генерации по этапам: LLM, озвучка, картинки, рендер.';
