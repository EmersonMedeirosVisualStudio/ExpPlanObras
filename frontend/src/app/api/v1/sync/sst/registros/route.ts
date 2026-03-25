import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SyncBatchRequestDTO, SyncBatchResponseDTO } from '@/lib/offline/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);
    const body = (await req.json().catch(() => null)) as SyncBatchRequestDTO | null;
    const itens = body?.itens || [];
    if (!Array.isArray(itens)) return fail(422, 'itens obrigatório');
    const resultados: SyncBatchResponseDTO['resultados'] = itens.map((i) => ({
      operacaoUuid: String(i.operacaoUuid || ''),
      status: 'REJEITADO',
      message: 'Sync SST registros ainda não implementado',
    }));
    return ok({ resultados } satisfies SyncBatchResponseDTO);
  } catch (e) {
    return handleApiError(e);
  }
}

