import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_TECNICOS_CRUD);
    const { id } = await params;
    const idTecnico = Number(id);
    const body = await req.json();

    if (!body.tipoProfissional) return fail(422, 'Tipo profissional obrigatório');

    await db.query(
      `
      UPDATE sst_profissionais
      SET tipo_profissional = ?, registro_numero = ?, registro_uf = ?, conselho_sigla = ?, ativo = ?
      WHERE id_sst_profissional = ? AND tenant_id = ?
      `,
      [
        body.tipoProfissional,
        body.registroNumero || null,
        body.registroUf || null,
        body.conselhoSigla || null,
        body.ativo ? 1 : 0,
        idTecnico,
        current.tenantId,
      ]
    );

    return ok({ id: idTecnico });
  } catch (e) {
    return handleApiError(e);
  }
}
