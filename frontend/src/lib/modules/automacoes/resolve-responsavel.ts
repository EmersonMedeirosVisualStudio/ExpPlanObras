import { db } from '@/lib/db';

export async function findUserIdsByPermission(args: { tenantId: number; permissionCode: string }): Promise<number[]> {
  const code = String(args.permissionCode || '').trim();
  if (!code) return [];
  try {
    const [rows]: any = await db.query(
      `
      SELECT DISTINCT up.id_usuario AS id
      FROM usuario_perfis up
      INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil AND pp.permitido = 1
      WHERE up.ativo = 1
        AND CONCAT(pp.modulo, '.', pp.janela, '.', pp.acao) = ?
      `,
      [code]
    );
    return (rows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

export async function resolveResponsavelUserIds(args: {
  tenantId: number;
  responsavelTipo: 'USUARIO' | 'PERMISSAO' | 'GESTOR_LOCAL';
  idUsuarioResponsavel: number | null;
  permissaoResponsavel: string | null;
}): Promise<number[]> {
  if (args.responsavelTipo === 'USUARIO' && args.idUsuarioResponsavel) return [args.idUsuarioResponsavel];
  if (args.responsavelTipo === 'PERMISSAO' && args.permissaoResponsavel) {
    return findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: args.permissaoResponsavel });
  }
  return [];
}

