import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function safeQueryTotal(sql: string, params: any[]): Promise<number> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

async function safeQueryFinanceiro(sql: string, params: any[]): Promise<{ valorContratado: number; valorExecutado: number; valorPago: number }> {
  try {
    const [[row]]: any = await db.query(sql, params);
    return {
      valorContratado: Number(row?.valorContratado || 0),
      valorExecutado: Number(row?.valorExecutado || 0),
      valorPago: Number(row?.valorPago || 0),
    };
  } catch {
    return { valorContratado: 0, valorExecutado: 0, valorPago: 0 };
  }
}

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_DIRETOR_VIEW);
    const scope = await getDashboardScope(current);

    if (!scope.empresaTotal && !scope.diretorias.length) {
      return ok({
        contratosAtivos: 0,
        obrasAtivas: 0,
        medicoesPendentes: 0,
        solicitacoesUrgentes: 0,
        funcionariosAtivos: 0,
        ncsCriticas: 0,
        catsPendentes: 0,
        treinamentosVencidos: 0,
        valorContratado: 0,
        valorExecutado: 0,
        valorPago: 0,
        saldoContrato: 0,
      });
    }

    const dir = inClause(scope.diretorias);
    const filtroDiretoria = scope.empresaTotal ? '' : ` AND c.id_setor_diretoria IN ${dir.sql}`;
    const contratoParams = scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params];

    const [contratosAtivos, obrasAtivas, medicoesPendentes, solicitacoesUrgentes, funcionariosAtivos, ncsCriticas, catsPendentes, treinamentosVencidos, fin] =
      await Promise.all([
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM contratos c
           WHERE c.tenant_id = ?
             AND c.status_contrato IN ('ATIVO', 'PARALISADO')
             ${filtroDiretoria}`,
          contratoParams
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM obras o
           INNER JOIN contratos c ON c.id_contrato = o.id_contrato
           WHERE c.tenant_id = ?
             AND o.status_obra = 'ATIVA'
             ${filtroDiretoria}`,
          contratoParams
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM contratos_medicoes m
           INNER JOIN contratos c ON c.id_contrato = m.id_contrato
           WHERE c.tenant_id = ?
             AND m.status_medicao IN ('EM_ELABORACAO', 'ENVIADA')
             ${filtroDiretoria}`,
          contratoParams
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM solicitacao_material s
           LEFT JOIN obras o ON o.id_obra = s.id_obra_origem
           LEFT JOIN contratos c ON c.id_contrato = o.id_contrato
           LEFT JOIN unidades u ON u.id_unidade = s.id_unidade_origem
           WHERE s.tenant_id = ?
             AND s.regime_urgencia IN ('URGENTE', 'EMERGENCIAL')
             AND s.status_solicitacao NOT IN ('RECEBIDA', 'CANCELADA')
             AND (
               ${scope.empresaTotal ? '1=1' : `(c.id_setor_diretoria IN ${dir.sql} OR u.id_setor_diretoria IN ${dir.sql})`}
             )`,
          scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params, ...dir.params]
        ),
        safeQueryTotal(
          `SELECT COUNT(DISTINCT f.id_funcionario) AS total
           FROM funcionarios f
           INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
           LEFT JOIN obras o ON o.id_obra = fl.id_obra
           LEFT JOIN contratos c ON c.id_contrato = o.id_contrato
           LEFT JOIN unidades u ON u.id_unidade = fl.id_unidade
           WHERE f.tenant_id = ?
             AND f.ativo = 1
             AND f.status_funcional = 'ATIVO'
             AND (
               ${scope.empresaTotal ? '1=1' : `(c.id_setor_diretoria IN ${dir.sql} OR u.id_setor_diretoria IN ${dir.sql})`}
             )`,
          scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params, ...dir.params]
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM sst_nao_conformidades nc
           LEFT JOIN contratos c ON c.id_contrato = (
             SELECT o.id_contrato FROM obras o WHERE o.id_obra = nc.id_obra LIMIT 1
           )
           LEFT JOIN unidades u ON u.id_unidade = nc.id_unidade
           WHERE nc.tenant_id = ?
             AND nc.status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
             AND nc.severidade IN ('ALTA','CRITICA')
             AND (
               ${scope.empresaTotal ? '1=1' : `(c.id_setor_diretoria IN ${dir.sql} OR u.id_setor_diretoria IN ${dir.sql})`}
             )`,
          scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params, ...dir.params]
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM sst_acidentes a
           LEFT JOIN contratos c ON c.id_contrato = (
             SELECT o.id_contrato FROM obras o WHERE o.id_obra = a.id_obra LIMIT 1
           )
           LEFT JOIN unidades u ON u.id_unidade = a.id_unidade
           WHERE a.tenant_id = ?
             AND a.cat_aplicavel = 1
             AND a.cat_registrada = 0
             AND a.status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')
             AND (
               ${scope.empresaTotal ? '1=1' : `(c.id_setor_diretoria IN ${dir.sql} OR u.id_setor_diretoria IN ${dir.sql})`}
             )`,
          scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params, ...dir.params]
        ),
        safeQueryTotal(
          `SELECT COUNT(*) AS total
           FROM sst_treinamentos_participantes p
           INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
           LEFT JOIN unidades u ON u.id_unidade = t.id_unidade
           LEFT JOIN contratos c ON c.id_contrato = (
             SELECT o.id_contrato FROM obras o WHERE o.id_obra = t.id_obra LIMIT 1
           )
           WHERE t.tenant_id = ?
             AND p.validade_ate IS NOT NULL
             AND p.validade_ate < CURDATE()
             AND (
               ${scope.empresaTotal ? '1=1' : `(c.id_setor_diretoria IN ${dir.sql} OR u.id_setor_diretoria IN ${dir.sql})`}
             )`,
          scope.empresaTotal ? [current.tenantId] : [current.tenantId, ...dir.params, ...dir.params]
        ),
        safeQueryFinanceiro(
          `SELECT
              COALESCE(SUM(c.valor_atualizado),0) AS valorContratado,
              COALESCE(SUM(c.valor_executado),0) AS valorExecutado,
              COALESCE(SUM(c.valor_pago),0) AS valorPago
           FROM contratos c
           WHERE c.tenant_id = ?
             AND c.status_contrato NOT IN ('RESCINDIDO','CANCELADO')
             ${filtroDiretoria}`,
          contratoParams
        ),
      ]);

    const valorContratado = Number(fin.valorContratado || 0);
    const valorPago = Number(fin.valorPago || 0);

    return ok({
      contratosAtivos,
      obrasAtivas,
      medicoesPendentes,
      solicitacoesUrgentes,
      funcionariosAtivos,
      ncsCriticas,
      catsPendentes,
      treinamentosVencidos,
      valorContratado,
      valorExecutado: Number(fin.valorExecutado || 0),
      valorPago,
      saldoContrato: valorContratado - valorPago,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

