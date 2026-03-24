import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { cancelNotificationEmail } from '@/lib/notifications/email/service';

export const runtime = 'nodejs';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.NOTIFICACOES_EMAIL_FILA_REPROCESSAR);
    const { id } = await context.params;
    const jobId = Number(id);
    if (!Number.isFinite(jobId)) return ok(null);
    await cancelNotificationEmail({ tenantId: current.tenantId, jobId });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

