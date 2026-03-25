import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import type { CurrentUser } from '@/lib/auth/current-user';
import { evaluatePolicyDecision } from '@/lib/auth/policies/evaluator';
import type { PolicyAction, PolicyResource } from '@/lib/auth/policies/types';

export const runtime = 'nodejs';

async function loadUserForSimulation(args: { tenantId: number; userId: number }): Promise<CurrentUser> {
  const [[u]]: any = await db.query(
    `
    SELECT
      u.id_usuario AS id,
      u.tenant_id AS tenantId,
      u.id_funcionario AS idFuncionario,
      f.nome_completo AS nome,
      u.email_login AS email
    FROM usuarios u
    INNER JOIN funcionarios f ON f.id_funcionario = u.id_funcionario
    WHERE u.tenant_id = ? AND u.id_usuario = ?
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!u) throw new ApiError(404, 'Usuário não encontrado.');

  const [perfisRows]: any = await db.query(
    `
    SELECT DISTINCT p.codigo AS codigo
    FROM usuario_perfis up
    INNER JOIN perfis p ON p.id_perfil = up.id_perfil
    WHERE up.id_usuario = ? AND up.ativo = 1
    ORDER BY p.codigo ASC
    `,
    [args.userId]
  );
  const perfis = (perfisRows as any[]).map((r) => String(r.codigo)).filter(Boolean);

  const [permRows]: any = await db.query(
    `
    SELECT DISTINCT CONCAT(pp.modulo, '.', pp.janela, '.', pp.acao) AS codigo
    FROM usuario_perfis up
    INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil AND pp.permitido = 1
    WHERE up.id_usuario = ? AND up.ativo = 1
    ORDER BY codigo ASC
    `,
    [args.userId]
  );
  const permissoes = (permRows as any[]).map((r) => String(r.codigo)).filter(Boolean);

  const [abrRows]: any = await db.query(
    `
    SELECT
      tipo_abrangencia AS tipoAbrangencia,
      id_setor_diretoria AS idSetorDiretoria,
      id_obra AS idObra,
      id_unidade AS idUnidade
    FROM usuario_abrangencias
    WHERE id_usuario = ? AND ativo = 1
    `,
    [args.userId]
  );

  const empresa = (abrRows as any[]).some((r) => String(r.tipoAbrangencia || '').toUpperCase() === 'EMPRESA');
  const diretorias = (abrRows as any[])
    .filter((r) => String(r.tipoAbrangencia || '').toUpperCase() === 'DIRETORIA')
    .map((r) => Number(r.idSetorDiretoria))
    .filter((n) => Number.isFinite(n));
  const obras = (abrRows as any[])
    .filter((r) => String(r.tipoAbrangencia || '').toUpperCase() === 'OBRA')
    .map((r) => Number(r.idObra))
    .filter((n) => Number.isFinite(n));
  const unidades = (abrRows as any[])
    .filter((r) => String(r.tipoAbrangencia || '').toUpperCase() === 'UNIDADE')
    .map((r) => Number(r.idUnidade))
    .filter((n) => Number.isFinite(n));

  return {
    id: Number(u.id),
    tenantId: Number(u.tenantId),
    idFuncionario: u.idFuncionario !== null && u.idFuncionario !== undefined ? Number(u.idFuncionario) : null,
    nome: String(u.nome),
    email: String(u.email),
    perfis: perfis as any,
    permissoes: permissoes as any,
    abrangencia: { empresa, diretorias, obras, unidades },
  };
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_SIMULAR);
    const body = (await req.json().catch(() => null)) as any;

    const userId = body?.userId !== null && body?.userId !== undefined ? Number(body.userId) : null;
    const entityId = body?.entityId !== null && body?.entityId !== undefined ? Number(body.entityId) : null;

    const resource = String(body?.resource || '').toUpperCase() as PolicyResource;
    const action = String(body?.action || '').toUpperCase() as PolicyAction;
    if (!resource) throw new ApiError(422, 'resource obrigatório.');
    if (!action) throw new ApiError(422, 'action obrigatório.');
    if (entityId !== null && !Number.isFinite(entityId)) throw new ApiError(422, 'entityId inválido.');
    if (userId !== null && !Number.isFinite(userId)) throw new ApiError(422, 'userId inválido.');

    const target = userId ? await loadUserForSimulation({ tenantId: current.tenantId, userId }) : current;
    const decision = await evaluatePolicyDecision({
      current: target,
      resource,
      action,
      entityId: entityId ?? null,
      resourceAttributes: (body?.resourceAttributes && typeof body.resourceAttributes === 'object' ? body.resourceAttributes : undefined) as any,
      context: (body?.context && typeof body.context === 'object' ? body.context : undefined) as any,
      skipRbac: Boolean(body?.skipRbac),
    });

    return ok(decision);
  } catch (e) {
    return handleApiError(e);
  }
}
