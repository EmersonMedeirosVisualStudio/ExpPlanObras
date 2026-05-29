import prisma from '../../plugins/prisma.js';
function normalizeEffect(v) {
    const s = String(v || '').toUpperCase();
    if (s === 'ALLOW')
        return 'ALLOW';
    if (s === 'MASK')
        return 'MASK';
    if (s === 'HIDE')
        return 'HIDE';
    if (s === 'NULLIFY')
        return 'NULLIFY';
    if (s === 'TRANSFORM')
        return 'TRANSFORM';
    return 'MASK';
}
function normalizeStrategy(v) {
    const s = String(v || '').toUpperCase();
    if (!s)
        return null;
    return s;
}
function effectRank(effect) {
    if (effect === 'HIDE')
        return 5;
    if (effect === 'NULLIFY')
        return 4;
    if (effect === 'MASK')
        return 3;
    if (effect === 'TRANSFORM')
        return 2;
    return 1;
}
export async function loadSubjectContext(args) {
    const link = await prisma.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId: args.tenantId, userId: args.userId } },
        select: { role: true },
    });
    const perfis = await prisma.usuarioPerfil.findMany({
        where: { userId: args.userId, ativo: true },
        include: { perfil: { select: { codigo: true } } },
    });
    return {
        tenantId: args.tenantId,
        userId: args.userId,
        role: link?.role || 'USER',
        perfis: perfis.map((p) => p.perfil.codigo),
    };
}
async function matchesTarget(args) {
    const targets = await prisma.securityFieldPolicyTarget.findMany({
        where: { policyId: args.policyId, ativo: true },
        select: { tipoAlvo: true, userId: true, perfilCodigo: true, permissao: true },
    });
    if (!targets.length)
        return true;
    for (const t of targets) {
        const tipo = String(t.tipoAlvo || '').toUpperCase();
        if (tipo === 'TODOS')
            return true;
        if (tipo === 'USUARIO' && typeof t.userId === 'number' && t.userId === args.userId)
            return true;
        if (tipo === 'PERFIL' && t.perfilCodigo && args.subject.perfis.includes(String(t.perfilCodigo)))
            return true;
        if (tipo === 'ROLE' && t.perfilCodigo && String(args.subject.role) === String(t.perfilCodigo))
            return true;
        if (tipo === 'PERMISSAO' && t.permissao)
            continue;
    }
    return false;
}
export async function evaluateFieldDecision(args) {
    const rows = await prisma.securityFieldPolicy.findMany({
        where: {
            tenantId: args.subject.tenantId,
            recurso: String(args.resource),
            acao: String(args.action),
            caminhoCampo: String(args.path),
            ativo: true,
        },
        select: { id: true, efeitoCampo: true, estrategiaMascara: true, prioridade: true },
        orderBy: [{ prioridade: 'desc' }, { id: 'desc' }],
    });
    let best = null;
    for (const r of rows) {
        const ok = await matchesTarget({ tenantId: args.subject.tenantId, userId: args.subject.userId, subject: args.subject, policyId: Number(r.id) });
        if (!ok)
            continue;
        const effect = normalizeEffect(r.efeitoCampo);
        const strategy = normalizeStrategy(r.estrategiaMascara);
        const item = { id: Number(r.id), efeitoCampo: String(r.efeitoCampo), estrategiaMascara: r.estrategiaMascara ? String(r.estrategiaMascara) : null, prioridade: Number(r.prioridade || 0), effect, strategy };
        if (!best) {
            best = item;
            continue;
        }
        if (item.prioridade > best.prioridade) {
            best = item;
            continue;
        }
        if (item.prioridade === best.prioridade && effectRank(item.effect) > effectRank(best.effect)) {
            best = item;
        }
    }
    if (!best)
        return args.fallback;
    return {
        effect: best.effect,
        strategy: best.strategy ?? args.fallback.strategy ?? null,
        reason: 'DB_POLICY',
        policyId: best.id,
    };
}
export async function writeSensitiveAudit(args) {
    await prisma.securitySensitiveDataAudit.create({
        data: {
            tenantId: args.tenantId,
            userId: args.userId,
            recurso: String(args.recurso),
            acao: String(args.acao),
            entidadeId: typeof args.entidadeId === 'number' ? args.entidadeId : null,
            caminhoCampo: String(args.caminhoCampo),
            resultadoCampo: String(args.resultadoCampo),
            exportacao: Boolean(args.exportacao),
            motivoCodigo: args.motivoCodigo ? String(args.motivoCodigo) : null,
            contextoJson: args.contextoJson ? args.contextoJson : null,
        },
    });
}
