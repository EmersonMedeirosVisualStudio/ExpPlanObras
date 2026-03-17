import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../plugins/prisma.js';

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isTrialExpired(tenant: { subscriptionStatus?: string | null; trialEndsAt?: Date | null }, now: Date) {
  return (tenant.subscriptionStatus || 'TRIAL') === 'TRIAL' && !!tenant.trialEndsAt && tenant.trialEndsAt < now;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const user = request.user as any;
    if (user?.isSystemAdmin) return;

    const tenantId = user?.tenantId;
    if (typeof tenantId !== 'number') return;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, gracePeriodEndsAt: true }
    });

    if (!tenant || tenant.status === 'INACTIVE') {
      return reply.code(403).send({ message: 'Tenant inativo' });
    }

    const now = new Date();
    const subStatus = String(tenant.subscriptionStatus || 'NONE');
    const graceDays = Number(process.env.GRACE_DAYS || '10');

    if (subStatus === 'NONE') {
      return reply.code(402).send({ message: 'Sem assinatura. Faça uma assinatura para reativação.' });
    }
    if (isTrialExpired(tenant, now)) {
      return reply.code(402).send({ message: 'Período de teste expirou. Assinatura necessária' });
    }

    if (subStatus === 'ACTIVE') {
      if (!tenant.paidUntil) {
        return reply.code(402).send({ message: 'Assinatura inválida. Regularize para reativação.' });
      }
      if (tenant.paidUntil < now) {
        const graceEndsAt = addDays(tenant.paidUntil, graceDays);
        if (now <= graceEndsAt) {
          if (tenant.subscriptionStatus !== 'GRACE_PERIOD' || !tenant.gracePeriodEndsAt) {
            await prisma.tenant.update({
              where: { id: tenant.id },
              data: { subscriptionStatus: 'GRACE_PERIOD', gracePeriodEndsAt: graceEndsAt } as any,
            });
            await prisma.tenantHistoryEntry.create({
              data: {
                tenantId: tenant.id,
                source: 'SYSTEM',
                action: 'SUBSCRIPTION_GRACE_PERIOD',
                message: `Assinatura vencida. Entrada automática em GRACE_PERIOD por ${graceDays} dia(s).`,
                actorUserId: null,
              },
            });
          }
          return;
        }
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as any,
        });
        await prisma.tenantHistoryEntry.create({
          data: {
            tenantId: tenant.id,
            source: 'SYSTEM',
            action: 'SUBSCRIPTION_EXPIRED',
            message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
            actorUserId: null,
          },
        });
        return reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' });
      }
      return;
    }

    if (subStatus === 'GRACE_PERIOD') {
      const graceEndsAt =
        tenant.gracePeriodEndsAt ||
        (tenant.paidUntil ? addDays(tenant.paidUntil, graceDays) : addDays(now, -1));
      if (now <= graceEndsAt) return;

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionStatus: 'EXPIRED', gracePeriodEndsAt: null } as any,
      });
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: tenant.id,
          source: 'SYSTEM',
          action: 'SUBSCRIPTION_EXPIRED',
          message: 'Assinatura expirada após GRACE_PERIOD. Bloqueio automático.',
          actorUserId: null,
        },
      });
      return reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' });
    }

    if (subStatus === 'EXPIRED') {
      return reply.code(402).send({ message: 'Assinatura expirada. Faça uma assinatura para reativação.' });
    }
  } catch (err: any) {
    return reply.code(401).send({ message: 'Não autenticado' });
  }
}

export async function checkSystemAdmin(request: FastifyRequest, reply: FastifyReply) {
    try {
        await request.jwtVerify();
        const { userId } = request.user;
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || !user.isSystemAdmin) {
            reply.code(403).send({ message: 'Acesso restrito: administrador do sistema necessário' });
            return;
        }
    } catch (err) {
        reply.code(401).send({ message: 'Não autenticado' });
    }
}
