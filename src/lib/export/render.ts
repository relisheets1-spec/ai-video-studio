import type { Scene } from "@/lib/types";
import {
  estimateSceneSeconds,
  wrapLines,
  cueIndexAt,
  SUBTITLE_FG,
  SUBTITLE_OUTLINE,
  SUBTITLE_SHADOW,
  type Cue,
  type SubtitleLayout,
} from "@/lib/subtitles";
import { kenBurnsAt, kenBurnsPreset, type KenBurnsState } from "@/lib/kenburns";

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

/** Кроссфейд между кадрами — тот же, что в превью (XFADE_MS в плеере). */
export const XFADE_SEC = 0.5;

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

/** Ken Burns: состояние картинки в момент progress ∈ [0, 1] сцены (пресет по индексу). */
export function motionAt(sceneIndex: number, progress: number): KenBurnsState {
  return kenBurnsAt(kenBurnsPreset(sceneIndex), progress);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  motion: KenBurnsState
): void {
  if (!(img.complete && img.naturalWidth > 0)) return;
  // Вписывание по короткой стороне (cover), а не растяжение под холст:
  // gpt-image-1-mini отдаёт 3:2 / 2:3, поэтому растяжение исказило бы кадр.
  // То же правило даёт корректный центр-кроп при экспорте 16:9 в 9:16.
  // Поверх — Ken Burns: масштаб от центра и сдвиг в долях кадра, как
  // translate(x, y) scale(s) в плеере.
  const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const scale = cover * motion.scale;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2 + motion.x * W, (H - dh) / 2 + motion.y * H, dw, dh);
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
  /** Цвет текста субтитров (hex); обводка всегда чёрная. */
  subtitleColor?: string;
}

export function drawSceneFrame(ctx: CanvasRenderingContext2D, p: FrameParams): void {
  const { W, H, layout } = p;
  const progress = p.durationSec > 0 ? p.elapsedSec / p.durationSec : 0;
  const motion = motionAt(p.sceneIndex, progress);

  ctx.fillStyle = EXPORT_BG;
  ctx.fillRect(0, 0, W, H);

  if (p.sceneIndex > 0 && p.prevAsset && p.elapsedSec < XFADE_SEC) {
    // Первые полсекунды новый кадр проявляется поверх предыдущего —
    // жёсткая склейка читалась как слайд-шоу.
    drawCover(ctx, p.prevAsset.img, W, H, motionAt(p.sceneIndex - 1, 1));
    ctx.globalAlpha = Math.max(0, Math.min(1, p.elapsedSec / XFADE_SEC));
    drawCover(ctx, p.asset.img, W, H, motion);
    ctx.globalAlpha = 1;
  } else {
    drawCover(ctx, p.asset.img, W, H, motion);
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

  // Подложки нет: цветной текст с чёрной обводкой, как на YouTube.
  ctx.save();
  ctx.font = layout.fontCss;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = layout.strokeW * 2;
  ctx.strokeStyle = SUBTITLE_OUTLINE;
  const fill = p.subtitleColor || SUBTITLE_FG;

  for (let lIdx = 0; lIdx < box.lines.length; lIdx++) {
    const baselineY = box.cardY + layout.padY + layout.lineHeight * (lIdx + 0.5);
    ctx.shadowColor = SUBTITLE_SHADOW;
    ctx.shadowBlur = layout.shadowBlur;
    ctx.shadowOffsetY = layout.shadowOffsetY;
    ctx.strokeText(box.lines[lIdx], W / 2, baselineY);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = fill;
    ctx.fillText(box.lines[lIdx], W / 2, baselineY);
  }
  ctx.restore();
}
