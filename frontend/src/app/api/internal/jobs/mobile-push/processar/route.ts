import { handleApiError, ok } from '@/lib/api/http';

export const runtime = 'nodejs';

export async function POST() {
  try {
    return ok({ processed: 0 });
  } catch (e) {
    return handleApiError(e);
  }
}

