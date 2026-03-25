import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { hasPermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { executarAcaoDocumentoVersao, obterVersaoDetalhe } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_ASSINAR);
    const { id } = await context.params;
    const versaoId = Number(id);
    if (!Number.isFinite(versaoId)) throw new ApiError(400, 'ID inválido');

    const body = await req.json();
    const acao = String(body?.acao || '').toUpperCase();
    if (acao === 'ENVIAR_ASSINATURA' || acao === 'GERAR_PDF_FINAL') {
      if (!hasPermission(current, PERMISSIONS.DOCUMENTOS_CRUD)) throw new ApiError(403, 'Acesso negado.');
    }

    const detalhe = await obterVersaoDetalhe(current.tenantId, versaoId);
    const data = await executarAcaoDocumentoVersao({
      tenantId: current.tenantId,
      versaoId,
      documentoId: detalhe.documento.id,
      tituloDocumento: detalhe.documento.tituloDocumento,
      userId: current.id,
      body,
    });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

