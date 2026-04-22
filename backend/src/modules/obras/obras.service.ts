import prisma, { setTenantContext } from "../../plugins/prisma.js";
import { CreateObraInput, UpdateObraInput } from "./obras.schema.js";

export type AbrangenciaContext = { empresa: boolean; obras: number[]; unidades: number[] };
export type OrigemEndereco = 'LINK' | 'CEP' | 'MANUAL';

export type EnderecoObraInput = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  origemEndereco?: OrigemEndereco;
  origemCoordenada?: OrigemEndereco;
};

// Helper to execute with RLS context
// This ensures that the tenant_id is set for the transaction session
async function withRLS<T>(tenantId: number, callback: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set tenant context for RLS
    await setTenantContext(tx, tenantId);
    return callback(tx);
  });
}

export async function createObra(input: CreateObraInput, tenantId: number) {
  return withRLS(tenantId, async (tx) => {
    const contrato = await tx.contrato.findFirst({ where: { tenantId, id: input.contratoId }, select: { id: true } }).catch(() => null);
    if (!contrato) throw new Error('Contrato não encontrado');
    return tx.obra.create({
      data: {
        ...input,
        tenantId,
      },
    });
  });
}

function scopeWhere(tenantId: number, scope?: AbrangenciaContext) {
  if (!scope || scope.empresa) return { tenantId };
  if (Array.isArray(scope.obras) && scope.obras.length > 0) return { tenantId, id: { in: scope.obras } };
  return { tenantId, id: { in: [-1] } };
}

function canAccessObraId(obraId: number, scope?: AbrangenciaContext) {
  if (!scope || scope.empresa) return true;
  return Array.isArray(scope.obras) && scope.obras.includes(obraId);
}

export async function getObras(tenantId: number, scope?: AbrangenciaContext, filter?: { contratoId?: number }) {
  return withRLS(tenantId, async (tx) => {
    const contratoId = typeof filter?.contratoId === 'number' && Number.isInteger(filter.contratoId) && filter.contratoId > 0 ? filter.contratoId : null;
    const obras = await tx.obra.findMany({
      orderBy: { createdAt: 'desc' },
      where: { ...scopeWhere(tenantId, scope), ...(contratoId ? { contratoId } : {}) },
      include: { enderecosObra: true, contrato: { select: { id: true, numeroContrato: true, status: true, objeto: true } } },
    });
    return obras.map((o: any) => {
      const enderecos = Array.isArray(o.enderecosObra) ? o.enderecosObra : [];
      const principal = enderecos.find((e: any) => e.principal) || enderecos[0] || null;
      return { ...o, enderecosObra: enderecos, enderecoObra: principal };
    });
  });
}

export async function getObraById(id: number, tenantId: number, scope?: AbrangenciaContext) {
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
    
    if (!obra) return obra;
    const enderecos = Array.isArray((obra as any).enderecosObra) ? (obra as any).enderecosObra : [];
    const principal = enderecos.find((e: any) => e.principal) || enderecos[0] || null;
    return { ...(obra as any), enderecosObra: enderecos, enderecoObra: principal };
  });
}

export async function updateObra(id: number, input: UpdateObraInput, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(id, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    if ((input as any).contratoId != null) {
      const contrato = await tx.contrato.findFirst({ where: { tenantId, id: (input as any).contratoId }, select: { id: true } }).catch(() => null);
      if (!contrato) throw new Error('Contrato não encontrado');
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
    
    return getObraById(id, tenantId, scope);
  });
}

export async function deleteObra(id: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(id, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    const count = await tx.obra.deleteMany({
      where: { 
          id,
          tenantId
      },
    });
    
    if (count.count === 0) {
        throw new Error("Obra not found or access denied");
    }
    
    return { success: true };
  });
}

function isEmptyValue(v: unknown) {
  const s = typeof v === 'string' ? v.trim() : '';
  return !s;
}

export async function getEnderecoObra(obraId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');
    return tx.enderecoObra.findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] });
  });
}

export async function upsertEnderecoObra(obraId: number, tenantId: number, input: EnderecoObraInput, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';
  const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';

  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');

    const current = await tx.enderecoObra
      .findFirst({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] })
      .catch(() => null);

    const addrPatch: any = {};
    const coordPatch: any = {};

    const setAddrField = (key: string, value: any) => {
      if (value === undefined) return;
      if (current && String(current.origemEndereco || '').toUpperCase() === 'MANUAL' && origemEndereco !== 'MANUAL' && !isEmptyValue((current as any)[key])) {
        return;
      }
      addrPatch[key] = value === '' ? null : value;
    };

    const setCoordField = (key: string, value: any) => {
      if (value === undefined) return;
      if (current && String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' && origemCoordenada !== 'MANUAL' && !isEmptyValue((current as any)[key])) {
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

    const origemEnderecoFinal =
      origemEndereco === 'MANUAL' ? 'MANUAL' : current && String(current.origemEndereco || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemEndereco;
    const origemCoordenadaFinal =
      origemCoordenada === 'MANUAL' ? 'MANUAL' : current && String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemCoordenada;

    const dataToWrite: any = {
      tenantId,
      obraId,
      ...addrPatch,
      ...coordPatch,
      origemEndereco: origemEnderecoFinal,
      origemCoordenada: origemCoordenadaFinal,
      principal: true,
    };

    let saved: any;
    if (current?.id) {
      saved = await tx.enderecoObra.update({ where: { id: current.id }, data: dataToWrite });
    } else {
      saved = await tx.enderecoObra.create({ data: { ...dataToWrite, principal: true } });
    }

    await tx.enderecoObra.updateMany({
      where: { tenantId, obraId, id: { not: saved.id } },
      data: { principal: false },
    });

    return saved;
  });
}

export async function listEnderecosObra(obraId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');
    return tx.enderecoObra.findMany({ where: { tenantId, obraId }, orderBy: [{ principal: 'desc' }, { id: 'asc' }] });
  });
}

export async function createEnderecoObra(
  obraId: number,
  tenantId: number,
  input: EnderecoObraInput & { nomeEndereco?: string | null; principal?: boolean | null },
  scope?: AbrangenciaContext
) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';
  const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';

  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');

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
      } as any,
    });

    if (shouldBePrincipal) {
      await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: created.id } }, data: { principal: false } });
    }

    return created;
  });
}

export async function updateEnderecoObraById(
  obraId: number,
  enderecoId: number,
  tenantId: number,
  input: EnderecoObraInput & { nomeEndereco?: string | null; principal?: boolean | null },
  scope?: AbrangenciaContext
) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  const origemEndereco: OrigemEndereco = (String(input.origemEndereco || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';
  const origemCoordenada: OrigemEndereco = (String(input.origemCoordenada || 'MANUAL').toUpperCase() as OrigemEndereco) || 'MANUAL';

  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');

    const current = await tx.enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId } }).catch(() => null);
    if (!current) throw new Error('Endereço não encontrado');

    const addrPatch: any = {};
    const coordPatch: any = {};
    const patch: any = {};

    const setAddrField = (key: string, value: any) => {
      if (value === undefined) return;
      if (String(current.origemEndereco || '').toUpperCase() === 'MANUAL' && origemEndereco !== 'MANUAL' && !isEmptyValue((current as any)[key])) {
        return;
      }
      addrPatch[key] = value === '' ? null : value;
    };

    const setCoordField = (key: string, value: any) => {
      if (value === undefined) return;
      if (String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' && origemCoordenada !== 'MANUAL' && !isEmptyValue((current as any)[key])) {
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

    const origemEnderecoFinal =
      origemEndereco === 'MANUAL' ? 'MANUAL' : String(current.origemEndereco || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemEndereco;
    const origemCoordenadaFinal =
      origemCoordenada === 'MANUAL' ? 'MANUAL' : String(current.origemCoordenada || '').toUpperCase() === 'MANUAL' ? 'MANUAL' : origemCoordenada;

    const saved = await tx.enderecoObra.update({
      where: { id: current.id },
      data: { ...patch, ...addrPatch, ...coordPatch, origemEndereco: origemEnderecoFinal, origemCoordenada: origemCoordenadaFinal },
    });

    if (saved.principal) {
      await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: saved.id } }, data: { principal: false } });
    } else {
      const hasPrincipal = await tx.enderecoObra.findFirst({ where: { tenantId, obraId, principal: true }, select: { id: true } }).catch(() => null);
      if (!hasPrincipal) {
        await tx.enderecoObra.update({ where: { id: saved.id }, data: { principal: true } });
        await tx.enderecoObra.updateMany({ where: { tenantId, obraId, id: { not: saved.id } }, data: { principal: false } });
      }
    }

    return saved;
  });
}

export async function deleteEnderecoObraById(obraId: number, enderecoId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');

    const current = await tx.enderecoObra.findFirst({ where: { id: enderecoId, tenantId, obraId }, select: { id: true, principal: true } }).catch(() => null);
    if (!current) throw new Error('Endereço não encontrado');

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

export async function getPlanilhaContratadaResumo(obraId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error('Obra not found or access denied');
    const planilha = await tx.obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null);
    if (!planilha) {
      return { existe: false, itens: 0, temServicoMinimo: false };
    }
    const itens = await tx.obraPlanilhaContratadaItem.count({ where: { tenantId, planilhaId: planilha.id } });
    const temServicoMinimo = await tx.obraPlanilhaContratadaItem
      .findFirst({ where: { tenantId, planilhaId: planilha.id, codigoServico: 'SER-0001' }, select: { id: true } })
      .then((r: any) => !!r)
      .catch(() => false);
    return { existe: true, itens, temServicoMinimo };
  });
}

export async function ensurePlanilhaContratadaMinima(obraId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } });
    if (!obra) throw new Error('Obra not found or access denied');

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

export async function listPlanilhaContratadaItens(obraId: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  return withRLS(tenantId, async (tx) => {
    const planilha = await tx.obraPlanilhaContratada.findFirst({ where: { tenantId, obraId } }).catch(() => null);
    if (!planilha) return [];
    return tx.obraPlanilhaContratadaItem.findMany({ where: { tenantId, planilhaId: planilha.id }, orderBy: [{ codigoServico: 'asc' }, { id: 'asc' }] });
  });
}

export async function addPlanilhaContratadaItem(
  obraId: number,
  tenantId: number,
  input: { codigoServico: string; descricao?: string | null; unidade?: string | null; quantidade?: number | null; precoUnitario?: number | null },
  scope?: AbrangenciaContext
) {
  if (!canAccessObraId(obraId, scope)) throw new Error('Access denied');
  const codigoServico = String(input.codigoServico || '').trim().toUpperCase();
  if (!codigoServico) throw new Error('Código do serviço é obrigatório');
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true, contratoId: true } });
    if (!obra) throw new Error('Obra not found or access denied');
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

export async function getOrcamento(obraId: number, tenantId: number) {
  // Orcamento é sempre por obra, então respeita escopo
  return withRLS(tenantId, async (tx) => {
    const obra = await tx.obra.findFirst({
      where: { id: obraId, tenantId },
      select: { id: true, name: true, valorPrevisto: true }
    });
    if (!obra) throw new Error("Obra not found or access denied");
    const custos = await tx.custo.findMany({
      where: { obraId, tenantId },
      orderBy: { date: 'desc' }
    });
    const totalGasto = custos.reduce((sum: any, c: any) => sum + Number(c.amount), 0);
    return {
      obra,
      totalGasto,
      saldo: (obra.valorPrevisto ? Number(obra.valorPrevisto) : 0) - totalGasto,
      custos
    };
  });
}

export async function updateOrcamento(obraId: number, valorPrevisto: number, tenantId: number, scope?: AbrangenciaContext) {
  if (!canAccessObraId(obraId, scope)) {
    throw new Error("Access denied");
  }
  return withRLS(tenantId, async (tx) => {
    const updated = await tx.obra.updateMany({
      where: { id: obraId, tenantId },
      data: { valorPrevisto }
    });
    if (updated.count === 0) throw new Error("Obra not found or access denied");
    return getOrcamento(obraId, tenantId);
  });
}

export async function addCusto(obraId: number, input: { description: string; amount: number; date?: string }, tenantId: number) {
  // Custos são sempre por obra, então respeita escopo
  return withRLS(tenantId, async (tx) => {
    // ensure obra belongs to tenant
    const obra = await tx.obra.findFirst({ where: { id: obraId, tenantId }, select: { id: true } });
    if (!obra) throw new Error("Obra not found or access denied");
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

export async function removeCusto(obraId: number, custoId: number, tenantId: number) {
  // Remoção de custo também respeita escopo da obra
  return withRLS(tenantId, async (tx) => {
    const deleted = await tx.custo.deleteMany({
      where: { id: custoId, obraId, tenantId }
    });
    if (deleted.count === 0) throw new Error("Custo not found or access denied");
    return getOrcamento(obraId, tenantId);
  });
}
