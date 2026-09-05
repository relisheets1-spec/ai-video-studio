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
 *   node scripts/gen-voice-samples.mjs --prune    # удалить сэмплы, которых нет в каталоге
 *
 * Ключ: переменная окружения ELEVENLABS_API_KEY (в .env.local ключа больше нет —
 * озвучка идёт с ключей пользователей). Модель — только та, что в каталоге
 * (Eleven v3); запасных моделей нет ни здесь, ни в бою.
 */
import fs from "node:fs";
import path from "node:path";

const CATALOG = JSON.parse(
  fs.readFileSync(new URL("../src/lib/content/voices.data.json", import.meta.url), "utf8")
);

const args = process.argv.slice(2);
const forceAll = args.includes("--all");
const prune = args.includes("--prune");
const langArg = args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length);

let key = process.env.ELEVENLABS_API_KEY?.trim() || "";
if (!key && fs.existsSync(".env.local")) {
  key =
    fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("ELEVENLABS_API_KEY="))
      ?.slice("ELEVENLABS_API_KEY=".length)
      .trim() || "";
}
if (!key) {
  console.error("Нужен ELEVENLABS_API_KEY в окружении");
  process.exit(1);
}

const OUT_DIR = "public/audio/samples";
fs.mkdirSync(OUT_DIR, { recursive: true });

async function synth(voiceId, text, model) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: CATALOG.settings[model] || CATALOG.settings.eleven_v3,
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 200) };
  }
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()), requestId: res.headers.get("request-id") };
}

if (prune) {
  const keep = new Set(CATALOG.voices.map((v) => v.previewFile));
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!keep.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
      console.log(`RM  ${f}`);
    }
  }
}

let failed = 0;
let skipped = 0;
let chars = 0;

for (const v of CATALOG.voices) {
  if (langArg && v.lang !== langArg) continue;

  const out = path.join(OUT_DIR, v.previewFile);
  if (!forceAll && fs.existsSync(out)) {
    skipped++;
    continue;
  }

  // Модель выбирается по языку — ровно как в /api/generate/audio.
  const model = CATALOG.models[v.lang] || "eleven_v3";
  const r = await synth(v.id, v.sampleText, model);
  if (!r.ok) {
    console.error(`FAIL ${v.name}: HTTP ${r.status} ${r.body}`);
    failed++;
    continue;
  }

  fs.writeFileSync(out, r.buf);
  chars += v.sampleText.length;
  console.log(
    `OK  ${v.name.padEnd(12)} ${v.lang}  ${model.padEnd(12)} ${String(r.buf.length).padStart(7)} bytes  ${String(v.sampleText.length).padStart(4)} chars  req=${r.requestId} -> ${v.previewFile}`
  );
}

if (skipped) console.log(`(пропущено уже существующих: ${skipped}; --all чтобы перегенерировать)`);
console.log(`Символов отправлено: ${chars}`);
process.exit(failed ? 1 : 0);
