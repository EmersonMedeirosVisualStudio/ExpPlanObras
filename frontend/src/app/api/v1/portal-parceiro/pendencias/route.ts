import { handleApiError, ok } from '@/lib/api/http';
import { requireExternalUser } from '@/lib/modules/parceiros/security';
import { listarPendenciasPortalParceiro } from '@/lib/modules/portal-parceiro/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const external = await requireExternalUser();
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
    const data = await listarPendenciasPortalParceiro({
      tenantId: external.tenantId,
      empresaParceiraId: external.empresaParceiraId,
      limit,
    });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
