import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function safeCount(sql: string, params: any[]): Promise<number> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeScalar(sql: string, params: any[]): Promise<number> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.valor || 0);
  } catch {
    return 0;
  }
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW);

    const [
      contratosAtivos,
      contratosAguardandoConfirmacao,
      obrasAtivas,
      obrasParalisadas,
      medicoesPendentes,
      solicitacoesUrgentes,
      funcionariosAtivos,
      presencasPendentesRh,
      horasExtrasPendentes,
      ncsCriticasAbertas,
      catsPendentes,
      treinamentosVencidos,
      valorContratado,
      valorExecutado,
      valorPago,
    ] = await Promise.all([
      safeCount(`SELECT COUNT(*) total FROM contratos WHERE tenant_id = ? AND status_contrato = 'ATIVO'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM contratos WHERE tenant_id = ? AND status_contrato = 'AGUARDANDO_CONFIRMACAO'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM obras WHERE tenant_id = ? AND status_obra = 'ATIVA'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM obras WHERE tenant_id = ? AND status_obra = 'PARALISADA'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM medicoes WHERE tenant_id = ? AND status_medicao = 'PENDENTE'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM suprimentos_solicitacoes WHERE tenant_id = ? AND urgencia = 'URGENTE' AND status_solicitacao <> 'CONCLUIDA'`, [
        current.tenantId,
      ]),
      safeCount(`SELECT COUNT(*) total FROM funcionarios WHERE tenant_id = ? AND ativo = 1`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM presencas_cabecalho WHERE tenant_id = ? AND status_presenca = 'ENVIADA_RH'`, [current.tenantId]),
      safeCount(`SELECT COUNT(*) total FROM funcionarios_horas_extras WHERE tenant_id = ? AND status_he IN ('SOLICITADA','APROVADA_SUPERVISOR')`, [
        current.tenantId,
      ]),
      safeCount(
        `SELECT COUNT(*) total FROM sst_nao_conformidades WHERE tenant_id = ? AND severidade = 'CRITICA' AND status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')`,
        [current.tenantId]
      ),
      safeCount(
        `SELECT COUNT(*) total FROM sst_acidentes WHERE tenant_id = ? AND cat_aplicavel = 1 AND cat_registrada = 0 AND status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')`,
        [current.tenantId]
      ),
      safeCount(
        `SELECT COUNT(*) total
         FROM sst_treinamentos_participantes p
         INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
         WHERE t.tenant_id = ? AND p.validade_ate IS NOT NULL AND p.validade_ate < CURDATE()`,
        [current.tenantId]
      ),
      safeScalar(`SELECT COALESCE(SUM(valor_contratado), 0) valor FROM contratos WHERE tenant_id = ? AND status_contrato = 'ATIVO'`, [current.tenantId]),
      safeScalar(
        `SELECT COALESCE(SUM(valor_executado), 0) valor FROM medicoes WHERE tenant_id = ? AND status_medicao IN ('APROVADA','PAGA')`,
        [current.tenantId]
      ),
      safeScalar(`SELECT COALESCE(SUM(valor_pago), 0) valor FROM pagamentos WHERE tenant_id = ?`, [current.tenantId]),
    ]);

    const saldoContratual = Number(valorContratado || 0) - Number(valorExecutado || 0);

    const alertas: any[] = [];
    if (contratosAguardandoConfirmacao > 0) {
      alertas.push({ tipo: 'CONTRATO', titulo: 'Contratos aguardando confirmação', subtitulo: `${contratosAguardandoConfirmacao} pendente(s)` });
    }
    if (medicoesPendentes > 0) {
      alertas.push({ tipo: 'MEDICAO', titulo: 'Medições pendentes', subtitulo: `${medicoesPendentes} pendente(s)` });
    }
    if (solicitacoesUrgentes > 0) {
      alertas.push({ tipo: 'SUPRIMENTOS', titulo: 'Solicitações urgentes', subtitulo: `${solicitacoesUrgentes} urgente(s)` });
    }
    if (ncsCriticasAbertas > 0) {
      alertas.push({ tipo: 'SST_NC', titulo: 'NCs críticas abertas', subtitulo: `${ncsCriticasAbertas} aberta(s)` });
    }
    if (catsPendentes > 0) {
      alertas.push({ tipo: 'SST_CAT', titulo: 'CATs pendentes', subtitulo: `${catsPendentes} pendente(s)` });
    }
    if (treinamentosVencidos > 0) {
      alertas.push({ tipo: 'SST_TREIN', titulo: 'Treinamentos vencidos', subtitulo: `${treinamentosVencidos} vencido(s)` });
    }
    if (presencasPendentesRh > 0) {
      alertas.push({ tipo: 'RH_PRESENCA', titulo: 'Presenças pendentes no RH', subtitulo: `${presencasPendentesRh} pendente(s)` });
    }

    return ok({
      cards: {
        contratosAtivos,
        contratosAguardandoConfirmacao,
        obrasAtivas,
        obrasParalisadas,
        medicoesPendentes,
        solicitacoesUrgentes,
        funcionariosAtivos,
        presencasPendentesRh,
        horasExtrasPendentes,
        ncsCriticasAbertas,
        catsPendentes,
        treinamentosVencidos,
      },
      financeiro: {
        valorContratado,
        valorExecutado,
        valorPago,
        saldoContratual,
      },
      alertas: alertas.slice(0, 10),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

