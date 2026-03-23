import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './current-user';
import type { Permission } from './permissions';

export function hasPermission(user: CurrentUser | null, permission: Permission): boolean {
  if (!user) return false;
  return user.permissoes.includes(permission);
}

export function hasAnyPermission(user: CurrentUser | null, permissions: Permission[]): boolean {
  if (!user) return false;
  return permissions.some((p) => user.permissoes.includes(p));
}

export function canAccessObra(user: CurrentUser | null, obraId: number): boolean {
  if (!user) return false;
  return user.abrangencia.empresa || user.abrangencia.obras.includes(obraId);
}

export function canAccessUnidade(user: CurrentUser | null, unidadeId: number): boolean {
  if (!user) return false;
  return user.abrangencia.empresa || user.abrangencia.unidades.includes(unidadeId);
}

export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasPermission(user, permission)) redirect('/dashboard/403');
  return user;
}

export async function requireAnyPermission(permissions: Permission[]) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!hasAnyPermission(user, permissions)) redirect('/dashboard/403');
  return user;
}

