import { getCurrentUser } from './current-user';

export async function getCurrentUserPermissions(_userId?: number): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return user.permissoes as unknown as string[];
}

