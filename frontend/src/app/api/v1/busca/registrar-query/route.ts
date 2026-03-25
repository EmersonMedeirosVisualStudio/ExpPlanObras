import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { registerSearchQuery } from '@/lib/search/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const body = (await req.json().catch(() => null)) as { query?: string } | null;
    const query = body?.query ? String(body.query) : '';
    await registerSearchQuery({ tenantId: user.tenantId, userId: user.id, query });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

