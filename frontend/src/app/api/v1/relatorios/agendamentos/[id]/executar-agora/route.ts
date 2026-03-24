import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { inserirExecucao } from '@/lib/modules/relatorios-agendados/server';
import { db } from '@/lib/db';
import { publishRealtimeEvent } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_EXECUTAR);
    const { id } = await context.params;
    const agendamentoId = Number(id);
    if (!Number.isFinite(agendamentoId)) return fail(400, 'ID inválido');

    const [[row]]: any = await db.query(
      `SELECT id_relatorio_agendamento AS id FROM relatorios_agendamentos WHERE tenant_id = ? AND id_relatorio_agendamento = ? LIMIT 1`,
      [current.tenantId, agendamentoId]
    );
    if (!row) return fail(404, 'Agendamento não encontrado');

    const execId = await inserirExecucao({ tenantId: current.tenantId, agendamentoId, manual: true, executorUserId: current.id });
    try {
      await publishRealtimeEvent({
        tenantId: current.tenantId,
        topic: 'relatorios',
        name: 'relatorio.execucao.changed',
        targetType: 'PERMISSION',
        targetValue: 'relatorios.agendados.view',
        payload: { agendamentoId, execucaoId: execId, status: 'PENDENTE' },
        ttlSeconds: 60,
      });
    } catch {}
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
