import { ApiError, created, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { criarNovaVersaoDocumento } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

function getFilenameFromHeaders(req: Request) {
  const v = req.headers.get('x-filename') || req.headers.get('X-Filename');
  return v ? String(v) : null;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DOCUMENTOS_CRUD);
    const { id } = await context.params;
    const documentoId = Number(id);
    if (!Number.isFinite(documentoId)) throw new ApiError(400, 'ID inválido');

    const contentType = String(req.headers.get('content-type') || '').toLowerCase();

    let nomeArquivoOriginal = getFilenameFromHeaders(req) || `documento-${documentoId}.pdf`;
    let mimeType = contentType.split(';')[0] || 'application/octet-stream';
    let buffer: Buffer;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      nomeArquivoOriginal = String(body?.nomeArquivoOriginal || nomeArquivoOriginal);
      mimeType = String(body?.mimeType || mimeType);
      const b64 = String(body?.conteudoBase64 || '').trim();
      if (!b64) throw new ApiError(422, 'conteudoBase64 obrigatório');
      buffer = Buffer.from(b64, 'base64');
    } else {
      const ab = await req.arrayBuffer();
      buffer = Buffer.from(ab);
    }

    if (!buffer?.length) throw new ApiError(422, 'Arquivo vazio.');

    const data = await criarNovaVersaoDocumento({
      tenantId: current.tenantId,
      documentoId,
      userId: current.id,
      nomeArquivoOriginal,
      mimeType,
      buffer,
    });
    return created(data);
  } catch (e) {
    return handleApiError(e);
  }
}

