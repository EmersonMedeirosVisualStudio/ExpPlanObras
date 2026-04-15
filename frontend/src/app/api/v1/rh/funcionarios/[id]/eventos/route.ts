import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, created, fail, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function isMissingTableError(e: any) {
  const msg = String(e?.message || '');
  return msg.includes('ER_NO_SUCH_TABLE') || msg.includes('doesn\\'t exist') || msg.includes('no such table');
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { id } = await params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          e.id_evento id,
          e.tipo_evento tipoEvento,
          e.data_evento dataEvento,
          e.descricao descricao,
          e.valor_anterior valorAnterior,
          e.valor_novo valorNovo,
          e.id_documento_registro idDocumentoRegistro,
          e.id_usuario_criador idUsuarioCriador,
          e.created_at createdAt
        FROM funcionarios_eventos e
        WHERE e.tenant_id = ? AND e.id_funcionario = ?
        ORDER BY e.data_evento DESC, e.id_evento DESC
        LIMIT 300
        `,
        [current.tenantId, idFuncionario]
      );

      return ok(rows);
    } catch (e: any) {
      if (isMissingTableError(e)) return ok([]);
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const body = (await req.json().catch(() => null)) as any;
    const tipoEvento = String(body?.tipoEvento || '').trim().toUpperCase();
    const dataEvento = String(body?.dataEvento || '').trim();
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const valorAnterior = body?.valorAnterior ?? null;
    const valorNovo = body?.valorNovo ?? null;
    const idDocumentoRegistro = body?.idDocumentoRegistro ? Number(body.idDocumentoRegistro) : null;

    if (!tipoEvento) return fail(422, 'tipoEvento obrigatório');
    if (!dataEvento) return fail(422, 'dataEvento obrigatório');

    const [result]: any = await db.execute(
      `
      INSERT INTO funcionarios_eventos
        (tenant_id, id_funcionario, tipo_evento, data_evento, descricao, valor_anterior, valor_novo, id_documento_registro, id_usuario_criador)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [current.tenantId, idFuncionario, tipoEvento, dataEvento, descricao, valorAnterior ? JSON.stringify(valorAnterior) : null, valorNovo ? JSON.stringify(valorNovo) : null, idDocumentoRegistro, current.id]
    );

    return created({ id: result.insertId }, 'Evento registrado.');
  } catch (e: any) {
    if (isMissingTableError(e)) return fail(500, 'Tabela funcionarios_eventos ainda não foi criada no banco.');
    return handleApiError(e);
  }
}

