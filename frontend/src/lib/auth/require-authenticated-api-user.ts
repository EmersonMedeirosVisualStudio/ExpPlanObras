import { ApiError } from '@/lib/api/http';
import { getCurrentUser, type CurrentUser } from './current-user';

export async function requireAuthenticatedApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Não autenticado.');
  return user;
}

