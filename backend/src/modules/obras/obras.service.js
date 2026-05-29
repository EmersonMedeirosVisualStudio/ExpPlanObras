import prisma, { setTenantContext } from "../../plugins/prisma.js";
// Helper to execute with RLS context
// This ensures that the tenant_id is set for the transaction session
async function withRLS(tenantId, callback) {
    return prisma.$transaction(async (tx) => {
        // Set tenant context for RLS
        await setTenantContext(tx, tenantId);
        return callback(tx);
    });
}
async function recomputeContratoValorTotalAtual(tx, tenantId, contratoId) {
    const agg = await tx.obra.aggregate({
        where: { tenantId, contratoId },
        _sum: { valorAtual: true },
    });
    const soma = agg?._sum?.valorAtual == null ? 0 : Number(agg._sum.valorAtual);
    const valorTotalAtual = Number.isFinite(soma) ? soma : 0;
    await tx.contrato.updateMany({
        where: { tenantId, id: contratoId },
        data: { valorTotalAtual },
    });
    return valorTotalAtual;
}
export async function createObra(input, tenantId) {
    return withRLS(tenantId, async (tx) => {
        const contrato = await tx.contrato.findFirst({ where: { tenantId, id: input.contratoId }, select: { id: true } }).catch(() => null);
        if (!contrato)
            throw new Error('Contrato não encontrado');
        const created = await tx.obra.create({
            data: {
                ...input,
                valorAtual: input.valorPrevisto == null ? 0 : input.valorPrevisto,
                tenantId,
            },
        });
        await recomputeContratoValorTotalAtual(tx, tenantId, Number(created.contratoId));
        return created;
    });
}
function scopeWhere(tenantId, scope) {
    if (!scope || scope.empresa)
        return { tenantId };
    if (Array.isArray(scope.obras) && scope.obras.length > 0)
        return { tenantId, id: { in: scope.obras } };
    return { tenantId, id: { in: [-1] } };
}
function canAccessObraId(obraId, scope) {
    if (!scope || scope.empresa)
        return true;
    return Array.isArray(scope.obras) && scope.obras.includes(obraId);
}
export async function getObras(tenantId, scope, filter) {
    return withRLS(tenantId, async (tx) => {
        const contratoId = typeof filter?.contratoId === 'number' && Number.isInteger(filter.contratoId) && filter.contratoId > 0 ? filter.contratoId : null;
        const obras = await tx.obra.findMany({
            orderBy: { createdAt: 'desc' },
            where: { ...scopeWhere(tenantId, scope), ...(contratoId ? { contratoId } : {}) },
            include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
        });
        return obras.map((o) => {
            const enderecos = Array.isArray(o.enderecosObra) ? o.enderecosObra : [];
            const principal = enderecos.find((e) => e.principal) || enderecos[0] || null;
            return { ...o, enderecosObra: enderecos, enderecoObra: principal };
        });
    });
}
function toNumberOrZero(v) {
    if (v == null)
        return 0;
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
export async function getObrasResumoFinanceiro(tenantId, scope, filter) {
    return withRLS(tenantId, async (tx) => {
        const contratoId = typeof filter?.contratoId === 'number' && Number.isInteger(filter.contratoId) && filter.contratoId > 0 ? filter.contratoId : null;
        const obras = await tx.obra.findMany({
            where: { ...scopeWhere(tenantId, scope), ...(contratoId ? { contratoId } : {}) },
            select: { id: true, valorAtual: true },
        });
        const obraIds = obras.map((o) => Number(o.id)).filter((id) => Number.isFinite(id) && id > 0);
        if (!obraIds.length)
            return [];
        const medicaoSums = await tx.medicao.groupBy({
            by: ['obraId'],
            where: { obraId: { in: obraIds } },
            _sum: { amount: true },
        });
        const medidoByObraId = new Map();
        for (const r of medicaoSums) {
            medidoByObraId.set(Number(r.obraId), toNumberOrZero(r?._sum?.amount));
        }
        return obras.map((o) => {
            const id = Number(o.id);
            const valorTotal = o.valorAtual == null ? 0 : toNumberOrZero(o.valorAtual);
            const valorMedido = medidoByObraId.get(id) ?? 0;
            return { obraId: id, valorTotal, valorMedido };
        });
    });
}
export async function getObraById(id, tenantId, scope) {
    if (!canAccessObraId(id, scope)) {
        throw new Error("Access denied");
    }
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findUnique({
            where: { id },
            include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
        });
        // RLS policy in DB will prevent reading other tenant's data
        // But application level check is a good redundancy
        if (obra && obra.tenantId !== tenantId) {
            throw new Error("Access denied");
        }
        if (!obra)
            return obra;
        const enderecos = Array.isArray(obra.enderecosObra) ? obra.enderecosObra : [];
        const principal = enderecos.find((e) => e.principal) || enderecos[0] || null;
        return { ...obra, enderecosObra: enderecos, enderecoObra: principal };
    });
}
export async function updateObra(id, input, tenantId, scope) {
    if (!canAccessObraId(id, scope)) {
        throw new Error("Access denied");
    }
    return withRLS(tenantId, async (tx) => {
        const current = await tx.obra.findFirst({ where: { id, tenantId }, select: { id: true, contratoId: true } }).catch(() => null);
        if (!current)
            throw new Error("Obra not found or access denied");
        if (input.contratoId != null) {
            const contrato = await tx.contrato.findFirst({ where: { tenantId, id: input.contratoId }, select: { id: true } }).catch(() => null);
            if (!contrato)
                throw new Error('Contrato não encontrado');
        }
        // Verify ownership first or rely on RLS update policy
        // With RLS, if the row is not visible, update might affect 0 rows or throw
        const count = await tx.obra.updateMany({
            where: {
                id,
                tenantId
            },
            data: input
        });
        if (count.count === 0) {
            throw new Error("Obra not found or access denied");
        }
        const nextContratoId = input.contratoId != null ? Number(input.contratoId) : Number(current.contratoId);
        const prevContratoId = Number(current.contratoId);
        if (nextContratoId !== prevContratoId) {
            await recomputeContratoValorTotalAtual(tx, tenantId, prevContratoId);
            await recomputeContratoValorTotalAtual(tx, tenantId, nextContratoId);
        }
        return getObraById(id, tenantId, scope);
    });
}
export async function deleteObra(id, tenantId, scope) {
    if (!canAccessObraId(id, scope)) {
        throw new Error("Access denied");
    }
    return withRLS(tenantId, async (tx) => {
        const current = await tx.obra.findFirst({ where: { id, tenantId }, select: { id: true, contratoId: true } }).catch(() => null);
        if (!current)
            throw new Error("Obra not found or access denied");
        const count = await tx.obra.deleteMany({
            where: {
                id,
                tenantId
            },
        });
        if (count.count === 0) {
            throw new Error("Obra not found or access denied");
        }
        await recomputeContratoValorTotalAtual(tx, tenantId, Number(current.contratoId));
        return { success: true };
    });
}
function isEmptyValue(v) {
    const s = typeof v === 'string' ? v.trim() : '';
    return !s;
}
export async function getEnderecoObra(obraId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        return tx.enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] });
    });
}
export async function upsertEnderecoObra(obraId, tenantId, input, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    const origemEndereco = String(input.origemEndereco || 'MANUAL').toUpperCase() || 'MANUAL';
    const origemCoordenada = String(input.origemCoordenada || 'MANUAL').toUpperCase() || 'MANUAL';
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const current = await tx.enderecoObra
            .findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] })
            .catch(() => null);
        const addrPatch = {};
        const coordPatch = {};
        const setAddrField = (key, value) => {
            if (value === undefined)
                return;
            if (current && String(current.origemEndereco || '').toUpperCase() === 'MANUAL' && origemEndereco !== 'MANUAL' && !isEmptyValue(current[key])) {
                return;
            }
            addrPatch[key] = value === '' ? null : value;
        };
        const setCoordField = (key, value) => {
            if (value === undefined)
                return;
            if (current && String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' && origemCoordenada !== 'MANUAL' && !isEmptyValue(current[key])) {
                return;
            }
            coordPatch[key] = value === '' ? null : value;
        };
        setAddrField('cep', input.cep);
        setAddrField('logradouro', input.logradouro);
        setAddrField('numero', input.numero);
        setAddrField('complemento', input.complemento);
        setAddrField('bairro', input.bairro);
        setAddrField('cidade', input.cidade);
        setAddrField('uf', input.uf);
        setCoordField('latitude', input.latitude);
        setCoordField('longitude', input.longitude);
        const origemEnderecoFinal = origemEndereco === 'MANUAL' ? 'MANUAL' : current && String(current.origemEndereco || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemEndereco;
        const origemCoordenadaFinal = origemCoordenada === 'MANUAL' ? 'MANUAL' : current && String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemCoordenada;
        const dataToWrite = {
            tenantId,
            obraId,
            ...addrPatch,
            ...coordPatch,
            origemEndereco: origemEnderecoFinal,
            origemCoordenada: origemCoordenadaFinal,
            principal: true,
        };
        let saved;
        if (current?.id) {
            saved = await tx.enderecoObra.update({ where: { id: current.id }, data: dataToWrite });
        }
        else {
            saved = await tx.enderecoObra.create({ data: { ...dataToWrite, principal: true } });
        }
        await tx.enderecoObra.updateMany({
            where: { tenantId, obraId, id: { not: saved.id } },
            data: { principal: false },
        });
        return saved;
    });
}
export async function listEnderecosObra(obraId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        return tx.enderecoObra.findMany({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] });
    });
}
export async function createEnderecoObra(obraId, tenantId, input, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    const origemEndereco = String(input.origemEndereco || 'MANUAL').toUpperCase() || 'MANUAL';
    const origemCoordenada = String(input.origemCoordenada || 'MANUAL').toUpperCase() || 'MANUAL';
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const existingPrincipal = await tx.enderecoObra.findFirst({ where: { tenantId, obraId, principal: true }, select: { id: true } }).catch(() => null);
        const shouldBePrincipal = Boolean(input.principal) || !existingPrincipal;
        const created = await tx.enderecoObra.create({
            data: {
                tenantId,
                obraId,
                nomeEndereco: input.nomeEndereco ? String(input.nomeEndereco).trim() || 'Principal' : 'Principal',
                principal: shouldBePrincipal,
                cep: input.cep ?? null,
                logradouro: input.logradouro ?? null,
                numero: input.numero ?? null,
                complemento: input.complemento ?? null,
                bairro: input.bairro ?? null,
                cidade: input.cidade ?? null,
                uf: input.uf ?? null,
                latitude: input.latitude ?? null,
                longitude: input.longitude ?? null,
                origemEndereco,
                origemCoordenada,
            },
        });
        if (shouldBePrincipal) {
            await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: created.id } }, data: { principal: false } });
        }
        return created;
    });
}
export async function updateEnderecoObraById(obraId, enderecoId, tenantId, input, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    const origemEndereco = String(input.origemEndereco || 'MANUAL').toUpperCase() || 'MANUAL';
    const origemCoordenada = String(input.origemCoordenada || 'MANUAL').toUpperCase() || 'MANUAL';
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const current = await tx.enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId } }).catch(() => null);
        if (!current)
            throw new Error('Endereço não encontrado');
        const addrPatch = {};
        const coordPatch = {};
        const patch = {};
        const setAddrField = (key, value) => {
            if (value === undefined)
                return;
            if (String(current.origemEndereco || '').toUpperCase() === 'MANUAL' && origemEndereco !== 'MANUAL' && !isEmptyValue(current[key])) {
                return;
            }
            addrPatch[key] = value === '' ? null : value;
        };
        const setCoordField = (key, value) => {
            if (value === undefined)
                return;
            if (String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' && origemCoordenada !== 'MANUAL' && !isEmptyValue(current[key])) {
                return;
            }
            coordPatch[key] = value === '' ? null : value;
        };
        if (input.nomeEndereco !== undefined) {
            const n = input.nomeEndereco ? String(input.nomeEndereco).trim() : '';
            patch.nomeEndereco = n || 'Principal';
        }
        if (input.principal !== undefined) {
            patch.principal = Boolean(input.principal);
        }
        setAddrField('cep', input.cep);
        setAddrField('logradouro', input.logradouro);
        setAddrField('numero', input.numero);
        setAddrField('complemento', input.complemento);
        setAddrField('bairro', input.bairro);
        setAddrField('cidade', input.cidade);
        setAddrField('uf', input.uf);
        setCoordField('latitude', input.latitude);
        setCoordField('longitude', input.longitude);
        const origemEnderecoFinal = origemEndereco === 'MANUAL' ? 'MANUAL' : String(current.origemEndereco || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemEndereco;
        const origemCoordenadaFinal = origemCoordenada === 'MANUAL' ? 'MANUAL' : String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemCoordenada;
        const saved = await tx.enderecoObra.update({
            where: { id: current.id },
            data: { ...patch, ...addrPatch, ...coordPatch, origemEndereco: origemEnderecoFinal, origemCoordenada: origemCoordenadaFinal },
        });
        if (saved.principal) {
            await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: saved.id } }, data: { principal: false } });
        }
        else {
            const hasPrincipal = await tx.enderecoObra.findFirst({ where: { tenantId, obraId, principal: true }, select: { id: true } }).catch(() => null);
            if (!hasPrincipal) {
                await tx.enderecoObra.update({ where: { id: saved.id }, data: { principal: true } });
                await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: saved.id } }, data: { principal: false } });
            }
        }
        return saved;
    });
}
export async function deleteEnderecoObraById(obraId, enderecoId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const current = await tx.enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId }, select: { id: true, principal: true } }).catch(() => null);
        if (!current)
            throw new Error('Endereço não encontrado');
        await tx.enderecoObra.delete({ where: { id: enderecoId } });
        if (current.principal) {
            const next = await tx.enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: { id: 'asc' }, select: { id: true } }).catch(() => null);
            if (next?.id) {
                await tx.enderecoObra.update({ where: { id: next.id }, data: { principal: true } });
                await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: next.id } }, data: { principal: false } });
            }
        }
        return { success: true };
    });
}
export async function getPlanilhaContratadaResumo(obraId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const planilha = await tx.obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null);
        if (!planilha) {
            return { existe: false, itens: 0, temServicoMinimo: false };
        }
        const itens = await tx.obraPlanilhaContratadaItem.count({ where: { tenantId, planilhaId: planilha.id } });
        const temServicoMinimo = await tx.obraPlanilhaContratadaItem
            .findFirst({ where: { tenantId, planilhaId: planilha.id, codigoServico: 'SER-0001' }, select: { id: true } })
            .then((r) => !!r)
            .catch(() => false);
        return { existe: true, itens, temServicoMinimo };
    });
}
export async function ensurePlanilhaContratadaMinima(obraId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const planilha = await tx.obraPlanilhaContratada.upsert({
            where: { tenantId_obraId: { tenantId, obraId } },
            create: { tenantId, obraId, contratoId: obra.contratoId, nome: 'Planilha contratada' },
            update: { contratoId: obra.contratoId },
        });
        const has = await tx.obraPlanilhaContratadaItem
            .findFirst({ where: { tenantId, planilhaId: planilha.id, codigoServico: 'SER-0001' }, select: { id: true } })
            .catch(() => null);
        if (!has) {
            await tx.obraPlanilhaContratadaItem.create({
                data: {
                    tenantId,
                    planilhaId: planilha.id,
                    codigoServico: 'SER-0001',
                    descricao: 'Serviço mínimo (base)',
                    unidade: 'UN',
                    quantidade: 0,
                    precoUnitario: 0,
                },
            });
        }
        return { planilhaId: planilha.id, codigoServicoMinimo: 'SER-0001' };
    });
}
export async function listPlanilhaContratadaItens(obraId, tenantId, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    return withRLS(tenantId, async (tx) => {
        const planilha = await tx.obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null);
        if (!planilha)
            return [];
        return tx.obraPlanilhaContratadaItem.findMany({ where: { tenantId, planilhaId: planilha.id }, orderBy: [{ codigoServico: 'asc' }, { id: 'asc' }] });
    });
}
export async function addPlanilhaContratadaItem(obraId, tenantId, input, scope) {
    if (!canAccessObraId(obraId, scope))
        throw new Error('Access denied');
    const codigoServico = String(input.codigoServico || '').trim().toUpperCase();
    if (!codigoServico)
        throw new Error('Código do serviço é obrigatório');
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } });
        if (!obra)
            throw new Error('Obra not found or access denied');
        const planilha = await tx.obraPlanilhaContratada.upsert({
            where: { tenantId_obraId: { tenantId, obraId } },
            create: { tenantId, obraId, contratoId: obra.contratoId, nome: 'Planilha contratada' },
            update: { contratoId: obra.contratoId },
        });
        await tx.obraPlanilhaContratadaItem.create({
            data: {
                tenantId,
                planilhaId: planilha.id,
                codigoServico,
                descricao: input.descricao ?? null,
                unidade: input.unidade ?? null,
                quantidade: input.quantidade ?? null,
                precoUnitario: input.precoUnitario ?? null,
            },
        });
        return { planilhaId: planilha.id };
    });
}
export async function getOrcamento(obraId, tenantId) {
    // Orcamento é sempre por obra, então respeita escopo
    return withRLS(tenantId, async (tx) => {
        const obra = await tx.obra.findFirst({
            where: { id: obraId, tenantId },
            select: { id: true, name: true, valorPrevisto: true, valorAtual: true }
        });
        if (!obra)
            throw new Error("Obra not found or access denied");
        const custos = await tx.custo.findMany({
            where: { obraId, tenantId },
            orderBy: { date: 'desc' }
        });
        const totalGasto = custos.reduce((sum, c) => sum + Number(c.amount), 0);
        return {
            obra,
            totalGasto,
            saldo: (obra.valorAtual ? Number(obra.valorAtual) : 0) - totalGasto,
            custos
        };
    });
}
export async function updateOrcamento(obraId, valorPrevisto, tenantId, scope) {
    if (!canAccessObraId(obraId, scope)) {
        throw new Error("Access denied");
    }
    return withRLS(tenantId, async (tx) => {
        const updated = await tx.obra.updateMany({
            where: { id: obraId, tenantId },
            data: { valorPrevisto }
        });
        if (updated.count === 0)
            throw new Error("Obra not found or access denied");
        return getOrcamento(obraId, tenantId);
    });
}
export async function addCusto(obraId, input, tenantId) {
    // Custos são sempre por obra, então respeita escopo
    return withRLS(tenantId, async (tx) => {
        // ensure obra belongs to tenant
        const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
        if (!obra)
            throw new Error("Obra not found or access denied");
        const dateVal = input.date ? new Date(input.date) : new Date();
        await tx.custo.create({
            data: {
                obraId,
                tenantId,
                description: input.description,
                amount: input.amount,
                date: dateVal
            }
        });
        return getOrcamento(obraId, tenantId);
    });
}
export async function removeCusto(obraId, custoId, tenantId) {
    // Remoção de custo também respeita escopo da obra
    return withRLS(tenantId, async (tx) => {
        const deleted = await tx.custo.deleteMany({
            where: { id: custoId, obraId, tenantId }
        });
        if (deleted.count === 0)
            throw new Error("Custo not found or access denied");
        return getOrcamento(obraId, tenantId);
    });
}
