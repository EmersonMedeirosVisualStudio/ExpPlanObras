import { handleApiError, ok, fail } from '@/lib/api/http';
import { db } from '@/lib/db';
import { enqueueDigestEmailForUser } from '@/lib/notifications/email/service';

export const runtime = 'nodejs';

function ymd() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const [rows]: any = await db.query(
      `
      SELECT DISTINCT tenant_id AS tenantId, id_usuario AS userId
      FROM notificacoes_preferencias_usuario
      WHERE ativo = 1 AND recebe_email = 1 AND modo_email = 'DIGESTO_DIARIO'
      `
    );

    for (const r of rows as any[]) {
      const tenantId = Number(r.tenantId);
      const userId = Number(r.userId);
      if (!tenantId || !userId) continue;
      await enqueueDigestEmailForUser({
        tenantId,
        userId,
        templateKey: 'DIGESTO_DIARIO',
        dedupeKey: `email.digesto.diario.usuario.${userId}.data.${ymd()}`,
      });
    }

    return ok({ status: 'ok', total: (rows as any[]).length });
  } catch (e) {
    return handleApiError(e);
  }
}

