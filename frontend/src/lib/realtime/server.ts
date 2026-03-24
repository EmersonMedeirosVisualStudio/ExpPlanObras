import type { RealtimeEventDTO, RealtimeTopic } from './types';
import { db } from '@/lib/db';
import { REALTIME_TOPIC_PERMISSIONS } from './permissions';

export function filterAllowedTopics(requested: string[], userPermissions: string[]): RealtimeTopic[] {
  const permSet = new Set(userPermissions);
  const out: string[] = [];
  for (const t of requested) {
    const req = REALTIME_TOPIC_PERMISSIONS[t] ?? [];
    if (!req.length || req.some((p) => permSet.has(p))) out.push(t);
  }
  return out as RealtimeTopic[];
}

export async function fetchEvents(args: {
  tenantId: number;
  lastId: number;
  topics: RealtimeTopic[];
  userId: number;
  permissions: string[];
  limit?: number;
}): Promise<RealtimeEventDTO[]> {
  if (!args.topics.length) return [];
  const topicsPlaceholders = args.topics.map(() => '?').join(',');

  const [rows]: any = await db.query(
    `
    SELECT
      id_realtime_evento AS id,
      topico AS topic,
      nome_evento AS name,
      payload_json AS payloadJson,
      alvo_tipo AS alvoTipo,
      alvo_valor AS alvoValor,
      criado_em AS createdAt
    FROM realtime_eventos
    WHERE tenant_id = ?
      AND id_realtime_evento > ?
      AND topico IN (${topicsPlaceholders})
      AND (expira_em IS NULL OR expira_em > NOW())
    ORDER BY id_realtime_evento ASC
    LIMIT ?
    `,
    [args.tenantId, args.lastId, ...args.topics, args.limit ?? 200]
  );

  const perms = new Set(args.permissions);
  const out: RealtimeEventDTO[] = [];
  for (const r of rows as any[]) {
    const alvoTipo = String(r.alvoTipo);
    const alvoValor = r.alvoValor === null || r.alvoValor === undefined ? null : String(r.alvoValor);
    if (alvoTipo === 'USER' && alvoValor !== String(args.userId)) continue;
    if (alvoTipo === 'PERMISSION' && (!alvoValor || !perms.has(alvoValor))) continue;
    out.push({
      id: Number(r.id),
      topic: String(r.topic) as RealtimeTopic,
      name: String(r.name),
      payload: r.payloadJson ? JSON.parse(String(r.payloadJson)) : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    });
  }
  return out;
}

