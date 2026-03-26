import { getCurrentUser } from './current-user';

export async function getCurrentUserPermissions(userId?: number): Promise<string[]> {
  // If we're rendering on the server, we should get the permissions from the session cookie
  // to avoid querying the DB which might not be available on Vercel.
  const user = await getCurrentUser();
  if (user && (!userId || user.id === userId) && Array.isArray(user.permissoes)) {
    return user.permissoes as unknown as string[];
  }
  
  if (!userId) return [];

  // Fallback for API routes
  const { db } = await import('@/lib/db');
  const [rows]: any = await db.query(
    `
    SELECT pp.codigo_permissao AS codigo
    FROM usuario_perfis up
    INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil
    WHERE up.id_usuario = ? AND up.ativo = 1
    `,
    [userId]
  );
  return (rows as any[]).map((r) => String(r.codigo));
}

