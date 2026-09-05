-- Учёт стоимости фильма и черновик сценария между этапами генерации.
-- Применение: node scripts/apply-migration.mjs supabase/migrations/0003_video_cost.sql
-- Идемпотентно.

-- Фактическая стоимость по usage провайдеров (форма VideoCost — src/lib/pricing.ts).
-- NULL — видео сделано до учёта стоимости; интерфейс такие строки не трогает.
alter table public.video_generations add column if not exists cost jsonb;
comment on column public.video_generations.cost is
  'VideoCost v1: llm / images / tts с usage и USD по трём сценариям ElevenLabs.';

-- Черновик между этапами: план + монолог + usage первого этапа. Сценарий на
-- 15 минут не укладывается в один вызов функции, поэтому генерация идёт в два
-- запроса, а состояние живёт в строке.
alter table public.video_generations add column if not exists draft jsonb;

-- Сумма по основному сценарию — для быстрых выборок в админке без разбора jsonb.
alter table public.video_generations
  add column if not exists total_usd numeric(10, 4)
  generated always as ((cost ->> 'totalUsd')::numeric) stored;
