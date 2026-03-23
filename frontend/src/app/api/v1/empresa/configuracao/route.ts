import { db } from '@/lib/db';
import { requireApiPermission } from '@/lib/api/authz';
import { handleApiError, ok } from '@/lib/api/http';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireApiPermission(PERMISSIONS.REPRESENTANTE_VIEW);

    const [repRows] = await db.query(
      `SELECT id_empresa_representante id,
              id_funcionario idFuncionario,
              nome_representante nome,
              cpf,
              email,
              f.telefone telefone,
              ativo,
              data_inicio dataInicio
       FROM empresa_representantes
       LEFT JOIN funcionarios f ON f.id_funcionario = empresa_representantes.id_funcionario
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY data_inicio DESC
       LIMIT 1`,
      [user.tenantId]
    );

    const [encRows] = await db.query(
      `SELECT ees.id_empresa_encarregado_sistema id,
              ees.id_funcionario idFuncionario,
              f.nome_completo nome,
              ees.id_usuario idUsuario,
              u.login usuario,
              ees.data_inicio dataInicio,
              ees.ativo,
              ees.solicitou_saida solicitouSaida,
              ees.data_solicitacao_saida dataSolicitacaoSaida,
              ees.motivo_solicitacao_saida motivoSolicitacaoSaida
       FROM empresa_encarregado_sistema ees
       JOIN funcionarios f ON f.id_funcionario = ees.id_funcionario
       LEFT JOIN usuarios u ON u.id_usuario = ees.id_usuario
       WHERE ees.tenant_id = ? AND ees.ativo = 1
       ORDER BY ees.data_inicio DESC
       LIMIT 1`,
      [user.tenantId]
    );

    return ok({
      representante: Array.isArray(repRows) ? (repRows[0] ?? null) : null,
      encarregadoSistema: Array.isArray(encRows) ? (encRows[0] ?? null) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
