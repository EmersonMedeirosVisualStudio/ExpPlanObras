import { ok, fail, handleApiError } from '@/lib/api/http';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const url = new URL(req.url);
    const tenantId = Number(url.searchParams.get('tenantId') || 0);
    if (!tenantId) return fail(422, 'tenantId obrigatório');

    let execucoesRemovidas = 0;
    try {
      const [res]: any = await db.execute(
        `DELETE FROM automacoes_execucoes WHERE tenant_id = ? AND criado_em < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [tenantId]
      );
      execucoesRemovidas = Number(res?.affectedRows || 0);
    } catch {}

    let ocorrenciasCanceladas = 0;
    try {
      const [res]: any = await db.execute(
        `
        UPDATE automacoes_pendencias_ocorrencias
        SET status_ocorrencia = 'CANCELADA', atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
          AND status_ocorrencia IN ('ABERTA','ALERTADA','ESCALADA')
          AND ultima_deteccao_em < DATE_SUB(NOW(), INTERVAL 30 DAY)
        `,
        [tenantId]
      );
      ocorrenciasCanceladas = Number(res?.affectedRows || 0);
    } catch {}

    return ok({ status: 'ok', execucoesRemovidas, ocorrenciasCanceladas });
  } catch (e) {
    return handleApiError(e);
  }
}

