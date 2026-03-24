import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import type { RelatorioAgendadoSaveDTO } from '@/lib/modules/relatorios-agendados/types';
import { calcularProximaExecucao } from '@/lib/modules/relatorios-agendados/server';
import { DASHBOARD_EXPORT_PROVIDERS } from '@/lib/modules/dashboard-export/registry';
import { publishRealtimeEvent } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_VIEW);
    const { id } = await context.params;
    const agendamentoId = Number(id);
    if (!Number.isFinite(agendamentoId)) return fail(400, 'ID inválido');

    const [[a]]: any = await db.query(
      `
      SELECT
        id_relatorio_agendamento AS id,
        nome_agendamento AS nome,
        contexto_dashboard AS contexto,
        formato_envio AS formato,
        recorrencia,
        horario_execucao AS horarioExecucao,
        timezone,
        dia_semana AS diaSemana,
        dia_mes AS diaMes,
        filtros_json AS filtros,
        widgets_json AS widgets,
        assunto_email_template AS assuntoEmailTemplate,
        corpo_email_template AS corpoEmailTemplate,
        ativo,
        status_agendamento AS status,
        proxima_execucao_em AS proximaExecucaoEm,
        ultima_execucao_em AS ultimaExecucaoEm,
        ultima_execucao_status AS ultimaExecucaoStatus
      FROM relatorios_agendamentos
      WHERE tenant_id = ? AND id_relatorio_agendamento = ?
      LIMIT 1
      `,
      [current.tenantId, agendamentoId]
    );
    if (!a) return fail(404, 'Agendamento não encontrado');

    let destinatarios: any[] = [];
    try {
      const [rows]: any = await db.query(
        `
        SELECT
          id_relatorio_agendamento_destinatario AS id,
          tipo_destinatario AS tipo,
          id_usuario AS idUsuario,
          email_destino AS emailDestino,
          nome_destinatario AS nomeDestinatario,
          ativo
        FROM relatorios_agendamentos_destinatarios
        WHERE tenant_id = ? AND id_relatorio_agendamento = ?
        ORDER BY id_relatorio_agendamento_destinatario ASC
        `,
        [current.tenantId, agendamentoId]
      );
      destinatarios = rows as any[];
    } catch {
      destinatarios = [];
    }

    return ok({
      agendamento: {
        ...a,
        filtros: typeof a.filtros === 'string' ? JSON.parse(a.filtros) : a.filtros,
        widgets: typeof a.widgets === 'string' ? JSON.parse(a.widgets) : a.widgets,
      },
      destinatarios,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_CRUD);
    await requireApiPermission(PERMISSIONS.DASHBOARD_EXPORTAR);

    const { id } = await context.params;
    const agendamentoId = Number(id);
    if (!Number.isFinite(agendamentoId)) return fail(400, 'ID inválido');

    const body = (await req.json()) as RelatorioAgendadoSaveDTO;
    const provider = DASHBOARD_EXPORT_PROVIDERS[body.contexto];
    if (!provider) return fail(400, 'Contexto inválido');
    await requireApiPermission(provider.requiredPermission as any);

    const next = calcularProximaExecucao({
      recorrencia: body.recorrencia,
      horarioExecucao: body.horarioExecucao,
      timezone: body.timezone || 'America/Sao_Paulo',
      diaSemana: body.diaSemana ?? null,
      diaMes: body.diaMes ?? null,
      base: new Date(),
    });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `
        UPDATE relatorios_agendamentos
        SET
          nome_agendamento = ?,
          contexto_dashboard = ?,
          formato_envio = ?,
          recorrencia = ?,
          horario_execucao = ?,
          timezone = ?,
          dia_semana = ?,
          dia_mes = ?,
          filtros_json = ?,
          widgets_json = ?,
          assunto_email_template = ?,
          corpo_email_template = ?,
          ativo = ?,
          status_agendamento = ?,
          proxima_execucao_em = ?
        WHERE tenant_id = ? AND id_relatorio_agendamento = ?
        `,
        [
          body.nome,
          body.contexto,
          body.formato,
          body.recorrencia,
          body.horarioExecucao,
          body.timezone || 'America/Sao_Paulo',
          body.diaSemana ?? null,
          body.diaMes ?? null,
          body.filtros ? JSON.stringify(body.filtros) : null,
          body.widgets ? JSON.stringify(body.widgets) : null,
          body.assuntoEmailTemplate ?? null,
          body.corpoEmailTemplate ?? null,
          body.ativo ? 1 : 0,
          body.ativo ? 'ATIVO' : 'PAUSADO',
          next,
          current.tenantId,
          agendamentoId,
        ]
      );

      await conn.execute(`DELETE FROM relatorios_agendamentos_destinatarios WHERE tenant_id = ? AND id_relatorio_agendamento = ?`, [
        current.tenantId,
        agendamentoId,
      ]);
      for (const d of body.destinatarios || []) {
        if (d.tipo === 'USUARIO' && d.idUsuario) {
          await conn.execute(
            `INSERT INTO relatorios_agendamentos_destinatarios (tenant_id, id_relatorio_agendamento, tipo_destinatario, id_usuario, ativo) VALUES (?, ?, 'USUARIO', ?, 1)`,
            [current.tenantId, agendamentoId, Number(d.idUsuario)]
          );
        }
        if (d.tipo === 'EMAIL' && d.emailDestino) {
          await conn.execute(
            `INSERT INTO relatorios_agendamentos_destinatarios (tenant_id, id_relatorio_agendamento, tipo_destinatario, email_destino, nome_destinatario, ativo) VALUES (?, ?, 'EMAIL', ?, ?, 1)`,
            [current.tenantId, agendamentoId, String(d.emailDestino), d.nomeDestinatario ? String(d.nomeDestinatario) : null]
          );
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    try {
      await publishRealtimeEvent({
        tenantId: current.tenantId,
        topic: 'relatorios',
        name: 'relatorio.agendamento.changed',
        targetType: 'PERMISSION',
        targetValue: 'relatorios.agendados.view',
        payload: { agendamentoId },
        ttlSeconds: 60,
      });
    } catch {}
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}
