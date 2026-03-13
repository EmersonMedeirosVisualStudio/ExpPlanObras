import prisma from '../../plugins/prisma.js';

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function purgeExpiredTenants() {
  const retentionDays = Number(process.env.DATA_RETENTION_DAYS || '30');
  const cutoff = daysAgo(retentionDays);
  const now = new Date();

  const tenants = await prisma.tenant.findMany({
    where: {
      OR: [
        { subscriptionStatus: 'TRIAL', trialEndsAt: { lt: cutoff } },
        { subscriptionStatus: 'CANCELED', updatedAt: { lt: cutoff } },
        { subscriptionStatus: 'PAST_DUE', updatedAt: { lt: cutoff } },
      ],
    } as any,
    select: { id: true },
  });

  let purged = 0;

  for (const t of tenants) {
    const obraIds = await prisma.obra
      .findMany({ where: { tenantId: t.id }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    if (obraIds.length > 0) {
      await prisma.pagamento.deleteMany({ where: { obraId: { in: obraIds } } });
      await prisma.medicao.deleteMany({ where: { obraId: { in: obraIds } } });
      await prisma.responsavelObra.deleteMany({ where: { obraId: { in: obraIds } } });
    }

    await prisma.etapa.deleteMany({ where: { tenantId: t.id } });
    await prisma.custo.deleteMany({ where: { tenantId: t.id } });
    await prisma.documento.deleteMany({ where: { tenantId: t.id } });
    await prisma.tarefa.deleteMany({ where: { tenantId: t.id } });
    await prisma.obra.deleteMany({ where: { tenantId: t.id } });
    await prisma.responsavelTecnico.deleteMany({ where: { tenantId: t.id } });
    await prisma.tenantUser.deleteMany({ where: { tenantId: t.id } });

    await prisma.tenant.update({
      where: { id: t.id },
      data: {
        status: 'INACTIVE',
        subscriptionStatus: 'CANCELED',
        trialEndsAt: null,
        paidUntil: null,
        billingProvider: null,
        billingPlan: null,
        billingExternalId: null,
        updatedAt: now,
      } as any,
    });

    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: t.id,
        source: 'SYSTEM',
        message: 'Dados operacionais descartados por retenção. Status: INACTIVE.',
      },
    });

    purged += 1;
  }

  return { purged };
}

export async function expireTrials() {
  const now = new Date();
  const subs = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      OR: [
        { expiresAt: { lt: now } },
      ],
    } as any,
    select: { id: true, tenantId: true },
  });

  let updated = 0;
  for (const s of subs) {
    await prisma.subscription.update({
      where: { id: s.id },
      data: { status: 'EXPIRED', updatedAt: now },
    });
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: s.tenantId,
        source: 'SYSTEM',
        action: 'TRIAL_EXPIRED',
        message: 'Trial expirado. Assinatura marcada como EXPIRED.',
      },
    });
    updated += 1;
  }
  return { updated };
}
