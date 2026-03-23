import { getCurrentUser } from '@/lib/auth/current-user';
import { hasPermission } from '@/lib/auth/access';
import type { Permission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { ApiError } from './http';

export async function requireApiPermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Não autenticado.');
  if (!hasPermission(user, permission)) throw new ApiError(403, 'Acesso negado.');

  if (typeof user.idFuncionario === 'number') return user;

  const [[row]]: any = await db.query(
    `SELECT id_funcionario idFuncionario FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`,
    [user.tenantId, user.id]
  );

  const idFuncionario = row?.idFuncionario ? Number(row.idFuncionario) : null;
  return { ...user, idFuncionario };
}
