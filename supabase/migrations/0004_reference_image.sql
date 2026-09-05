-- Референс персонажа/объекта: картинка пользователя, по которой генерируются все кадры.
-- Применение: node scripts/apply-migration.mjs supabase/migrations/0004_reference_image.sql
alter table public.video_generations add column if not exists reference_url text;
alter table public.video_generations add column if not exists reference_analysis jsonb;
comment on column public.video_generations.reference_url is 'Публичный URL референса в video-assets/refs/<user>/…; NULL — без референса.';
comment on column public.video_generations.reference_analysis is 'Что увидел GPT-4o: subject, style, stylePrompt, subjectPrompt (англ.).';
