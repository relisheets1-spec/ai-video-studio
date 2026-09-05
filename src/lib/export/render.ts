import type { Scene } from "@/lib/types";
import {
  estimateSceneSeconds,
  wrapLines,
  cueIndexAt,
  SUBTITLE_BG,
  SUBTITLE_FG,
  SUBTITLE_SHADOW,
  type Cue,
  type SubtitleLayout,
} from "@/lib/subtitles";

/**
 * Чистые функции отрисовки кадра экспорта. Их используют и WebCodecs-путь,
 * и запасной MediaRecorder-путь, поэтому оба файла рисуют одинаковые пиксели.
 *
 * ВНИМАНИЕ: цвета здесь запекаются в файл и НЕ должны зависеть от темы.
 */

export interface LoadedAsset {
  img: HTMLImageElement;
  audioBuffer: AudioBuffer;
  durationSec: number;
  scene: Scene;
}

export interface CueBox {
  lines: string[];
  cardW: number;
  cardH: number;
  cardX: number;
  cardY: number;
}

/** Кроссфейд между кадрами и амплитуда наезда — одни и те же в превью и в файле. */
export const XFADE_SEC = 0.5;
export const KEN_BURNS_ZOOM = 0.05;

export const EXPORT_BG = "#0A0B0E";

export async function loadAssets(
  scenes: Scene[],
  audioCtx: BaseAudioContext,
  sampleRate: number
): Promise<LoadedAsset[]> {
  return Promise.all(
    scenes.map(async (scene, idx) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const imgPromise = new Promise<HTMLImageElement>((resolve) => {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = scene.imageUrl || "";
      });

      let audioBuffer: AudioBuffer | null = null;
      let durationSec = scene.durationEstimate || estimateSceneSeconds(scene.narration);
      if (scene.audioUrl) {
        try {
          const res = await fetch(scene.audioUrl);
          const arr = await res.arrayBuffer();
          audioBuffer = await audioCtx.decodeAudioData(arr);
          durationSec = audioBuffer.duration;
        } catch (e) {
          console.warn("Audio load error scene", idx, e);
        }
      }

      if (!audioBuffer) {
        const sampleCount = Math.max(1, Math.round(durationSec * sampleRate));
        audioBuffer = audioCtx.createBuffer(2, sampleCount, sampleRate);
      }

      return { img: await imgPromise, audioBuffer, durationSec, scene };
    })
  );
}

/** Разметка реплик считается один раз на сцену, а не на каждый кодируемый кадр. */
export function buildCueBoxes(
  ctx: CanvasRenderingContext2D,
  layout: SubtitleLayout,
  cues: Cue[],
  W: number,
  H: number
): CueBox[] {
  ctx.font = layout.fontCss;
  const measure = (str: string) => ctx.measureText(str).width;
  return cues.map((cue) => {
    const lines = wrapLines(cue.text, layout.maxTextW, measure);
    const widest = lines.reduce((max, line) => Math.max(max, measure(line)), 0);
    const cardW = Math.min(layout.maxCardW, widest + layout.padX * 2);
    const cardH = lines.length * layout.lineHeight + layout.padY * 2;
    return {
      lines,
      cardW,
      cardH,
      cardX: (W - cardW) / 2,
      cardY: H - layout.bottom - cardH,
    };
  });
}

/** Наезд чередуется по чётности кадра: вперёд, назад, вперёд — иначе все кадры «дышат» одинаково. */
export function zoomAt(sceneIndex: number, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  return sceneIndex % 2 === 0 ? 1 + p * KEN_BURNS_ZOOM : 1 + KEN_BURNS_ZOOM - p * KEN_BURNS_ZOOM;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  zoom: number
): void {
  if (!(img.complete && img.naturalWidth > 0)) return;
  // Вписывание по короткой стороне (cover), а не растяжение под холст:
  // gpt-image-1-mini отдаёт 3:2 / 2:3, поэтому растяжение исказило бы кадр.
  // То же правило даёт корректный центр-кроп при экспорте 16:9 в 9:16.
  const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const scale = cover * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export interface FrameParams {
  W: number;
  H: number;
  layout: SubtitleLayout;
  asset: LoadedAsset;
  prevAsset: LoadedAsset | null;
  sceneIndex: number;
  elapsedSec: number;
  durationSec: number;
  cues: Cue[];
  cueBoxes: CueBox[];
}

export function drawSceneFrame(ctx: CanvasRenderingContext2D, p: FrameParams): void {
  const { W, H, layout } = p;
  const progress = p.durationSec > 0 ? p.elapsedSec / p.durationSec : 0;
  const zoom = zoomAt(p.sceneIndex, progress);

  ctx.fillStyle = EXPORT_BG;
  ctx.fillRect(0, 0, W, H);

  if (p.sceneIndex > 0 && p.prevAsset && p.elapsedSec < XFADE_SEC) {
    // Первые полсекунды новый кадр проявляется поверх предыдущего —
    // жёсткая склейка читалась как слайд-шоу.
    drawCover(ctx, p.prevAsset.img, W, H, zoomAt(p.sceneIndex - 1, 1));
    ctx.globalAlpha = Math.max(0, Math.min(1, p.elapsedSec / XFADE_SEC));
    drawCover(ctx, p.asset.img, W, H, zoom);
    ctx.globalAlpha = 1;
  } else {
    drawCover(ctx, p.asset.img, W, H, zoom);
  }

  // Нижняя шторка — те же пропорции, что и в превью
  const gradient = ctx.createLinearGradient(0, H - layout.scrimH, 0, H);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.72)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, H - layout.scrimH, W, layout.scrimH);

  const activeCue = cueIndexAt(p.cues, p.elapsedSec);
  const box = activeCue >= 0 ? p.cueBoxes[activeCue] : null;
  if (!box || box.lines.length === 0) return;

  ctx.save();
  // Подложка без обводки: 1.5px stroke по roundRect давал рваные скругления.
  ctx.fillStyle = SUBTITLE_BG;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(box.cardX, box.cardY, box.cardW, box.cardH, layout.radius);
  } else {
    ctx.rect(box.cardX, box.cardY, box.cardW, box.cardH);
  }
  ctx.fill();

  ctx.font = layout.fontCss;
  ctx.fillStyle = SUBTITLE_FG;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = SUBTITLE_SHADOW;
  ctx.shadowBlur = layout.shadowBlur;
  ctx.shadowOffsetY = layout.shadowOffsetY;

  for (let lIdx = 0; lIdx < box.lines.length; lIdx++) {
    const baselineY = box.cardY + layout.padY + layout.lineHeight * (lIdx + 0.5);
    ctx.fillText(box.lines[lIdx], W / 2, baselineY);
  }
  ctx.restore();
}
