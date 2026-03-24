import { handleApiError, fail } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { db } from '@/lib/db';
import { filterAllowedTopics, fetchEvents } from '@/lib/realtime/server';
import type { RealtimeTopic } from '@/lib/realtime/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sseEncode(id: number, event: string, data: any) {
  const enc = new TextEncoder();
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return enc.encode(`id: ${id}\nevent: ${event}\ndata: ${payload}\n\n`);
}

async function getLatestEventId(tenantId: number): Promise<number> {
  try {
    const [[row]]: any = await db.query(
      `SELECT COALESCE(MAX(id_realtime_evento), 0) AS id FROM realtime_eventos WHERE tenant_id = ?`,
      [tenantId]
    );
    return Number(row?.id || 0);
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const url = new URL(req.url);
    const requestedTopics = (url.searchParams.get('topics') || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const allowedTopics = filterAllowedTopics(requestedTopics, user.permissoes as unknown as string[]);

    if (!allowedTopics.length) return fail(403, 'Sem tópicos permitidos.');

    const lastEventHeader = req.headers.get('last-event-id');
    let lastId = lastEventHeader ? Number(lastEventHeader) : NaN;
    if (!Number.isFinite(lastId)) {
      lastId = await getLatestEventId(user.tenantId);
    }

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(sseEncode(lastId, 'connected', { ts: Date.now() }));

        const abort = new AbortController();
        const signal = abort.signal;
        const te = setInterval(() => {
          if (signal.aborted) return;
          controller.enqueue(sseEncode(lastId, 'heartbeat', { ts: Date.now() }));
        }, 20000);

        try {
          while (!signal.aborted) {
            const events = await fetchEvents({
              tenantId: user.tenantId,
              lastId,
              topics: allowedTopics as RealtimeTopic[],
              userId: user.id,
              permissions: user.permissoes as unknown as string[],
              limit: 200,
            });
            if (events.length) {
              for (const ev of events) {
                controller.enqueue(sseEncode(ev.id, ev.name, { id: ev.id, topic: ev.topic, payload: ev.payload, createdAt: ev.createdAt }));
                lastId = ev.id;
              }
            }
            await new Promise((r) => setTimeout(r, 2500));
          }
        } catch {
        } finally {
          clearInterval(te);
          controller.close();
        }
      },
      cancel() {},
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

