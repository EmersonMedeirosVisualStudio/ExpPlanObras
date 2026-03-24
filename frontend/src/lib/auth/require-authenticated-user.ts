import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './current-user';

export async function requireAuthenticatedUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

