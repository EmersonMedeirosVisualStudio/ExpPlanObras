import { handleApiError, ok } from '@/lib/api/http';
import { obterResumoPortalParceiro } from '@/lib/modules/portal-parceiro/server';
import { requireExternalUser } from '@/lib/modules/parceiros/security';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const external = await requireExternalUser();
    const data = await obterResumoPortalParceiro({ tenantId: external.tenantId, empresaParceiraId: external.empresaParceiraId });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
