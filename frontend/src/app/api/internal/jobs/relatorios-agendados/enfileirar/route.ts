import { handleApiError, ok, fail } from '@/lib/api/http';
import { db } from '@/lib/db';
import { calcularProximaExecucao } from '@/lib/modules/relatorios-agendados/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    const conn = await db.getConnection();
    let total = 0;
    try {
      await conn.beginTransaction();
      const [rows]: any = await conn.query(
        `
        SELECT *
        FROM relatorios_agendamentos
        WHERE ativo = 1
          AND status_agendamento = 'ATIVO'
          AND proxima_execucao_em IS NOT NULL
          AND proxima_execucao_em <= NOW()
        ORDER BY proxima_execucao_em ASC
        LIMIT 20
        FOR UPDATE
        `
      );

      for (const a of rows as any[]) {
        const tenantId = Number(a.tenant_id);
        const agendamentoId = Number(a.id_relatorio_agendamento);
        if (!tenantId || !agendamentoId) continue;

        await conn.execute(
          `
          INSERT INTO relatorios_agendamentos_execucoes
            (tenant_id, id_relatorio_agendamento, status_execucao, execucao_manual)
          VALUES (?, ?, 'PENDENTE', 0)
          `,
          [tenantId, agendamentoId]
        );

        const next = calcularProximaExecucao({
          recorrencia: String(a.recorrencia) as any,
          horarioExecucao: String(a.horario_execucao),
          timezone: String(a.timezone || 'America/Sao_Paulo'),
          diaSemana: a.dia_semana === null || a.dia_semana === undefined ? null : Number(a.dia_semana),
          diaMes: a.dia_mes === null || a.dia_mes === undefined ? null : Number(a.dia_mes),
          base: new Date(),
        });

        await conn.execute(
          `
          UPDATE relatorios_agendamentos
          SET proxima_execucao_em = ?
          WHERE tenant_id = ? AND id_relatorio_agendamento = ?
          `,
          [next, tenantId, agendamentoId]
        );
        total++;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return ok({ status: 'ok', total });
  } catch (e) {
    return handleApiError(e);
  }
}
