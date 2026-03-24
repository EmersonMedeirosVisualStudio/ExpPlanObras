import { handleApiError, ok, fail } from '@/lib/api/http';
import { processPendingNotificationEmails } from '@/lib/notifications/email/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const secret = process.env.INTERNAL_JOB_SECRET || '';
    const header = req.headers.get('x-internal-secret') || '';
    if (!secret || header !== secret) return fail(401, 'Não autorizado');

    await processPendingNotificationEmails(30);
    return ok({ status: 'ok' });
  } catch (e) {
    return handleApiError(e);
  }
}

