import { handleApiError, ok } from '@/lib/api/http';
import { verificarDocumentoPorToken } from '@/lib/modules/documentos/server';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const data = await verificarDocumentoPorToken({ token });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}

