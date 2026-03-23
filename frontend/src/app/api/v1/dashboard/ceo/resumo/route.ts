import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_CEO_VIEW);

    const [[contratosAtivos]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM contratos
       WHERE tenant_id = ? AND status_contrato IN ('ATIVO', 'PARALISADO')`,
      [current.tenantId]
    );

    const [[contratosAguardando]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM contratos
       WHERE tenant_id = ? AND status_contrato = 'AGUARDANDO_CONFIRMACAO'`,
      [current.tenantId]
    );

    const [[obrasAtivas]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM obras o
       INNER JOIN contratos c ON c.id_contrato = o.id_contrato
       WHERE c.tenant_id = ? AND o.status_obra = 'ATIVA'`,
      [current.tenantId]
    );

    const [[obrasParalisadas]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM obras o
       INNER JOIN contratos c ON c.id_contrato = o.id_contrato
       WHERE c.tenant_id = ? AND o.status_obra = 'PARALISADA'`,
      [current.tenantId]
    );

    const [[medicoesPendentes]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM contratos_medicoes m
       INNER JOIN contratos c ON c.id_contrato = m.id_contrato
       WHERE c.tenant_id = ?
         AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')`,
      [current.tenantId]
    );

    const [[solicitacoesUrgentes]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM solicitacao_material s
       WHERE s.tenant_id = ?
         AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
         AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')`,
      [current.tenantId]
    );

    const [[funcionariosAtivos]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM funcionarios
       WHERE tenant_id = ?
         AND ativo = 1
         AND status_funcional = 'ATIVO'`,
      [current.tenantId]
    );

    const [[presencasPendentesRh]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM presencas_cabecalho
       WHERE tenant_id = ?
         AND status_presenca = 'ENVIADA_RH'`,
      [current.tenantId]
    );

    const [[horasExtrasPendentes]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM funcionarios_horas_extras
       WHERE tenant_id = ?
         AND status_he IN ('SOLICITADA', 'AUTORIZADA')`,
      [current.tenantId]
    );

    const [[ncsCriticas]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM sst_nao_conformidades
       WHERE tenant_id = ?
         AND status_nc IN ('ABERTA', 'EM_TRATAMENTO', 'AGUARDANDO_VALIDACAO')
         AND severidade IN ('ALTA', 'CRITICA')`,
      [current.tenantId]
    );

    const [[catsPendentes]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM sst_acidentes
       WHERE tenant_id = ?
         AND cat_aplicavel = 1
         AND cat_registrada = 0
         AND status_acidente IN ('ABERTO', 'EM_INVESTIGACAO', 'AGUARDANDO_VALIDACAO')`,
      [current.tenantId]
    );

    const [[treinamentosVencidos]]: any = await db.query(
      `SELECT COUNT(*) AS total
       FROM sst_treinamentos_participantes p
       INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
       WHERE t.tenant_id = ?
         AND p.validade_ate IS NOT NULL
         AND p.validade_ate < CURDATE()`,
      [current.tenantId]
    );

    return ok({
      contratosAtivos: Number(contratosAtivos.total || 0),
      contratosAguardandoConfirmacao: Number(contratosAguardando.total || 0),
      obrasAtivas: Number(obrasAtivas.total || 0),
      obrasParalisadas: Number(obrasParalisadas.total || 0),
      medicoesPendentes: Number(medicoesPendentes.total || 0),
      solicitacoesUrgentes: Number(solicitacoesUrgentes.total || 0),
      funcionariosAtivos: Number(funcionariosAtivos.total || 0),
      presencasPendentesRh: Number(presencasPendentesRh.total || 0),
      horasExtrasPendentes: Number(horasExtrasPendentes.total || 0),
      ncsCriticasAbertas: Number(ncsCriticas.total || 0),
      catsPendentes: Number(catsPendentes.total || 0),
      treinamentosVencidos: Number(treinamentosVencidos.total || 0),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

