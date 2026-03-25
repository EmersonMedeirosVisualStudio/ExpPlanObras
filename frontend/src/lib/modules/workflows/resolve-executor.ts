import { db } from '@/lib/db';
import { findUserIdsByPermission } from '@/lib/modules/automacoes/resolve-responsavel';
import type { WorkflowTipoExecutor } from './types';
import type { WorkflowEntityScope } from './types-internal';

async function findUserIdsByPermissionScoped(args: { tenantId: number; permissionCode: string; scope?: WorkflowEntityScope | null }) {
  const scope = args.scope ?? null;
  const whereScope: string[] = [];
  const params: any[] = [args.tenantId, args.permissionCode];

  if (scope?.idObra) {
    whereScope.push(`(ua.tipo_abrangencia = 'OBRA' AND ua.id_obra = ?)`);
    params.push(Number(scope.idObra));
  }
  if (scope?.idUnidade) {
    whereScope.push(`(ua.tipo_abrangencia = 'UNIDADE' AND ua.id_unidade = ?)`);
    params.push(Number(scope.idUnidade));
  }
  if (scope?.idDiretoria) {
    whereScope.push(`(ua.tipo_abrangencia = 'DIRETORIA' AND ua.id_setor_diretoria = ?)`);
    params.push(Number(scope.idDiretoria));
  }

  const scopeSql = whereScope.length
    ? `AND (ua.tipo_abrangencia = 'EMPRESA' OR ${whereScope.join(' OR ')})`
    : '';

  const [rows]: any = await db.query(
    `
    SELECT DISTINCT u.id_usuario AS id
    FROM usuarios u
    INNER JOIN usuario_perfis up ON up.id_usuario = u.id_usuario AND up.ativo = 1
    INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil
    INNER JOIN usuario_abrangencias ua ON ua.id_usuario = u.id_usuario AND ua.ativo = 1
    WHERE u.tenant_id = ?
      AND u.ativo = 1
      AND pp.codigo_permissao = ?
      ${scopeSql}
    ORDER BY u.id_usuario ASC
    LIMIT 200
    `,
    params
  );

  return (rows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
}

async function resolveSuperiorHierarquicoUserId(args: { tenantId: number; solicitanteUserId: number }) {
  const [[row]]: any = await db.query(
    `
    SELECT u.id_funcionario AS idFuncionario
    FROM usuarios u
    WHERE u.tenant_id = ? AND u.id_usuario = ?
    LIMIT 1
    `,
    [args.tenantId, args.solicitanteUserId]
  );
  const idFuncionario = row?.idFuncionario !== null && row?.idFuncionario !== undefined ? Number(row.idFuncionario) : null;
  if (!idFuncionario) return null;

  const [[sup]]: any = await db.query(
    `
    SELECT fs.id_supervisor_funcionario AS idSupervisorFuncionario
    FROM funcionarios_supervisao fs
    WHERE fs.id_funcionario = ? AND fs.atual = 1
    LIMIT 1
    `,
    [idFuncionario]
  );
  const idSupervisorFuncionario =
    sup?.idSupervisorFuncionario !== null && sup?.idSupervisorFuncionario !== undefined ? Number(sup.idSupervisorFuncionario) : null;
  if (!idSupervisorFuncionario) return null;

  const [[uSup]]: any = await db.query(
    `
    SELECT u.id_usuario AS id
    FROM usuarios u
    WHERE u.tenant_id = ? AND u.id_funcionario = ? AND u.ativo = 1
    LIMIT 1
    `,
    [args.tenantId, idSupervisorFuncionario]
  );
  return uSup?.id !== null && uSup?.id !== undefined ? Number(uSup.id) : null;
}

export async function canExecuteTransition(args: {
  tenantId: number;
  tipoExecutor: WorkflowTipoExecutor;
  userId: number;
  solicitanteUserId: number | null;
  responsavelAtualUserId: number | null;
  idUsuarioExecutor: number | null;
  permissaoExecutor: string | null;
  scope?: WorkflowEntityScope | null;
}): Promise<boolean> {
  const tipo = args.tipoExecutor;
  if (tipo === 'SOLICITANTE') return !!args.solicitanteUserId && args.solicitanteUserId === args.userId;
  if (tipo === 'RESPONSAVEL_ATUAL') return !!args.responsavelAtualUserId && args.responsavelAtualUserId === args.userId;
  if (tipo === 'USUARIO') return !!args.idUsuarioExecutor && args.idUsuarioExecutor === args.userId;
  if (tipo === 'PERMISSAO') {
    if (!args.permissaoExecutor) return false;
    const ids = await findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: args.permissaoExecutor });
    return ids.includes(args.userId);
  }
  if (tipo === 'GESTOR_LOCAL') {
    const perm = args.permissaoExecutor || 'dashboard.gerente.view';
    const ids = await findUserIdsByPermissionScoped({ tenantId: args.tenantId, permissionCode: perm, scope: args.scope });
    return ids.includes(args.userId);
  }
  if (tipo === 'APROVADOR') {
    const ids = await findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: 'aprovacoes.decidir' });
    return ids.includes(args.userId);
  }
  return false;
}

export async function resolveDefaultResponsavel(args: {
  tenantId: number;
  tipoExecutor: WorkflowTipoExecutor;
  solicitanteUserId: number | null;
  responsavelAtualUserId: number | null;
  idUsuarioExecutor: number | null;
  permissaoExecutor: string | null;
  scope?: WorkflowEntityScope | null;
}): Promise<number | null> {
  const tipo = args.tipoExecutor;
  if (tipo === 'SOLICITANTE') return args.solicitanteUserId ?? null;
  if (tipo === 'RESPONSAVEL_ATUAL') return args.responsavelAtualUserId ?? null;
  if (tipo === 'USUARIO') return args.idUsuarioExecutor ?? null;
  if (tipo === 'PERMISSAO') {
    if (!args.permissaoExecutor) return null;
    const ids = await findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: args.permissaoExecutor });
    return ids.length ? ids[0] : null;
  }
  if (tipo === 'GESTOR_LOCAL') {
    const perm = args.permissaoExecutor || 'dashboard.gerente.view';
    const ids = await findUserIdsByPermissionScoped({ tenantId: args.tenantId, permissionCode: perm, scope: args.scope });
    return ids.length ? ids[0] : null;
  }
  if (tipo === 'APROVADOR') {
    const ids = await findUserIdsByPermission({ tenantId: args.tenantId, permissionCode: 'aprovacoes.decidir' });
    return ids.length ? ids[0] : null;
  }
  return null;
}

export async function resolveSuperiorHierarquico(args: { tenantId: number; solicitanteUserId: number | null }) {
  if (!args.solicitanteUserId) return null;
  return resolveSuperiorHierarquicoUserId({ tenantId: args.tenantId, solicitanteUserId: args.solicitanteUserId });
}

