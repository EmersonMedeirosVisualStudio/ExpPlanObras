import { hasPermission } from '@/lib/auth/access';
import type { CurrentUser } from '@/lib/auth/current-user';
import { ApiError } from '@/lib/api/http';
import type { ActionContext, PolicyAction, PolicyDecision, PolicyResource, ResourceContext, SubjectContext } from './types';
import { evaluateCondition } from './conditions';
import { passesBaseScope } from './base-scope';
import { getRequiredBasePermission } from './mapping';
import { loadResourceContextFromIndex } from './resources';
import { auditPolicyDecision } from './audit';
import { listarPoliticasAtivasParaRecurso } from './server';

function nowIso() {
  return new Date().toISOString();
}

export function buildSubjectContext(current: CurrentUser): SubjectContext {
  const diretorias = Array.isArray(current.abrangencia?.diretorias) ? current.abrangencia.diretorias : [];
  return {
    tenantId: current.tenantId,
    userId: current.id,
    roles: Array.isArray(current.perfis) ? current.perfis.map((p) => String(p)) : [],
    permissions: Array.isArray(current.permissoes) ? current.permissoes.map((p) => String(p)) : [],
    scope: {
      empresaTotal: Boolean(current.abrangencia?.empresa),
      diretorias: diretorias.map((n) => Number(n)).filter((n) => Number.isFinite(n)),
      obras: (current.abrangencia?.obras || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
      unidades: (current.abrangencia?.unidades || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
    },
  };
}

function targetMatches(subject: SubjectContext, target: any): boolean {
  const tipo = String(target.tipoAlvo || '').toUpperCase();
  if (tipo === 'TODOS') return true;
  if (tipo === 'USUARIO') return Number(target.idUsuario) === subject.userId;
  if (tipo === 'PERFIL') return !!target.chavePerfil && subject.roles.includes(String(target.chavePerfil));
  if (tipo === 'PERMISSAO') return !!target.chavePermissao && subject.permissions.includes(String(target.chavePermissao));
  return false;
}

function orderRules(rules: any[]) {
  return rules
    .slice()
    .sort((a, b) => {
      const pa = Number(a.prioridade || 0);
      const pb = Number(b.prioridade || 0);
      if (pb !== pa) return pb - pa;
      const ea = String(a.efeito || '').toUpperCase();
      const eb = String(b.efeito || '').toUpperCase();
      if (ea !== eb) return ea === 'DENY' ? -1 : 1;
      return Number(a.id || 0) - Number(b.id || 0);
    });
}

export async function resolveResourceContext(args: {
  tenantId: number;
  resource: PolicyResource;
  entityId?: number | null;
  attributes?: Record<string, unknown>;
}): Promise<ResourceContext> {
  const base: ResourceContext = {
    resource: args.resource,
    entityId: args.entityId ?? null,
    attributes: args.attributes || undefined,
  };
  if (!args.entityId) return base;
  try {
    const fromIndex = await loadResourceContextFromIndex(args.tenantId, args.resource, Number(args.entityId));
    if (fromIndex) return { ...fromIndex, attributes: { ...(fromIndex.attributes || {}), ...(args.attributes || {}) } };
    return base;
  } catch {
    return base;
  }
}

export async function evaluatePolicyDecision(args: {
  current: CurrentUser;
  resource: PolicyResource;
  action: PolicyAction;
  entityId?: number | null;
  resourceAttributes?: Record<string, unknown>;
  context?: Partial<ActionContext>;
  skipRbac?: boolean;
}): Promise<PolicyDecision> {
  const startedAt = Date.now();
  const subject = buildSubjectContext(args.current);
  const context: ActionContext = {
    action: args.action,
    nowIso: nowIso(),
    ip: args.context?.ip ?? null,
    userAgent: args.context?.userAgent ?? null,
    route: args.context?.route ?? null,
  };

  const required = getRequiredBasePermission(args.resource, args.action);
  if (!args.skipRbac) {
    if (!required) {
      const out: PolicyDecision = { allowed: false, source: 'RBAC', reason: 'RBAC_MAPPING_MISSING' };
      await auditPolicyDecision({
        tenantId: subject.tenantId,
        userId: subject.userId,
        recurso: args.resource,
        acao: args.action,
        entidadeId: args.entityId ?? null,
        resultado: 'DENY',
        motivoCodigo: out.reason,
        latenciaMs: Date.now() - startedAt,
        contexto: { subject, resource: { resource: args.resource, entityId: args.entityId ?? null }, context },
      });
      return out;
    }
    if (!hasPermission(args.current, required as any)) {
      const out: PolicyDecision = { allowed: false, source: 'RBAC', reason: 'RBAC_PERMISSION_DENIED' };
      await auditPolicyDecision({
        tenantId: subject.tenantId,
        userId: subject.userId,
        recurso: args.resource,
        acao: args.action,
        entidadeId: args.entityId ?? null,
        resultado: 'DENY',
        motivoCodigo: out.reason,
        latenciaMs: Date.now() - startedAt,
        contexto: { subject, resource: { resource: args.resource, entityId: args.entityId ?? null }, context, required },
      });
      return out;
    }
  }

  const resource = await resolveResourceContext({
    tenantId: subject.tenantId,
    resource: args.resource,
    entityId: args.entityId ?? null,
    attributes: args.resourceAttributes,
  });

  if (args.entityId && !passesBaseScope(subject, resource)) {
    const out: PolicyDecision = { allowed: false, source: 'SCOPE', reason: 'BASE_SCOPE_DENIED' };
    const pols = await listarPoliticasAtivasParaRecurso(subject.tenantId, args.resource, args.action).catch(() => []);
    for (const p of pols) {
      const targets = (p.alvos || []).filter((t: any) => targetMatches(subject, t));
      if (!targets.length) continue;
      const rules = orderRules(p.regras || []);
      for (const r of rules) {
        const ok = evaluateCondition(r.condicao, { subject, resource, context });
        if (!ok) continue;
        const efeito = String(r.efeito || '').toUpperCase();
        if (efeito === 'DENY') {
          const decision: PolicyDecision = { allowed: false, source: 'ABAC', policyId: p.id, ruleId: r.id, reason: 'ABAC_DENY' };
          await auditPolicyDecision({
            tenantId: subject.tenantId,
            userId: subject.userId,
            recurso: args.resource,
            acao: args.action,
            entidadeId: args.entityId ?? null,
            resultado: 'DENY',
            motivoCodigo: decision.reason,
            policyId: p.id,
            ruleId: r.id,
            latenciaMs: Date.now() - startedAt,
            contexto: { subject, resource, context },
          });
          return decision;
        }
      }
      for (const r of rules) {
        const ok = evaluateCondition(r.condicao, { subject, resource, context });
        if (!ok) continue;
        const efeito = String(r.efeito || '').toUpperCase();
        if (efeito === 'ALLOW') {
          const decision: PolicyDecision = { allowed: true, source: 'ABAC', policyId: p.id, ruleId: r.id, reason: 'ABAC_ALLOW' };
          await auditPolicyDecision({
            tenantId: subject.tenantId,
            userId: subject.userId,
            recurso: args.resource,
            acao: args.action,
            entidadeId: args.entityId ?? null,
            resultado: 'ALLOW',
            motivoCodigo: decision.reason,
            policyId: p.id,
            ruleId: r.id,
            latenciaMs: Date.now() - startedAt,
            contexto: { subject, resource, context },
          });
          return decision;
        }
      }
    }

    await auditPolicyDecision({
      tenantId: subject.tenantId,
      userId: subject.userId,
      recurso: args.resource,
      acao: args.action,
      entidadeId: args.entityId ?? null,
      resultado: 'DENY',
      motivoCodigo: out.reason,
      latenciaMs: Date.now() - startedAt,
      contexto: { subject, resource, context },
    });
    return out;
  }

  const policies = await listarPoliticasAtivasParaRecurso(subject.tenantId, args.resource, args.action).catch(() => []);
  for (const p of policies) {
    const targets = (p.alvos || []).filter((t: any) => targetMatches(subject, t));
    if (!targets.length) continue;
    const rules = orderRules(p.regras || []);
    for (const r of rules) {
      const ok = evaluateCondition(r.condicao, { subject, resource, context });
      if (!ok) continue;
      if (String(r.efeito || '').toUpperCase() === 'DENY') {
        const decision: PolicyDecision = { allowed: false, source: 'ABAC', policyId: p.id, ruleId: r.id, reason: 'ABAC_DENY' };
        await auditPolicyDecision({
          tenantId: subject.tenantId,
          userId: subject.userId,
          recurso: args.resource,
          acao: args.action,
          entidadeId: args.entityId ?? null,
          resultado: 'DENY',
          motivoCodigo: decision.reason,
          policyId: p.id,
          ruleId: r.id,
          latenciaMs: Date.now() - startedAt,
          contexto: { subject, resource, context },
        });
        return decision;
      }
    }
  }

  for (const p of policies) {
    const targets = (p.alvos || []).filter((t: any) => targetMatches(subject, t));
    if (!targets.length) continue;
    const rules = orderRules(p.regras || []);
    for (const r of rules) {
      const ok = evaluateCondition(r.condicao, { subject, resource, context });
      if (!ok) continue;
      if (String(r.efeito || '').toUpperCase() === 'ALLOW') {
        const decision: PolicyDecision = { allowed: true, source: 'ABAC', policyId: p.id, ruleId: r.id, reason: 'ABAC_ALLOW' };
        await auditPolicyDecision({
          tenantId: subject.tenantId,
          userId: subject.userId,
          recurso: args.resource,
          acao: args.action,
          entidadeId: args.entityId ?? null,
          resultado: 'ALLOW',
          motivoCodigo: decision.reason,
          policyId: p.id,
          ruleId: r.id,
          latenciaMs: Date.now() - startedAt,
          contexto: { subject, resource, context },
        });
        return decision;
      }
    }
  }

  const out: PolicyDecision = { allowed: true, source: 'SCOPE', reason: 'BASE_SCOPE_ALLOW' };
  await auditPolicyDecision({
    tenantId: subject.tenantId,
    userId: subject.userId,
    recurso: args.resource,
    acao: args.action,
    entidadeId: args.entityId ?? null,
    resultado: 'ALLOW',
    motivoCodigo: out.reason,
    latenciaMs: Date.now() - startedAt,
    contexto: { subject, resource, context },
  });
  return out;
}

export async function requireApiPolicy(args: { current: CurrentUser; resource: PolicyResource; action: PolicyAction; entityId?: number | null; resourceAttributes?: Record<string, unknown> }) {
  const decision = await evaluatePolicyDecision({
    current: args.current,
    resource: args.resource,
    action: args.action,
    entityId: args.entityId ?? null,
    resourceAttributes: args.resourceAttributes,
  });
  if (!decision.allowed) throw new ApiError(403, 'Acesso negado.');
  return decision;
}

