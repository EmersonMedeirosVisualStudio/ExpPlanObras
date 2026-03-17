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
        { subscriptionStatus: 'EXPIRED', updatedAt: { lt: cutoff } },
        { subscriptionStatus: 'NONE', updatedAt: { lt: cutoff } },
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
        subscriptionStatus: 'EXPIRED',
        trialEndsAt: null,
        paidUntil: null,
        gracePeriodEndsAt: null,
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

export async function processSubscriptionsDaily() {
  const now = new Date();
  const graceDays = Number(process.env.GRACE_DAYS || '10');

  const activeExpired = await prisma.tenant.findMany({
    where: {
      subscriptionStatus: 'ACTIVE',
      paidUntil: { not: null, lt: now },
    } as any,
    select: { id: true, paidUntil: true, gracePeriodEndsAt: true },
  });

  let toGrace = 0;
  for (const t of activeExpired) {
    if (!t.paidUntil) continue;
    const graceEndsAt = new Date(t.paidUntil);
    graceEndsAt.setDate(graceEndsAt.getDate() + graceDays);
    if (now <= graceEndsAt) {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { subscriptionStatus: 'GRACE_PERIOD', gracePeriodEndsAt: graceEndsAt } as any,
      });
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: t.id,
          source: 'SYSTEM',
          action: 'SUBSCRIPTION_GRACE_PERIOD',
          message: `Assinatura vencida. Entrada automática em GRACE_PERIOD por ${graceDays} dia(s).`,
        },
      });
      toGrace += 1;
    } else {
      await prisma.tenant.update({
        where: { id: t.id },
        data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as any,
      });
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: t.id,
          source: 'SYSTEM',
          action: 'SUBSCRIPTION_EXPIRED',
          message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
        },
      });
    }
  }

  const graceExpired = await prisma.tenant.findMany({
    where: {
      subscriptionStatus: 'GRACE_PERIOD',
      gracePeriodEndsAt: { not: null, lt: now },
    } as any,
    select: { id: true },
  });

  let toExpired = 0;
  for (const t of graceExpired) {
    await prisma.tenant.update({
      where: { id: t.id },
      data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as any,
    });
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: t.id,
        source: 'SYSTEM',
        action: 'SUBSCRIPTION_EXPIRED',
        message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
      },
    });
    toExpired += 1;
  }

  return { toGrace, toExpired };
}
