import { applyMask } from './maskers.js';
import { getCatalogForResource } from './catalog.js';
import { deleteAt, setAt, visitByPattern } from './path-utils.js';
import { evaluateFieldDecision, writeSensitiveAudit } from './service.js';
import type { FieldCatalogEntry, FieldDecision, SanitizeContext, SubjectContext } from './types.js';

function deepClone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

function shouldAudit(entry: FieldCatalogEntry, decision: FieldDecision, ctx: SanitizeContext) {
  const sensitive = entry.classification === 'SENSIVEL' || entry.classification === 'RESTRITO';
  if (!sensitive) return false;
  if (decision.effect === 'HIDE' || decision.effect === 'NULLIFY') return false;
  if (ctx.action === 'EXPORT' || ctx.exportacao) return true;
  return decision.effect === 'ALLOW';
}

export async function sanitizeResourceObject<T>(data: T, ctx: SanitizeContext, subject: SubjectContext): Promise<T> {
  if (data === null || data === undefined) return data;
  const catalog = getCatalogForResource(ctx.resource);
  if (!catalog.length) return data;

  const out = deepClone(data);

  for (const entry of catalog) {
    const fallback: FieldDecision = {
      effect: entry.defaultEffect || 'ALLOW',
      strategy: entry.defaultMaskStrategy ?? null,
      reason: 'CATALOG_DEFAULT',
      policyId: null,
    };
    const decision = await evaluateFieldDecision({
      subject,
      resource: ctx.resource,
      action: ctx.action,
      path: entry.path,
      fallback,
    });

    visitByPattern(out, entry.path, (parent, key, value, concretePath) => {
      if (decision.effect === 'HIDE') {
        deleteAt(parent, key);
        return;
      }
      if (decision.effect === 'NULLIFY') {
        setAt(parent, key, null);
        return;
      }
      if (decision.effect === 'MASK') {
        const s = decision.strategy || entry.defaultMaskStrategy || null;
        if (!s) return;
        setAt(parent, key, applyMask(s, value));
        return;
      }
      if (decision.effect === 'TRANSFORM') {
        const s = decision.strategy || entry.defaultMaskStrategy || null;
        if (!s) return;
        setAt(parent, key, applyMask(s, value));
        return;
      }
    });

    if (shouldAudit(entry, decision, ctx)) {
      await writeSensitiveAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        recurso: ctx.resource,
        acao: ctx.action,
        entidadeId: typeof ctx.entityId === 'number' ? ctx.entityId : null,
        caminhoCampo: entry.path,
        resultadoCampo: decision.effect,
        exportacao: Boolean(ctx.exportacao || ctx.action === 'EXPORT'),
        motivoCodigo: decision.reason || null,
        contextoJson: { policyId: decision.policyId, concrete: entry.path },
      });
    }
  }

  return out;
}

