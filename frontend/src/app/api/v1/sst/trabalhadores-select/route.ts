import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_VIEW);
    const tipoLocal = req.nextUrl.searchParams.get('tipoLocal');
    const idObra = req.nextUrl.searchParams.get('idObra');
    const idUnidade = req.nextUrl.searchParams.get('idUnidade');

    if (!tipoLocal) return fail(422, 'tipoLocal obrigatório');

    const [funcionarios]: any = await db.query(
      `
      SELECT 'FUNCIONARIO' AS tipoDestinatario,
             f.id_funcionario AS id,
             f.nome_completo AS nome,
             f.funcao_principal AS funcao
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND (
          (? = 'OBRA' AND fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ?)
          OR
          (? = 'UNIDADE' AND fl.tipo_lotacao = 'UNIDADE' AND fl.id_unidade = ?)
        )
      `,
      [current.tenantId, tipoLocal, idObra || 0, tipoLocal, idUnidade || 0]
    );

    const [terceirizados]: any = await db.query(
      `
      SELECT 'TERCEIRIZADO' AS tipoDestinatario,
             t.id_terceirizado_trabalhador AS id,
             t.nome_completo AS nome,
             t.funcao
      FROM terceirizados_trabalhadores t
      INNER JOIN terceirizados_alocacoes a ON a.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador AND a.atual = 1
      WHERE t.tenant_id = ?
        AND (
          (? = 'OBRA' AND a.tipo_local = 'OBRA' AND a.id_obra = ?)
          OR
          (? = 'UNIDADE' AND a.tipo_local = 'UNIDADE' AND a.id_unidade = ?)
        )
      `,
      [current.tenantId, tipoLocal, idObra || 0, tipoLocal, idUnidade || 0]
    );

    return ok([...(funcionarios as any[]), ...(terceirizados as any[])]);
  } catch (e) {
    return handleApiError(e);
  }
}

