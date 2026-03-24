import { NextRequest } from 'next/server';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import type { RelatorioAgendadoSaveDTO } from '@/lib/modules/relatorios-agendados/types';
import { calcularProximaExecucao } from '@/lib/modules/relatorios-agendados/server';
import { DASHBOARD_EXPORT_PROVIDERS } from '@/lib/modules/dashboard-export/registry';
import { publishRealtimeEvent } from '@/lib/realtime/publish';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_VIEW);
    try {
      const [rows]: any = await db.query(
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
          ativo,
          status_agendamento AS status,
          proxima_execucao_em AS proximaExecucaoEm,
          ultima_execucao_em AS ultimaExecucaoEm,
          ultima_execucao_status AS ultimaExecucaoStatus
        FROM relatorios_agendamentos
        WHERE tenant_id = ?
        ORDER BY atualizado_em DESC
        `,
        [current.tenantId]
      );
      return ok(
        (rows as any[]).map((r) => ({
          ...r,
          filtros: typeof r.filtros === 'string' ? JSON.parse(r.filtros) : r.filtros,
          widgets: typeof r.widgets === 'string' ? JSON.parse(r.widgets) : r.widgets,
        }))
      );
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_CRUD);
    await requireApiPermission(PERMISSIONS.DASHBOARD_EXPORTAR);

    const body = (await req.json()) as RelatorioAgendadoSaveDTO;
    if (!body?.nome || !body?.contexto || !body?.formato || !body?.recorrencia || !body?.horarioExecucao) return fail(422, 'Dados inválidos');

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
        INSERT INTO relatorios_agendamentos
          (tenant_id, nome_agendamento, contexto_dashboard, formato_envio, recorrencia, horario_execucao, timezone, dia_semana, dia_mes,
           filtros_json, widgets_json, assunto_email_template, corpo_email_template, ativo, status_agendamento,
           id_usuario_criador, id_usuario_proprietario, proxima_execucao_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, ?, ?)
        `,
        [
          current.tenantId,
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
          current.id,
          current.id,
          next,
        ]
      );

      const [[idRow]]: any = await conn.query(
        `SELECT MAX(id_relatorio_agendamento) AS id FROM relatorios_agendamentos WHERE tenant_id = ? AND id_usuario_criador = ?`,
        [current.tenantId, current.id]
      );
      const agendamentoId = Number(idRow?.id);

      for (const d of body.destinatarios || []) {
        if (d.tipo === 'USUARIO' && d.idUsuario) {
          await conn.execute(
            `
            INSERT INTO relatorios_agendamentos_destinatarios
              (tenant_id, id_relatorio_agendamento, tipo_destinatario, id_usuario, ativo)
            VALUES (?, ?, 'USUARIO', ?, 1)
            `,
            [current.tenantId, agendamentoId, Number(d.idUsuario)]
          );
        }
        if (d.tipo === 'EMAIL' && d.emailDestino) {
          await conn.execute(
            `
            INSERT INTO relatorios_agendamentos_destinatarios
              (tenant_id, id_relatorio_agendamento, tipo_destinatario, email_destino, nome_destinatario, ativo)
            VALUES (?, ?, 'EMAIL', ?, ?, 1)
            `,
            [current.tenantId, agendamentoId, String(d.emailDestino), d.nomeDestinatario ? String(d.nomeDestinatario) : null]
          );
        }
      }

      await conn.commit();
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
      return created({ id: agendamentoId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    return handleApiError(e);
  }
}
