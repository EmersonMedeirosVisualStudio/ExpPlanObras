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

    let ceo = null;
    let gerenteRh = null;
    try {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS empresa_titulares (
          id_empresa_titular INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL,
          role_code VARCHAR(50) NOT NULL,
          id_funcionario INT NOT NULL,
          ativo TINYINT(1) NOT NULL DEFAULT 1,
          data_inicio DATE NOT NULL,
          data_fim DATE NULL,
          KEY idx_empresa_titulares_tenant_role (tenant_id, role_code),
          KEY idx_empresa_titulares_funcionario (id_funcionario)
        )
        `
      );

      const [titRows]: any = await db.query(
        `
        SELECT et.role_code roleCode,
               et.id_funcionario idFuncionario,
               f.nome_completo nome
        FROM empresa_titulares et
        JOIN funcionarios f ON f.id_funcionario = et.id_funcionario
        WHERE et.tenant_id = ? AND et.ativo = 1
        `,
        [user.tenantId]
      );
      if (Array.isArray(titRows)) {
        ceo = titRows.find((r: any) => String(r.roleCode).toUpperCase() === 'CEO') || null;
        gerenteRh = titRows.find((r: any) => String(r.roleCode).toUpperCase() === 'GERENTE_RH') || null;
      }
    } catch {
      ceo = null;
      gerenteRh = null;
    }

    return ok({
      representante: Array.isArray(repRows) ? (repRows[0] ?? null) : null,
      encarregadoSistema: Array.isArray(encRows) ? (encRows[0] ?? null) : null,
      ceo,
      gerenteRh,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
