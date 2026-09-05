/**
 * Выбор движка экспорта.
 *
 * WebCodecs — основной путь (быстрый офлайн-рендер в MP4). Раньше проверка
 * сводилась к наличию VideoEncoder, а при неподдерживаемом кодеке цикл молча
 * брал первый из списка и падал уже в configure. Теперь движок считается
 * доступным только если и видео-, и аудиоконфиг реально поддержаны.
 */

export type ExportEngine = "webcodecs" | "mediarecorder" | "none";

export const AVC_CODECS = ["avc1.4d002a", "avc1.64002a", "avc1.420034", "avc1.420028"];

export const RECORDER_MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export interface EngineInfo {
  engine: ExportEngine;
  codec?: string;
  mime?: string;
}

export async function pickAvcCodec(
  width: number,
  height: number,
  bitrate: number,
  framerate: number
): Promise<string | null> {
  if (typeof window === "undefined" || !("VideoEncoder" in window)) return null;
  for (const codec of AVC_CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (support?.supported) return codec;
    } catch {}
  }
  return null;
}

async function aacSupported(sampleRate: number): Promise<boolean> {
  if (typeof window === "undefined" || !("AudioEncoder" in window)) return false;
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate,
      bitrate: 128_000,
    });
    return !!support?.supported;
  } catch {
    return false;
  }
}

export function pickRecorderMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  for (const mime of RECORDER_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return null;
}

export function recorderAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as any).captureStream === "function"
  );
}

export async function detectExportEngine(
  width: number,
  height: number,
  bitrate: number,
  framerate: number,
  sampleRate: number
): Promise<EngineInfo> {
  const codec = await pickAvcCodec(width, height, bitrate, framerate);
  if (codec && (await aacSupported(sampleRate))) {
    return { engine: "webcodecs", codec };
  }
  if (recorderAvailable()) {
    const mime = pickRecorderMime();
    if (mime) return { engine: "mediarecorder", mime };
  }
  return { engine: "none" };
}
