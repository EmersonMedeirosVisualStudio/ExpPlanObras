import { ApiError } from '@/lib/api/http';
import { getCurrentUser, type CurrentUser } from '@/lib/auth/current-user';
import { db } from '@/lib/db';

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('tipo_usuario') || msg.includes('parceiros_usuarios_vinculos') || msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem colunas/tabelas do Portal do Parceiro. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export type ExternalUserContext = CurrentUser & {
  tipoUsuario: 'INTERNO' | 'EXTERNO';
  empresaParceiraId: number;
};

export async function requireExternalUser(): Promise<ExternalUserContext> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'Não autenticado.');
  try {
    const [[u]]: any = await db.query(
      `
      SELECT u.tipo_usuario AS tipoUsuario
      FROM usuarios u
      WHERE u.tenant_id = ? AND u.id_usuario = ?
      LIMIT 1
      `,
      [user.tenantId, user.id]
    );
    const tipo = (u?.tipoUsuario || 'INTERNO').toString().toUpperCase();
    if (tipo !== 'EXTERNO') throw new ApiError(403, 'Acesso negado ao portal do parceiro.');

    const [[vinc]]: any = await db.query(
      `
      SELECT id_empresa_parceira AS idEmpresaParceira
      FROM parceiros_usuarios_vinculos
      WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
      ORDER BY principal DESC, id_parceiro_usuario_vinculo ASC
      LIMIT 1
      `,
      [user.tenantId, user.id]
    );
    const empresaId = vinc?.idEmpresaParceira ? Number(vinc.idEmpresaParceira) : null;
    if (!empresaId) throw new ApiError(403, 'Usuário externo sem vínculo com empresa parceira.');
    return { ...user, tipoUsuario: 'EXTERNO', empresaParceiraId: empresaId };
  } catch (e) {
    return assertSqlReady(e);
  }
}

export async function getEmpresaParceiraLocais(args: { tenantId: number; empresaParceiraId: number }) {
  try {
    const [rows]: any = await db.query(
      `
      SELECT tipo_local AS tipoLocal, id_obra AS idObra, id_unidade AS idUnidade
      FROM empresas_parceiras_acessos_locais
      WHERE tenant_id = ? AND id_empresa_parceira = ? AND ativo = 1
      ORDER BY id_empresa_parceira_acesso_local ASC
      `,
      [args.tenantId, args.empresaParceiraId]
    );
    const obras = (rows as any[]).filter((r) => String(r.tipoLocal || '').toUpperCase() === 'OBRA').map((r) => Number(r.idObra)).filter((n) => Number.isFinite(n));
    const unidades = (rows as any[]).filter((r) => String(r.tipoLocal || '').toUpperCase() === 'UNIDADE').map((r) => Number(r.idUnidade)).filter((n) => Number.isFinite(n));
    return { obras, unidades };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}
