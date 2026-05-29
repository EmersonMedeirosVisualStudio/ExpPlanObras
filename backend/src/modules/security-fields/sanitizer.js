import { applyMask } from './maskers.js';
import { getCatalogForResource } from './catalog.js';
import { deleteAt, setAt, visitByPattern } from './path-utils.js';
import { evaluateFieldDecision, writeSensitiveAudit } from './service.js';
function deepClone(data) {
    return JSON.parse(JSON.stringify(data));
}
function shouldAudit(entry, decision, ctx) {
    const sensitive = entry.classification === 'SENSIVEL' || entry.classification === 'RESTRITO';
    if (!sensitive)
        return false;
    if (decision.effect === 'HIDE' || decision.effect === 'NULLIFY')
        return false;
    if (ctx.action === 'EXPORT' || ctx.exportacao)
        return true;
    return decision.effect === 'ALLOW';
}
export async function sanitizeResourceObject(data, ctx, subject) {
    if (data === null || data === undefined)
        return data;
    const catalog = getCatalogForResource(ctx.resource);
    if (!catalog.length)
        return data;
    const out = deepClone(data);
    for (const entry of catalog) {
        const fallback = {
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
                if (!s)
                    return;
                setAt(parent, key, applyMask(s, value));
                return;
            }
            if (decision.effect === 'TRANSFORM') {
                const s = decision.strategy || entry.defaultMaskStrategy || null;
                if (!s)
                    return;
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
