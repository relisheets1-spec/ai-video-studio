/**
 * Перегенерация демо-сэмплов голосов через ElevenLabs.
 *
 * Каталог, модели и настройки читаются из src/lib/content/voices.data.json —
 * того же файла, что использует рантайм. Раньше список голосов и настройки
 * синтеза были продублированы прямо здесь, причём с БОЛЕЕ богатыми
 * параметрами, чем в бою: пользователь слушал одно, а в ролике получал другое.
 *
 *   node scripts/gen-voice-samples.mjs            # только недостающие
 *   node scripts/gen-voice-samples.mjs --all      # перегенерировать все
 *   node scripts/gen-voice-samples.mjs --lang=en  # только один язык
 *
 * Требует ELEVENLABS_API_KEY в .env.local.
 */
import fs from "node:fs";
import path from "node:path";

const CATALOG = JSON.parse(
  fs.readFileSync(new URL("../src/lib/content/voices.data.json", import.meta.url), "utf8")
);

const args = process.argv.slice(2);
const forceAll = args.includes("--all");
const langArg = args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length);

const env = fs.readFileSync(".env.local", "utf8");
const key = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("ELEVENLABS_API_KEY="))
  ?.slice("ELEVENLABS_API_KEY=".length)
  .trim();

if (!key) {
  console.error("ELEVENLABS_API_KEY нет в .env.local");
  process.exit(1);
}

const OUT_DIR = "public/audio/samples";
fs.mkdirSync(OUT_DIR, { recursive: true });

async function synth(voiceId, text, model) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: CATALOG.settings[model] || CATALOG.settings.eleven_multilingual_v2,
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 200) };
  }
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
}

let failed = 0;
let skipped = 0;

for (const v of CATALOG.voices) {
  if (langArg && v.lang !== langArg) continue;

  const out = path.join(OUT_DIR, v.previewFile);
  if (!forceAll && fs.existsSync(out)) {
    skipped++;
    continue;
  }

  // Модель выбирается по языку — ровно как в /api/generate/audio.
  const model = CATALOG.models[v.lang] || "eleven_multilingual_v2";
  let r = await synth(v.id, v.sampleText, model);
  let used = model;

  // Единственный запасной вариант: если для языка выбран v3, а он аккаунту
  // недоступен. Молча подменять модель в бою нельзя — там это давало
  // слышимую смену тембра посреди ролика, — но для превью это допустимо.
  if (!r.ok && model === "eleven_v3") {
    console.warn(`  ${v.name}: ${model} -> HTTP ${r.status} ${r.body}`);
    r = await synth(v.id, v.sampleText, "eleven_multilingual_v2");
    used = "eleven_multilingual_v2";
  }

  if (!r.ok) {
    console.error(`FAIL ${v.name}: HTTP ${r.status} ${r.body}`);
    failed++;
    continue;
  }

  fs.writeFileSync(out, r.buf);
  console.log(
    `OK  ${v.name.padEnd(12)} ${v.lang}  ${used.padEnd(24)} ${String(r.buf.length).padStart(7)} bytes -> ${v.previewFile}`
  );
}

if (skipped) console.log(`(пропущено уже существующих: ${skipped}; --all чтобы перегенерировать)`);
process.exit(failed ? 1 : 0);
