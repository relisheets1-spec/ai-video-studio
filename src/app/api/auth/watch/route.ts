import { NextRequest } from "next/server";
import { onKick } from "@/lib/kick";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE-поток для открытой студии: молчит, пока всё хорошо, шлёт `kick`, когда
 * администратор отозвал доступ. Комментарий-пинг раз в 25 секунд держит
 * соединение живым через nginx.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      const stop = onKick(userId, () => {
        send("event: kick\ndata: {}\n\n");
        cleanup();
      });
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        stop();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
      send(": connected\n\n");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
