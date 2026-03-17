import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../plugins/prisma.js';

function isTrialExpired(tenant: { subscriptionStatus?: string | null; trialEndsAt?: Date | null }, now: Date) {
  return (tenant.subscriptionStatus || 'TRIAL') === 'TRIAL' && !!tenant.trialEndsAt && tenant.trialEndsAt < now;
}

function isPaidExpired(tenant: { subscriptionStatus?: string | null; paidUntil?: Date | null }, now: Date) {
  return (tenant.subscriptionStatus || 'TRIAL') === 'ACTIVE' && !!tenant.paidUntil && tenant.paidUntil < now;
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
      select: { status: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true }
    });

    if (!tenant || tenant.status === 'INACTIVE') {
      return reply.code(403).send({ message: 'Tenant inativo' });
    }

    const now = new Date();
    if (isTrialExpired(tenant, now)) {
      return reply.code(402).send({ message: 'Período de teste expirou. Assinatura necessária' });
    }
    if (isPaidExpired(tenant, now)) {
      return reply.code(402).send({ message: 'Assinatura expirada. Renovação necessária' });
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
