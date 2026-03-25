import { ApiError, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { baixarDocumentoVersao } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_VIEW);
    const { id } = await context.params;
    const versaoId = Number(id);
    if (!Number.isFinite(versaoId)) throw new ApiError(400, 'ID inválido');

    const { searchParams } = new URL(req.url);
    const tipo = String(searchParams.get('tipo') || 'PDF_FINAL').toUpperCase();
    const normalized = tipo === 'ORIGINAL' ? 'ORIGINAL' : 'PDF_FINAL';

    const out = await baixarDocumentoVersao({ tenantId: current.tenantId, versaoId, tipo: normalized as any });
    const blob = new Blob([out.bytes], { type: out.mimeType || 'application/pdf' });
    return new Response(blob, {
      status: 200,
      headers: { 'Content-Disposition': `attachment; filename="${out.nome}"` },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

