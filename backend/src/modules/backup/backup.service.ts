import prisma from '../../plugins/prisma.js';

export async function exportTenantBackup(tenantId: number) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('Tenant not found');

  const users = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: { user: true },
    orderBy: { id: 'asc' },
  });

  const obras = await prisma.obra.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
  const obraIds = obras.map((o) => o.id);

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
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tenant,
    users,
    obras,
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
    await tx.obra.deleteMany({ where: { tenantId } });
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

    const obraIdMap = new Map<number, number>();
    for (const o of backup.obras || []) {
      const created = await tx.obra.create({
        data: {
          tenantId,
          name: o.name,
          description: o.description,
          type: o.type,
          status: o.status,
          street: o.street,
          number: o.number,
          neighborhood: o.neighborhood,
          city: o.city,
          state: o.state,
          latitude: o.latitude,
          longitude: o.longitude,
          valorPrevisto: o.valorPrevisto,
        },
      });
      obraIdMap.set(Number(o.id), created.id);
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
