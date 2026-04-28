import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { id } = await context.params;
    const idTerceirizado = Number(id);
    if (!Number.isFinite(idTerceirizado) || idTerceirizado <= 0) throw new ApiError(400, 'ID inválido');

    const [[row]]: any = await db.query(
      `
      SELECT
        t.id_terceirizado_trabalhador id,
        t.nome_completo nomeCompleto,
        t.cpf,
        t.funcao,
        t.ativo,
        t.id_empresa_parceira idEmpresaParceira,
        ep.razao_social empresaParceira,
        CASE
          WHEN a.tipo_local = 'OBRA' THEN 'OBRA'
          WHEN a.tipo_local = 'UNIDADE' THEN 'UNIDADE'
          ELSE NULL
        END AS tipoLocal,
        a.id_obra AS idObra,
        a.id_unidade AS idUnidade,
        CASE
          WHEN a.tipo_local = 'OBRA' THEN COALESCE(NULLIF(o.nome_obra, ''), CONCAT('Obra #', o.id_obra))
          WHEN a.tipo_local = 'UNIDADE' THEN u.nome
          ELSE NULL
        END AS localNome,
        c.id_contrato AS contratoId,
        c.numero_contrato AS contratoNumero
      FROM terceirizados_trabalhadores t
      JOIN terceirizados_empresas_parceiras ep ON ep.id_empresa_parceira = t.id_empresa_parceira
      LEFT JOIN terceirizados_alocacoes a ON a.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador AND a.atual = 1
      LEFT JOIN obras o ON o.id_obra = a.id_obra
      LEFT JOIN unidades u ON u.tenant_id = t.tenant_id AND u.id_unidade = a.id_unidade
      LEFT JOIN contratos c ON c.tenant_id = t.tenant_id AND c.id_contrato = o.id_contrato
      WHERE t.tenant_id = ?
        AND t.id_terceirizado_trabalhador = ?
      LIMIT 1
      `,
      [current.tenantId, idTerceirizado]
    );

    if (!row) throw new ApiError(404, 'Terceirizado não encontrado');
    return ok(row);
  } catch (e) {
    return handleApiError(e);
  }
}
