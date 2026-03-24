import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { calcularProximaExecucao } from '@/lib/modules/relatorios-agendados/server';
import { publishRealtimeEvent } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_CRUD);
    const { id } = await context.params;
    const agendamentoId = Number(id);
    if (!Number.isFinite(agendamentoId)) return fail(400, 'ID inválido');

    const body = (await req.json().catch(() => null)) as { acao?: 'ATIVAR' | 'PAUSAR' } | null;
    const acao = body?.acao;
    if (acao !== 'ATIVAR' && acao !== 'PAUSAR') return fail(422, 'Ação inválida');

    const [[row]]: any = await db.query(
      `
      SELECT
        id_relatorio_agendamento AS id,
        recorrencia,
        horario_execucao AS horarioExecucao,
        timezone,
        dia_semana AS diaSemana,
        dia_mes AS diaMes
      FROM relatorios_agendamentos
      WHERE tenant_id = ? AND id_relatorio_agendamento = ?
      LIMIT 1
      `,
      [current.tenantId, agendamentoId]
    );
    if (!row) return fail(404, 'Agendamento não encontrado');

    if (acao === 'PAUSAR') {
      await db.execute(
        `
        UPDATE relatorios_agendamentos
        SET ativo = 0, status_agendamento = 'PAUSADO', proxima_execucao_em = NULL
        WHERE tenant_id = ? AND id_relatorio_agendamento = ?
        `,
        [current.tenantId, agendamentoId]
      );
      return ok(null);
    }

    const next = calcularProximaExecucao({
      recorrencia: String(row.recorrencia) as any,
      horarioExecucao: String(row.horarioExecucao || '08:00:00'),
      timezone: String(row.timezone || 'America/Sao_Paulo'),
      diaSemana: row.diaSemana === null || row.diaSemana === undefined ? null : Number(row.diaSemana),
      diaMes: row.diaMes === null || row.diaMes === undefined ? null : Number(row.diaMes),
      base: new Date(),
    });

    await db.execute(
      `
      UPDATE relatorios_agendamentos
      SET ativo = 1, status_agendamento = 'ATIVO', proxima_execucao_em = ?
      WHERE tenant_id = ? AND id_relatorio_agendamento = ?
      `,
      [next, current.tenantId, agendamentoId]
    );
    try {
      await publishRealtimeEvent({
        tenantId: current.tenantId,
        topic: 'relatorios',
        name: 'relatorio.agendamento.changed',
        targetType: 'PERMISSION',
        targetValue: 'relatorios.agendados.view',
        payload: { agendamentoId, status: 'ATIVO' },
        ttlSeconds: 60,
      });
    } catch {}
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
