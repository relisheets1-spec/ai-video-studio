import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { MEDIA_ROOT } from "./env";

/**
 * Файлы на диске сервера.
 *
 *   <MEDIA_ROOT>/films/<videoId>/scene_1.png | scene_1.mp3
 *   <MEDIA_ROOT>/refs/<userId>/<uuid>.png
 *
 * Наружу они уходят ссылками /media/... — в production их отдаёт nginx
 * напрямую с диска, в разработке тот же путь обслуживает роут src/app/media.
 */

export const MEDIA_PREFIX = "/media/";

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

export const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
};

/** Проверяет относительный путь и превращает его в абсолютный. null — путь недопустим. */
export function resolveMedia(rel: string): string | null {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  if (parts[0] !== "films" && parts[0] !== "refs") return null;
  if (!parts.every((p) => SEGMENT_RE.test(p) && p !== "." && p !== "..")) return null;
  return path.join(MEDIA_ROOT, ...parts);
}

export function relFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return null;
  const rel = url.slice(MEDIA_PREFIX.length).split("?")[0];
  return resolveMedia(rel) ? rel : null;
}

async function write(rel: string, data: Buffer): Promise<string> {
  const abs = resolveMedia(rel);
  if (!abs) throw new Error(`Недопустимый путь файла: ${rel}`);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, data);
  return MEDIA_PREFIX + rel;
}

/** Кадр фильма: звук или картинка. Возвращает публичную ссылку. */
export function saveSceneAudio(videoId: string, sceneId: number, data: Buffer): Promise<string> {
  return write(`films/${videoId}/scene_${sceneId}.mp3`, data);
}

export function saveSceneImage(videoId: string, sceneId: number, data: Buffer): Promise<string> {
  return write(`films/${videoId}/scene_${sceneId}.png`, data);
}

export async function saveReference(userId: string, ext: string, data: Buffer): Promise<string> {
  return write(`refs/${userId}/${crypto.randomUUID()}.${ext}`, data);
}

/** Байты файла по публичной ссылке /media/... — для отправки референса в OpenAI. */
export async function readMediaByUrl(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const rel = relFromUrl(url);
  const abs = rel ? resolveMedia(rel) : null;
  if (!abs) return null;
  try {
    const data = await fsp.readFile(abs);
    return { data, contentType: CONTENT_TYPES[path.extname(abs).toLowerCase()] || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Ссылка принадлежит папке этого пользователя — защита от чужих референсов. */
export function isOwnReference(url: string, userId: string): boolean {
  const rel = relFromUrl(url);
  return !!rel && rel.startsWith(`refs/${userId}/`);
}

export function filmDir(videoId: string): string | null {
  return SEGMENT_RE.test(videoId) ? path.join(MEDIA_ROOT, "films", videoId) : null;
}

/** Удаляет картинки и звук фильма. Текст сцен и стоимость живут в базе и остаются. */
export async function deleteFilmMedia(videoId: string): Promise<boolean> {
  const dir = filmDir(videoId);
  if (!dir) return false;
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function mediaDiskUsage(): { films: number; bytes: number } {
  const root = path.join(MEDIA_ROOT, "films");
  let bytes = 0;
  let films = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { films: 0, bytes: 0 };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    films++;
    let files: string[] = [];
    try {
      files = fs.readdirSync(path.join(root, entry.name));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        bytes += fs.statSync(path.join(root, entry.name, file)).size;
      } catch {
        // файл исчез между чтением каталога и статом — не считаем
      }
    }
  }
  return { films, bytes };
}
