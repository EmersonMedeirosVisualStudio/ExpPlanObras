import { db } from '@/lib/db';
import type { PublishRealtimeEventInput } from './types';

export async function publishRealtimeEvent(input: PublishRealtimeEventInput): Promise<void> {
  const expiraEm =
    input.ttlSeconds && input.ttlSeconds > 0 ? new Date(Date.now() + input.ttlSeconds * 1000) : null;

  await db.execute(
    `
    INSERT INTO realtime_eventos (
      tenant_id, topico, nome_evento, alvo_tipo, alvo_valor,
      payload_json, referencia_tipo, referencia_id, expira_em
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.tenantId,
      input.topic,
      input.name,
      input.targetType,
      input.targetValue ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      input.referenciaTipo ?? null,
      input.referenciaId ?? null,
      expiraEm,
    ]
  );
}

export async function publishMenuRefreshForUser(tenantId: number, userId: number) {
  await publishRealtimeEvent({
    tenantId,
    topic: 'menu',
    name: 'menu.badges.refresh',
    targetType: 'USER',
    targetValue: String(userId),
    ttlSeconds: 60,
  });
}

export async function publishNotificationNewForUser(tenantId: number, userId: number, notificationId: number) {
  await publishRealtimeEvent({
    tenantId,
    topic: 'notifications',
    name: 'notification.new',
    targetType: 'USER',
    targetValue: String(userId),
    payload: { notificationId },
    ttlSeconds: 60,
  });
}

export async function publishNotificationReadForUser(tenantId: number, userId: number, notificationId: number) {
  await publishRealtimeEvent({
    tenantId,
    topic: 'notifications',
    name: 'notification.read',
    targetType: 'USER',
    targetValue: String(userId),
    payload: { notificationId },
    ttlSeconds: 60,
  });
}

export async function publishDashboardRefreshByPermission(
  tenantId: number,
  permission: string,
  topic: 'dashboard-rh' | 'dashboard-sst' | 'dashboard-suprimentos' | 'dashboard-engenharia' | 'dashboard-gerente' | 'dashboard-diretor' | 'dashboard-ceo',
  reason: string
) {
  await publishRealtimeEvent({
    tenantId,
    topic,
    name: 'dashboard.refresh',
    targetType: 'PERMISSION',
    targetValue: permission,
    payload: { reason },
    ttlSeconds: 60,
  });
}

