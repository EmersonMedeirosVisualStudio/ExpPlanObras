import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import { getCurrentUser } from '@/lib/auth/current-user';
import { hasPermission } from '@/lib/auth/access';
import type { Permission } from '@/lib/auth/permissions';

export async function requireCurrentEncarregado(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Não autenticado.');
  if (!hasPermission(user, permission)) throw new ApiError(403, 'Acesso negado.');

  const [[encarregado]]: any = await db.query(
    `SELECT id_empresa_encarregado_sistema
     FROM empresa_encarregado_sistema
     WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
     ORDER BY data_inicio DESC
     LIMIT 1`,
    [user.tenantId, user.id]
  );

  if (!encarregado) throw new ApiError(403, 'Usuário não é o Encarregado atual da empresa.');
  return user;
}
