export const runtime = 'nodejs';

function parseTopics(url: string) {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get('topics') || '';
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const topics = parseTopics(req.url);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      send(`event: connected\ndata: ${JSON.stringify({ ok: true, topics })}\n\n`);
      send(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

      const interval = setInterval(() => {
        try {
          send(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
        } catch {
        }
      }, 20000);

      const abort = () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
        }
      };

      if ((req as any).signal?.aborted) abort();
      (req as any).signal?.addEventListener?.('abort', abort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

