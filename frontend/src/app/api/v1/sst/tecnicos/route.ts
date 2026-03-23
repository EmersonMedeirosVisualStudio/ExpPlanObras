import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TECNICOS_VIEW);

    const [rows]: any = await db.query(
      `
      SELECT sp.id_sst_profissional AS id,
             sp.id_funcionario AS idFuncionario,
             f.nome_completo AS funcionarioNome,
             sp.tipo_profissional AS tipoProfissional,
             sp.registro_numero AS registroNumero,
             sp.registro_uf AS registroUf,
             sp.conselho_sigla AS conselhoSigla,
             sp.ativo
      FROM sst_profissionais sp
      INNER JOIN funcionarios f ON f.id_funcionario = sp.id_funcionario
      WHERE sp.tenant_id = ?
      ORDER BY f.nome_completo
      `,
      [current.tenantId]
    );

    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TECNICOS_CRUD);
    const body = await req.json();

    if (!body.idFuncionario || !body.tipoProfissional) {
      return fail(422, 'Funcionário e tipo profissional são obrigatórios');
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_profissionais
      (tenant_id, id_funcionario, tipo_profissional, registro_numero, registro_uf, conselho_sigla, ativo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [current.tenantId, body.idFuncionario, body.tipoProfissional, body.registroNumero || null, body.registroUf || null, body.conselhoSigla || null]
    );

    return created({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}

