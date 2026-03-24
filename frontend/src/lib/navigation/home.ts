import type { CurrentUser } from '@/lib/auth/current-user';
import { buildMenuResponseFromUser } from './build';

export function getHomeHref(user: CurrentUser) {
  return buildMenuResponseFromUser(user).homeHref;
}
