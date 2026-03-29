import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    const [rows]: any = await db.query(
      `
      SELECT
        f.id_funcionario AS idFuncionario,
        f.nome_completo AS nomeCompleto,
        f.cpf AS cpf,
        f.matricula AS matricula,
        fl.tipo_lotacao AS tipoLotacao,
        fl.id_obra AS idObra,
        fl.id_unidade AS idUnidade,
        fl.funcao AS funcao,
        fl.atual AS atual,
        fl.data_inicio AS dataInicio,
        fl.data_fim AS dataFim
      FROM funcionarios f
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
        AND fl.tipo_lotacao = 'OBRA'
        AND fl.id_obra = ?
      ORDER BY f.nome_completo
      `,
      [current.tenantId, idObra]
    );

    return ok((rows as any[]).map((r) => ({ ...r, idFuncionario: Number(r.idFuncionario) })));
  } catch (e) {
    return handleApiError(e);
  }
}

