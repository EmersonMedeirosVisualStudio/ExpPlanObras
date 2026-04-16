import { getCurrentUser } from './current-user';
import { PROFILE_CODES } from './permissions';

export async function getCurrentUserPermissions(userId?: number): Promise<string[]> {
  // If we're rendering on the server, we should get the permissions from the session cookie
  // to avoid querying the DB which might not be available on Vercel.
  const user = await getCurrentUser();
  if (user && (!userId || user.id === userId) && Array.isArray(user.permissoes)) {
    const base = user.permissoes as unknown as string[];
    if (Array.isArray(user.perfis) && user.perfis.includes(PROFILE_CODES.REPRESENTANTE_EMPRESA) && !base.includes('*')) {
      return [...base, '*'];
    }
    return base;
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
