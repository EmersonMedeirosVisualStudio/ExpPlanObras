
import prisma from "../../plugins/prisma.js";
import { CreateTenantInput, UpdateTenantInput } from "./admin.schema.js";
import bcrypt from "bcryptjs";
import { normalizeEmail, validateCPF, validateCNPJ, validateCEP, validateSlug } from "../../utils/validators.js";
import { generateUniqueTenantSlug } from "../../utils/slug.js";

function getTrialEndsAt() {
  const days = Number(process.env.TRIAL_DAYS || '60');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createTenantByAdmin(input: CreateTenantInput) {
  const { 
    name, slug, cnpj,
    companyEmail,
    companyWhatsapp,
    link, street, number, neighborhood, city, state, cep, latitude, longitude,
    representativeName, representativeEmail, representativeCpf, representativePassword,
    representativeWhatsapp
  } = input;

  const cleanCNPJ = validateCNPJ(cnpj);
  const cleanCEP = validateCEP(cep);
  const cleanRepEmail = normalizeEmail(representativeEmail);
  const cleanRepCPF = validateCPF(representativeCpf);
  const cleanCompanyEmail = normalizeEmail(companyEmail);

  const hashedPassword = await bcrypt.hash(representativePassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const cleanSlug = slug ? validateSlug(slug) : await generateUniqueTenantSlug(tx, name);
    // 1. Create Tenant
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug: cleanSlug,
        cnpj: cleanCNPJ,
        companyEmail: cleanCompanyEmail,
        companyWhatsapp,
        link,
        googleMapsLink: link,
        street,
        number,
        neighborhood,
        city,
        state,
        cep: cleanCEP,
        latitude,
        longitude,
        status: 'ACTIVE',
        subscriptionStatus: 'TRIAL',
        trialEndsAt: getTrialEndsAt(),
        trialExpiresAt: getTrialEndsAt(),
        paidUntil: null,
        gracePeriodEndsAt: null,
      },
    });

    // 2. Check if user already exists
    let user = await tx.user.findUnique({
        where: { cpf: cleanRepCPF }
    });

    if (!user) {
        // Create User if not exists
        user = await tx.user.create({
            data: {
                email: cleanRepEmail,
                cpf: cleanRepCPF,
                name: representativeName,
                password: hashedPassword,
                whatsapp: representativeWhatsapp,
            },
        });
    } else {
        // Optional: Update user details if needed, but risky.
        // For now, we just link.
    }

    // 3. Link User to Tenant as ADMIN
    // Check if link exists
    const existingLink = await tx.tenantUser.findUnique({
        where: {
            tenantId_userId: {
                tenantId: tenant.id,
                userId: user.id
            }
        }
    });

    if (!existingLink) {
        await tx.tenantUser.create({
            data: {
                tenantId: tenant.id,
                userId: user.id,
                role: "ADMIN",
            },
        });
    }

    await tx.tenantHistoryEntry.create({
      data: {
        tenantId: tenant.id,
        source: 'ADMIN',
        action: 'TENANT_CREATED',
        message: 'Empresa criada pelo administrador. Status: TRIAL.',
        actorUserId: null
      }
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'TRIAL',
        status: 'TRIAL',
        startedAt: new Date(),
        expiresAt: tenant.trialExpiresAt ?? getTrialEndsAt(),
      }
    });

    return { tenant, user };
  });

  return result;
}

export async function getAllTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
        users: {
            where: { role: 'ADMIN' },
            take: 1,
            include: { user: true }
        },
        subscriptions: {
          take: 1,
          orderBy: { startedAt: 'desc' },
          select: { id: true, plan: true, status: true, expiresAt: true }
        },
    }
  });
}

export async function updateTenant(id: number, input: UpdateTenantInput) {
    const data: any = { ...input };
    if (Object.prototype.hasOwnProperty.call(input, 'trialEndsAt') && input.trialEndsAt !== undefined) {
      data.trialEndsAt = input.trialEndsAt === null ? null : new Date(input.trialEndsAt as any);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'paidUntil') && input.paidUntil !== undefined) {
      data.paidUntil = input.paidUntil === null ? null : new Date(input.paidUntil as any);
    }
    return prisma.tenant.update({
      where: { id },
      data,
    });
}

export async function manualGrantTenantAccess(id: number, input: { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number }) {
  const days = Number(input.days);
  if (![30, 60, 90, 365].includes(days)) {
    throw new Error('Dias inválidos');
  }

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id },
      select: {
        status: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        trialExpiresAt: true,
        paidUntil: true,
        gracePeriodEndsAt: true,
      },
    });
    if (!tenant) throw new Error('Empresa não encontrada');

    const now = new Date();

    if (input.reason === 'TRIAL_EXTENSION') {
      if (!['TRIAL', 'NONE', 'EXPIRED'].includes(String(tenant.subscriptionStatus || 'NONE'))) {
        throw new Error('Extensão de teste só é permitida para empresas em TRIAL/NONE/EXPIRED');
      }

      const base = new Date(Math.max(now.getTime(), tenant.trialEndsAt ? tenant.trialEndsAt.getTime() : 0));
      const trialEndsAt = new Date(base);
      trialEndsAt.setDate(trialEndsAt.getDate() + days);

      const updated = await tx.tenant.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt,
          trialExpiresAt: trialEndsAt,
          paidUntil: null,
          gracePeriodEndsAt: null,
          billingProvider: 'MANUAL',
          billingPlan: `MANUAL_TRIAL_${days}D`,
        } as any,
      });

      await tx.subscription.create({
        data: {
          tenantId: id,
          plan: `MANUAL_TRIAL_${days}D`,
          status: 'TRIAL',
          startedAt: now,
          expiresAt: trialEndsAt,
          paymentProvider: 'MANUAL',
        },
      });

      return updated;
    }

    const base = new Date(
      Math.max(
        now.getTime(),
        tenant.paidUntil ? tenant.paidUntil.getTime() : 0,
        tenant.gracePeriodEndsAt ? tenant.gracePeriodEndsAt.getTime() : 0
      )
    );
    const paidUntil = new Date(base);
    paidUntil.setDate(paidUntil.getDate() + days);

    const updated = await tx.tenant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        paidUntil,
        gracePeriodEndsAt: null,
        billingProvider: 'MANUAL',
        billingPlan: `MANUAL_PAYMENT_${days}D`,
      } as any,
    });

    await tx.subscription.create({
      data: {
        tenantId: id,
        plan: `MANUAL_PAYMENT_${days}D`,
        status: 'ACTIVE',
        startedAt: now,
        expiresAt: paidUntil,
        paymentProvider: 'MANUAL',
      },
    });

    return updated;
  });
}

export async function revokeManualTenantAccess(id: number, input: { reason: string }) {
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Motivo obrigatório');

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        trialExpiresAt: true,
        paidUntil: true,
        gracePeriodEndsAt: true,
        billingProvider: true,
        billingPlan: true,
      },
    });
    if (!tenant) throw new Error('Empresa não encontrada');

    const provider = String(tenant.billingProvider || '').toUpperCase();
    const plan = String(tenant.billingPlan || '').toUpperCase();
    const isManual = provider === 'MANUAL' || plan.startsWith('MANUAL');
    if (!isManual) throw new Error('Somente liberações manuais podem ser revogadas');

    const currentSub = String(tenant.subscriptionStatus || 'NONE');
    if (!['ACTIVE', 'TRIAL', 'GRACE_PERIOD'].includes(currentSub)) {
      throw new Error('Não há liberação manual ativa para revogar');
    }

    const now = new Date();

    const next =
      currentSub === 'TRIAL'
        ? {
            subscriptionStatus: 'NONE',
            trialEndsAt: null,
            trialExpiresAt: null,
            paidUntil: null,
            gracePeriodEndsAt: null,
          }
        : {
            subscriptionStatus: 'EXPIRED',
            paidUntil: null,
            gracePeriodEndsAt: null,
          };

    const updated = await tx.tenant.update({
      where: { id },
      data: {
        ...next,
        billingProvider: 'MANUAL',
        billingPlan: 'MANUAL_REVOKED',
      } as any,
    });

    await tx.subscription.create({
      data: {
        tenantId: id,
        plan: 'MANUAL_REVOKED',
        status: 'EXPIRED',
        startedAt: now,
        expiresAt: now,
        paymentProvider: 'MANUAL',
      },
    });

    return { tenant: updated, before: tenant, reason };
  });
}

export async function acceptClaimAsAdmin(input: { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }) {
  const plan = input.plan === 'BIENNIAL' ? 'BIENNIAL' : 'ANNUAL';
  const months = plan === 'BIENNIAL' ? 24 : 12;

  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { cnpj: input.cnpj },
      select: { id: true, companyEmail: true, paidUntil: true, gracePeriodEndsAt: true, trialEndsAt: true, users: { select: { user: { select: { email: true } } } } },
    } as any);
    if (!tenant) throw new Error('Empresa não encontrada');

    const normalizedEmail = normalizeEmail(input.email);
    const emails = new Set<string>();
    if (tenant.companyEmail) emails.add(normalizeEmail(String(tenant.companyEmail)));
    for (const u of (tenant as any).users || []) {
      const e = u?.user?.email ? normalizeEmail(String(u.user.email)) : '';
      if (e) emails.add(e);
    }
    if (emails.size > 0 && !emails.has(normalizedEmail)) {
      throw new Error('E-mail não vinculado à empresa');
    }

    const now = new Date();
    const base = new Date(
      Math.max(
        now.getTime(),
        tenant.paidUntil ? new Date(tenant.paidUntil as any).getTime() : 0,
        tenant.gracePeriodEndsAt ? new Date(tenant.gracePeriodEndsAt as any).getTime() : 0
      )
    );
    const paidUntil = new Date(base);
    paidUntil.setMonth(paidUntil.getMonth() + months);

    const updated = await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        paidUntil,
        gracePeriodEndsAt: null,
        trialEndsAt: null,
        trialExpiresAt: null,
        billingProvider: 'MANUAL',
        billingPlan: `MANUAL_PAYMENT_${plan}`,
      } as any,
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: `MANUAL_PAYMENT_${plan}`,
        status: 'ACTIVE',
        startedAt: now,
        expiresAt: paidUntil,
        paymentProvider: 'MANUAL',
      },
    });

    return { tenant: updated, paidUntil };
  });
}

export async function activateTenantSubscription(id: number, months: number) {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id },
      select: { paidUntil: true, gracePeriodEndsAt: true },
    });
    if (!tenant) throw new Error('Empresa não encontrada');

    const now = new Date();
    const base = new Date(
      Math.max(
        now.getTime(),
        tenant.paidUntil ? tenant.paidUntil.getTime() : 0,
        tenant.gracePeriodEndsAt ? tenant.gracePeriodEndsAt.getTime() : 0
      )
    );
    const paidUntil = new Date(base);
    paidUntil.setMonth(paidUntil.getMonth() + months);

    const updated = await tx.tenant.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
        paidUntil,
        gracePeriodEndsAt: null,
        billingProvider: 'MANUAL',
        billingPlan: `MANUAL_PAYMENT_${months}M`,
      } as any,
    });

    await tx.subscription.create({
      data: {
        tenantId: id,
        plan: `MANUAL_PAYMENT_${months}M`,
        status: 'ACTIVE',
        startedAt: now,
        expiresAt: paidUntil,
        paymentProvider: 'MANUAL',
      },
    });

    return updated;
  });
}

export async function grantTenantAccessDays(id: number, days: number) {
  return manualGrantTenantAccess(id, { reason: 'PAYMENT', days });
}

export async function deleteTenant(id: number) {
    return prisma.$transaction(async (tx) => {
        // 1. Apaga os vínculos fracos (many-to-many ou tabelas "folha" sem cascade)
        await tx.responsavelObra.deleteMany({ where: { responsavel: { tenantId: id } } });
        await tx.medicao.deleteMany({ where: { obra: { tenantId: id } } });
        await tx.pagamento.deleteMany({ where: { obra: { tenantId: id } } });
        
        // 2. Apaga as tabelas com RESTRICT que bloqueiam a exclusão (de baixo para cima)
        await tx.responsavelTecnico.deleteMany({ where: { tenantId: id } });
        await tx.tarefa.deleteMany({ where: { tenantId: id } });
        await tx.documento.deleteMany({ where: { tenantId: id } });
        await tx.custo.deleteMany({ where: { tenantId: id } });
        await tx.etapa.deleteMany({ where: { tenantId: id } });
        
        // 3. Apaga o "nó principal" operacional (Obra)
        await tx.obra.deleteMany({ where: { tenantId: id } });

        // 4. Por fim, apaga o Tenant (o banco cuidará do resto via CASCADE)
        return tx.tenant.delete({
            where: { id }
        });
    });
}
