import { handleApiError, ok, fail } from '@/lib/api/http';
import { db } from '@/lib/db';
import { enqueueDigestEmailForUser } from '@/lib/notifications/email/service';

export const runtime = 'nodejs';

function isoWeekKey(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, '0')}`;
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
      WHERE ativo = 1 AND recebe_email = 1 AND modo_email = 'DIGESTO_SEMANAL'
      `
    );

    const wk = isoWeekKey(new Date());
    for (const r of rows as any[]) {
      const tenantId = Number(r.tenantId);
      const userId = Number(r.userId);
      if (!tenantId || !userId) continue;
      await enqueueDigestEmailForUser({
        tenantId,
        userId,
        templateKey: 'DIGESTO_SEMANAL',
        dedupeKey: `email.digesto.semanal.usuario.${userId}.semana.${wk}`,
      });
    }

    return ok({ status: 'ok', total: (rows as any[]).length });
  } catch (e) {
    return handleApiError(e);
  }
}

