/**
 * Перегенерация всех демо-сэмплов голосов через ElevenLabs.
 * Приоритет модели — eleven_v3; multilingual_v2 только как запасной вариант,
 * тот же порядок, что и в /api/generate/audio.
 *
 *   node scripts/gen-voice-samples.mjs
 *
 * Требует ELEVENLABS_API_KEY в .env.local.
 */
import fs from "node:fs";

const VOICES = [
  {
    id: "s0phbFBBp708ZeIy8oGx",
    file: "arcadays_sample.mp3",
    name: "Arcadays (Аркадий)",
    text: "Город засыпал, не подозревая, что эта ночь изменит всё. Я стоял у окна и ждал сигнала.",
  },
  {
    id: "Jhqrj1kYppTq06Kj3KFa",
    file: "mishki_sample.mp3",
    name: "Mishki (Мишки)",
    text: "Она перечитала письмо трижды. Каждое слово било точно в цель — и назад дороги уже не было.",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    file: "kz_male_sample.mp3",
    name: "Ерлан (Ер адам)",
    text: "Дала тынып қалды. Алыстан естілген дыбыс бәрін өзгертетінін ол сол сәтте білген жоқ.",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    file: "kz_female_sample.mp3",
    name: "Айгерім (Әйел адам)",
    text: "Түн ортасында қала тынышталды. Бірақ бұл тыныштықтың ұзаққа созылмайтынын ешкім білмеді.",
  },
];

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

async function synth(voiceId, text, model) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    return { ok: false, status: res.status, body };
  }
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
}

let failed = 0;
for (const v of VOICES) {
  let r = await synth(v.id, v.text, "eleven_v3");
  let used = "eleven_v3";
  if (!r.ok) {
    console.warn(`  ${v.name}: eleven_v3 -> HTTP ${r.status} ${r.body}`);
    r = await synth(v.id, v.text, "eleven_multilingual_v2");
    used = "eleven_multilingual_v2";
  }
  if (!r.ok) {
    console.error(`FAIL ${v.name}: HTTP ${r.status} ${r.body}`);
    failed++;
    continue;
  }
  const out = `public/audio/samples/${v.file}`;
  fs.writeFileSync(out, r.buf);
  console.log(`OK  ${v.name.padEnd(22)} ${used.padEnd(22)} ${String(r.buf.length).padStart(7)} bytes -> ${v.file}`);
}
process.exit(failed ? 1 : 0);
