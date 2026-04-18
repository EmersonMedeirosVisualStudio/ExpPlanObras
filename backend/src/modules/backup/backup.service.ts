import prisma from '../../plugins/prisma.js';

export async function exportTenantBackup(tenantId: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant not found');

  const users = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: { user: true },
    orderBy: { id: 'asc' },
  });

  const contratos = await prisma.contrato.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const planilhasContratadas = await prisma.obraPlanilhaContratada.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const planilhaIds = planilhasContratadas.map((p) => p.id);
  const planilhasItens = planilhaIds.length
    ? await prisma.obraPlanilhaContratadaItem.findMany({ where: { tenantId, planilhaId: { in: planilhaIds } }, orderBy: { id: 'asc' } })
    : [];

  const obras = await prisma.obra.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const obraIds = obras.map((o) => o.id);
  const enderecosObra = await prisma.enderecoObra.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });

  const etapas = await prisma.etapa.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const custos = await prisma.custo.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const documentos = await prisma.documento.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const tarefas = await prisma.tarefa.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const responsaveisTecnicos = await prisma.responsavelTecnico.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const responsaveisObra = await prisma.responsavelObra.findMany({
    where: { obraId: { in: obraIds } },
    orderBy: { id: 'asc' },
  });
  const medicoes = await prisma.medicao.findMany({ where: { obraId: { in: obraIds } }, orderBy: { id: 'asc' } });
  const medicaoIds = medicoes.map((m) => m.id);
  const pagamentos = await prisma.pagamento.findMany({
    where: { OR: [{ obraId: { in: obraIds } }, { medicaoId: { in: medicaoIds } }] },
    orderBy: { id: 'asc' },
  });

  const history = await prisma.tenantHistoryEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    include: { attachments: true },
  });

  return {
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    tenant,
    users,
    contratos,
    obras,
    enderecosObra,
    planilhasContratadas,
    planilhasItens,
    etapas,
    custos,
    documentos,
    tarefas,
    responsaveisTecnicos,
    responsaveisObra,
    medicoes,
    pagamentos,
    history,
  };
}

export async function restoreTenantBackup(tenantId: number, backup: any) {
  if (!backup || typeof backup !== 'object') throw new Error('Backup inválido');
  if (backup?.tenant?.id !== tenantId) throw new Error('Backup não corresponde ao tenant');

  return prisma.$transaction(async (tx) => {
    const obrasAtuais = await tx.obra.findMany({ where: { tenantId }, select: { id: true } });
    const obraIdsAtuais = obrasAtuais.map((o) => o.id);
    if (obraIdsAtuais.length > 0) {
      const medicoesAtuais = await tx.medicao.findMany({ where: { obraId: { in: obraIdsAtuais } }, select: { id: true } });
      const medicaoIdsAtuais = medicoesAtuais.map((m) => m.id);
      await tx.pagamento.deleteMany({ where: { OR: [{ obraId: { in: obraIdsAtuais } }, { medicaoId: { in: medicaoIdsAtuais } }] } });
      await tx.medicao.deleteMany({ where: { obraId: { in: obraIdsAtuais } } });
      await tx.responsavelObra.deleteMany({ where: { obraId: { in: obraIdsAtuais } } });
    }

    await tx.etapa.deleteMany({ where: { tenantId } });
    await tx.custo.deleteMany({ where: { tenantId } });
    await tx.documento.deleteMany({ where: { tenantId } });
    await tx.tarefa.deleteMany({ where: { tenantId } });
    await tx.obraPlanilhaContratadaItem.deleteMany({ where: { tenantId } });
    await tx.obraPlanilhaContratada.deleteMany({ where: { tenantId } });
    await tx.enderecoObra.deleteMany({ where: { tenantId } });
    await tx.obra.deleteMany({ where: { tenantId } });
    await tx.contrato.deleteMany({ where: { tenantId } });
    await tx.responsavelTecnico.deleteMany({ where: { tenantId } });
    await tx.tenantHistoryAttachment.deleteMany({ where: { entry: { tenantId } } as any });
    await tx.tenantHistoryEntry.deleteMany({ where: { tenantId } });

    const responsavelIdMap = new Map<number, number>();
    for (const r of backup.responsaveisTecnicos || []) {
      const created = await tx.responsavelTecnico.create({
        data: {
          tenantId,
          name: r.name,
          professionalTitle: r.professionalTitle,
          crea: r.crea,
          cpf: r.cpf,
          email: r.email,
          phone: r.phone,
        },
      });
      responsavelIdMap.set(Number(r.id), created.id);
    }

    const contratoIdMap = new Map<number, number>();
    const contratos = Array.isArray(backup.contratos) ? backup.contratos : [];
    for (const c of contratos) {
      const created = await tx.contrato.create({
        data: {
          tenantId,
          numeroContrato: c.numeroContrato,
          descricao: c.descricao ?? null,
          status: c.status ?? 'ATIVO',
          dataInicio: c.dataInicio ? new Date(c.dataInicio) : null,
          dataFim: c.dataFim ? new Date(c.dataFim) : null,
          valorContratado: c.valorContratado ?? null,
        },
      });
      contratoIdMap.set(Number(c.id), created.id);
    }

    const pendingContrato = await tx.contrato
      .findFirst({ where: { tenantId, numeroContrato: 'PENDENTE' }, select: { id: true } })
      .catch(() => null);
    const pendingContratoId = pendingContrato
      ? pendingContrato.id
      : (
          await tx.contrato.create({
            data: { tenantId, numeroContrato: 'PENDENTE', descricao: 'Contrato pendente de definição', status: 'PENDENTE' },
            select: { id: true },
          })
        ).id;

    const obraIdMap = new Map<number, number>();
    for (const o of backup.obras || []) {
      const contratoIdOriginal = (o as any).contratoId != null ? Number((o as any).contratoId) : null;
      const contratoId = contratoIdOriginal != null ? contratoIdMap.get(contratoIdOriginal) : null;
      const created = await tx.obra.create({
        data: {
          tenantId,
          contratoId: contratoId ?? pendingContratoId,
          name: o.name,
          description: o.description,
          type: o.type,
          status: o.status,
          valorPrevisto: o.valorPrevisto,
        },
      });
      obraIdMap.set(Number(o.id), created.id);
    }

    const planilhas = Array.isArray(backup.planilhasContratadas) ? backup.planilhasContratadas : [];
    const planilhaIdMap = new Map<number, number>();
    for (const p of planilhas) {
      const obraId = obraIdMap.get(Number(p.obraId));
      if (!obraId) continue;
      const contratoIdOriginal = p.contratoId != null ? Number(p.contratoId) : null;
      const contratoId = contratoIdOriginal != null ? contratoIdMap.get(contratoIdOriginal) : null;
      const created = await tx.obraPlanilhaContratada.create({
        data: {
          tenantId,
          obraId,
          contratoId: contratoId ?? pendingContratoId,
          nome: p.nome ?? 'Planilha contratada',
          criadoEm: p.criadoEm ? new Date(p.criadoEm) : new Date(),
          atualizadoEm: p.atualizadoEm ? new Date(p.atualizadoEm) : new Date(),
        } as any,
      });
      planilhaIdMap.set(Number(p.id), created.id);
    }

    const itens = Array.isArray(backup.planilhasItens) ? backup.planilhasItens : [];
    for (const it of itens) {
      const planilhaId = planilhaIdMap.get(Number(it.planilhaId));
      if (!planilhaId) continue;
      await tx.obraPlanilhaContratadaItem.create({
        data: {
          tenantId,
          planilhaId,
          codigoServico: it.codigoServico,
          descricao: it.descricao ?? null,
          unidade: it.unidade ?? null,
          quantidade: it.quantidade ?? null,
          precoUnitario: it.precoUnitario ?? null,
          criadoEm: it.criadoEm ? new Date(it.criadoEm) : new Date(),
        } as any,
      });
    }

    const enderecos = Array.isArray(backup.enderecosObra) ? backup.enderecosObra : [];
    if (enderecos.length > 0) {
      for (const e of enderecos) {
        const obraId = obraIdMap.get(Number(e.obraId));
        if (!obraId) continue;
        await tx.enderecoObra.create({
          data: {
            tenantId,
            obraId,
            cep: e.cep ?? null,
            logradouro: e.logradouro ?? null,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            cidade: e.cidade ?? null,
            uf: e.uf ?? null,
            latitude: e.latitude ?? null,
            longitude: e.longitude ?? null,
            origemEndereco: e.origemEndereco ?? 'MANUAL',
            origemCoordenada: e.origemCoordenada ?? 'MANUAL',
            criadoEm: e.criadoEm ? new Date(e.criadoEm) : new Date(),
            atualizadoEm: e.atualizadoEm ? new Date(e.atualizadoEm) : new Date(),
          } as any,
        });
      }
    } else {
      for (const o of backup.obras || []) {
        const obraId = obraIdMap.get(Number(o.id));
        if (!obraId) continue;
        const hasAny = !!(o.street || o.number || o.neighborhood || o.city || o.state || o.latitude || o.longitude);
        if (!hasAny) continue;
        await tx.enderecoObra.create({
          data: {
            tenantId,
            obraId,
            cep: null,
            logradouro: o.street ?? null,
            numero: o.number ?? null,
            complemento: null,
            bairro: o.neighborhood ?? null,
            cidade: o.city ?? null,
            uf: o.state ?? null,
            latitude: o.latitude ?? null,
            longitude: o.longitude ?? null,
            origemEndereco: 'MANUAL',
            origemCoordenada: 'MANUAL',
            criadoEm: o.createdAt ? new Date(o.createdAt) : new Date(),
            atualizadoEm: o.updatedAt ? new Date(o.updatedAt) : new Date(),
          } as any,
        });
      }
    }

    for (const e of backup.etapas || []) {
      const obraId = obraIdMap.get(Number(e.obraId));
      if (!obraId) continue;
      await tx.etapa.create({
        data: {
          tenantId,
          obraId,
          name: e.name,
          startDate: e.startDate ? new Date(e.startDate) : null,
          endDate: e.endDate ? new Date(e.endDate) : null,
          status: e.status,
        },
      });
    }

    for (const c of backup.custos || []) {
      const obraId = obraIdMap.get(Number(c.obraId));
      if (!obraId) continue;
      await tx.custo.create({
        data: {
          tenantId,
          obraId,
          description: c.description,
          amount: c.amount,
          date: c.date ? new Date(c.date) : new Date(),
        },
      });
    }

    for (const d of backup.documentos || []) {
      const obraId = obraIdMap.get(Number(d.obraId));
      if (!obraId) continue;
      await tx.documento.create({
        data: {
          tenantId,
          obraId,
          name: d.name,
          url: d.url,
          type: d.type,
          uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
        },
      });
    }

    for (const t of backup.tarefas || []) {
      const obraId = obraIdMap.get(Number(t.obraId));
      if (!obraId) continue;
      await tx.tarefa.create({
        data: {
          tenantId,
          obraId,
          title: t.title,
          description: t.description,
          status: t.status,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        },
      });
    }

    for (const ro of backup.responsaveisObra || []) {
      const obraId = obraIdMap.get(Number(ro.obraId));
      const responsavelId = responsavelIdMap.get(Number(ro.responsavelId));
      if (!obraId || !responsavelId) continue;
      await tx.responsavelObra.create({
        data: {
          obraId,
          responsavelId,
          role: ro.role,
          startDate: ro.startDate ? new Date(ro.startDate) : new Date(),
          endDate: ro.endDate ? new Date(ro.endDate) : null,
          notes: ro.notes,
        },
      });
    }

    const medicaoIdMap = new Map<number, number>();
    for (const m of backup.medicoes || []) {
      const obraId = obraIdMap.get(Number(m.obraId));
      if (!obraId) continue;
      const created = await tx.medicao.create({
        data: {
          obraId,
          date: m.date ? new Date(m.date) : new Date(),
          description: m.description,
          amount: m.amount,
          percentage: m.percentage,
        },
      });
      medicaoIdMap.set(Number(m.id), created.id);
    }

    for (const p of backup.pagamentos || []) {
      const obraId = obraIdMap.get(Number(p.obraId));
      if (!obraId) continue;
      const medicaoId = p.medicaoId ? medicaoIdMap.get(Number(p.medicaoId)) : undefined;
      await tx.pagamento.create({
        data: {
          obraId,
          medicaoId: medicaoId ?? null,
          date: p.date ? new Date(p.date) : new Date(),
          amount: p.amount,
          documentNumber: p.documentNumber,
          notes: p.notes,
        },
      });
    }

    for (const h of backup.history || []) {
      const created = await tx.tenantHistoryEntry.create({
        data: {
          tenantId,
          source: h.source,
          message: h.message,
          actorUserId: null,
          createdAt: h.createdAt ? new Date(h.createdAt) : new Date(),
        } as any,
      });
      const atts = Array.isArray(h.attachments) ? h.attachments : [];
      for (const a of atts as Array<any>) {
        const url = typeof a?.url === 'string' ? a.url : null;
        const filename = typeof a?.filename === 'string' ? a.filename : null;
        const mimeType = typeof a?.mimeType === 'string' ? a.mimeType : null;

        let data: Buffer | null = null;
        const raw = a?.data;
        if (raw && typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
          data = Buffer.from(raw.data);
        }

        await tx.tenantHistoryAttachment.create({
          data: {
            entryId: created.id,
            url,
            filename,
            mimeType,
            data,
          } as any,
        });
      }
    }

    return { restored: true };
  });
}
