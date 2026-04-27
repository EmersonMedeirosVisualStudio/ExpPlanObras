import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { atualizarDocumentoRegistro, cancelarDocumentoRegistro, obterDocumentoDetalhe } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await context.params;
    const documentoId = Number(id);
    if (!Number.isFinite(documentoId)) throw new ApiError(400, 'ID inválido');

    const data = await obterDocumentoDetalhe(current.tenantId, documentoId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await context.params;
    const documentoId = Number(id);
    if (!Number.isFinite(documentoId)) throw new ApiError(400, 'ID inválido');

    const body = (await req.json().catch(() => ({}))) as any;
    const tituloDocumento = body?.tituloDocumento !== undefined ? String(body.tituloDocumento) : undefined;
    const descricaoDocumento =
      body?.descricaoDocumento !== undefined ? (body.descricaoDocumento == null ? null : String(body.descricaoDocumento)) : undefined;

    const data = await atualizarDocumentoRegistro(current.tenantId, current.id, { documentoId, tituloDocumento, descricaoDocumento });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await context.params;
    const documentoId = Number(id);
    if (!Number.isFinite(documentoId)) throw new ApiError(400, 'ID inválido');

    const data = await cancelarDocumentoRegistro(current.tenantId, current.id, documentoId);
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

