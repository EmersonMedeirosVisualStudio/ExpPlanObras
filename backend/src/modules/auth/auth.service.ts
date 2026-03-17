import prisma from "../../plugins/prisma.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";
import bcrypt from "bcryptjs";
import { FastifyInstance } from "fastify";
import { normalizeEmail, validateCPF, validateCNPJ, validateCEP, validateSlug } from "../../utils/validators.js";
import { generateUniqueTenantSlug } from "../../utils/slug.js";

function getTrialEndsAt() {
  const days = Number(process.env.TRIAL_DAYS || '60');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getDaysLeft(expiresAt: Date, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(expiresAt);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function buildSubscriptionAlert(tenant: {
  subscriptionStatus?: string | null;
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
  gracePeriodEndsAt?: Date | null;
}) {
  const now = new Date();
  const status = String(tenant.subscriptionStatus || 'NONE');
  const graceDays = Number(process.env.GRACE_DAYS || '10');

  if (status === 'ACTIVE' && tenant.paidUntil) {
    const daysLeft = getDaysLeft(tenant.paidUntil, now);
    if (daysLeft === 15) return 'Sua assinatura vencerá em 15 dias. Regularize para evitar bloqueio do sistema.';
    if (tenant.paidUntil < now) {
      const graceEndsAt = addDays(tenant.paidUntil, graceDays);
      if (now <= graceEndsAt) {
        const gLeft = Math.max(0, getDaysLeft(graceEndsAt, now));
        return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`;
      }
      return 'Assinatura expirada. Faça uma assinatura para reativação.';
    }
    return null;
  }

  if (status === 'TRIAL' && tenant.trialEndsAt) {
    const daysLeft = getDaysLeft(tenant.trialEndsAt, now);
    if (daysLeft === 10) return 'Seu período de teste termina em 10 dias.';
    if (daysLeft === 5) return 'Seu período de teste termina em 5 dias.';
    if (tenant.trialEndsAt < now) return 'Período de teste expirou. Faça uma assinatura para reativação.';
    return null;
  }

  if (status === 'GRACE_PERIOD') {
    const graceEndsAt =
      tenant.gracePeriodEndsAt || (tenant.paidUntil ? addDays(tenant.paidUntil, graceDays) : addDays(now, -1));
    if (now <= graceEndsAt) {
      const gLeft = Math.max(0, getDaysLeft(graceEndsAt, now));
      return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`;
    }
    return 'Assinatura expirada. Faça uma assinatura para reativação.';
  }

  if (status === 'EXPIRED') return 'Assinatura expirada. Faça uma assinatura para reativação.';
  if (status === 'NONE') return 'Sem assinatura. Faça uma assinatura para reativação.';
  return null;
}

function assertTenantActive(tenant: { status: string; subscriptionStatus?: string; trialEndsAt?: Date | null; paidUntil?: Date | null; gracePeriodEndsAt?: Date | null }) {
  if (tenant.status === 'INACTIVE') {
    throw new Error('Tenant inativo');
  }
  const now = new Date();
  const subscriptionStatus = tenant.subscriptionStatus || 'NONE';
  const graceDays = Number(process.env.GRACE_DAYS || '10');
  if (subscriptionStatus === 'NONE') {
    throw new Error('Sem assinatura. Faça uma assinatura para reativação.');
  }
  if (subscriptionStatus === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < now) {
    throw new Error('Período de teste expirou. Assinatura necessária');
  }
  if (subscriptionStatus === 'ACTIVE') {
    if (!tenant.paidUntil) {
      throw new Error('Assinatura inválida. Regularize para reativação.');
    }
    if (tenant.paidUntil < now) {
      const graceEndsAt = addDays(tenant.paidUntil, graceDays);
      if (now <= graceEndsAt) return;
      throw new Error('Assinatura expirada. Faça uma assinatura para reativação.');
    }
  }
  if (subscriptionStatus === 'GRACE_PERIOD') {
    const graceEndsAt =
      tenant.gracePeriodEndsAt || (tenant.paidUntil ? addDays(tenant.paidUntil, graceDays) : addDays(now, -1));
    if (now <= graceEndsAt) return;
    throw new Error('Assinatura expirada. Faça uma assinatura para reativação.');
  }
  if (subscriptionStatus === 'EXPIRED') {
    throw new Error('Assinatura expirada. Faça uma assinatura para reativação.');
  }
}

export async function registerUser(input: RegisterInput) {
  // @ts-ignore
  const {
    name,
    email,
    cpf,
    password,
    tenantName,
    tenantSlug,
    cnpj,
    companyEmail,
    companyWhatsapp,
    link,
    street,
    number,
    neighborhood,
    city,
    state,
    cep,
    latitude,
    longitude,
    whatsapp,
    address,
    location,
    oauthProvider,
    oauthId,
  } = input as any;

  // Normalizações e validações
  const cleanEmail = normalizeEmail(email);
  const cleanCPF = validateCPF(cpf);
  const cleanCNPJ = validateCNPJ(cnpj);
  const cleanCompanyEmail = normalizeEmail(companyEmail);
  const cleanCEP = validateCEP(cep);

  const hashedPassword = await bcrypt.hash(password, 10);

  // Transaction to create Tenant and User
  const result = await prisma.$transaction(async (tx) => {
    const cleanSlug = tenantSlug ? validateSlug(tenantSlug) : await generateUniqueTenantSlug(tx, tenantName);
    // 1. Create Tenant
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
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
        subscriptionStatus: 'TRIAL', // legado
        trialEndsAt: getTrialEndsAt(),
        trialExpiresAt: getTrialEndsAt(),
        paidUntil: null,
        gracePeriodEndsAt: null,
      },
    });

    // 2. Create User
    const user = await tx.user.create({
      data: {
        email: cleanEmail,
        cpf: cleanCPF,
        name,
        password: hashedPassword,
        whatsapp,
        address,
        location,
        oauthProvider,
        oauthId
      },
    });

    // 3. Link User to Tenant
    await tx.tenantUser.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: "ADMIN",
      },
    });

    await tx.tenantHistoryEntry.create({
      data: {
        tenantId: tenant.id,
        source: 'SYSTEM',
        action: 'TENANT_CREATED',
        message: 'Empresa cadastrada. Status: TRIAL.',
      },
    });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: 'TRIAL',
        status: 'TRIAL',
        startedAt: new Date(),
        expiresAt: tenant.trialExpiresAt ?? getTrialEndsAt(),
      },
    });

    return { tenant, user };
  });

  return result;
}

export async function loginUser(input: LoginInput, app: FastifyInstance) {
  const { email, password } = input;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    include: { 
      tenants: {
        include: {
          tenant: true
        }
      } 
    },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // System Admin Check
  if (user.isSystemAdmin) {
      const token = app.jwt.sign({
          userId: user.id,
          role: 'SYSTEM_ADMIN',
          email: user.email,
          isSystemAdmin: true
      });

      return {
          token,
          user: {
              id: user.id,
              email: user.email,
              name: user.name,
              cpf: user.cpf,
              isSystemAdmin: true,
              tenants: [] // System Admin sees all via admin panel
          }
      };
  }

  // If user has only one tenant, return token for that tenant
  // If multiple, return list of tenants for selection (frontend handles selection)
  // For simplicity, we return the user and their tenants. 
  // The frontend will then call a "select-tenant" or just use the first one if only one exists.
  // But to keep JWT stateless, we need to know WHICH tenant context to sign.
  
  // Strategy: Return user and tenants. Frontend picks one and calls /auth/token endpoint.
  // OR: Return a temporary token that allows calling /auth/token.
  
  // Simplest for MVP: Return the tenants list. 
  // If only 1, generate token immediately.
  // If > 1, return NO token but return tenants list. Frontend prompts selection.
  
  let token = null;
  let selectedTenant = null;

  if (user.tenants.length === 1) {
    selectedTenant = user.tenants[0];
    assertTenantActive(selectedTenant.tenant as any);
    const subscriptionAlert = buildSubscriptionAlert(selectedTenant.tenant as any);
    token = app.jwt.sign({
      userId: user.id,
      tenantId: selectedTenant.tenantId,
      role: selectedTenant.role,
      email: user.email,
    });
    return {
      token,
      subscriptionAlert,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        cpf: user.cpf,
        tenants: user.tenants.map(t => ({
          tenantId: t.tenantId,
          role: t.role,
          name: t.tenant.name,
          slug: t.tenant.slug
        }))
      }
    };
  }

  return { 
    token, 
    user: { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      cpf: user.cpf,
      tenants: user.tenants.map(t => ({
        tenantId: t.tenantId,
        role: t.role,
        name: t.tenant.name,
        slug: t.tenant.slug
      }))
    } 
  };
}

export async function loginUserByEmail(email: string, app: FastifyInstance) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenants: {
        include: {
          tenant: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.isSystemAdmin) {
    const token = app.jwt.sign({
      userId: user.id,
      role: 'SYSTEM_ADMIN',
      email: user.email,
      isSystemAdmin: true,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        cpf: user.cpf,
        isSystemAdmin: true,
        tenants: [],
      },
    };
  }

  let token = null;
  let selectedTenant = null;

  if (user.tenants.length === 1) {
    selectedTenant = user.tenants[0];
    assertTenantActive(selectedTenant.tenant as any);
    token = app.jwt.sign({
      userId: user.id,
      tenantId: selectedTenant.tenantId,
      role: selectedTenant.role,
      email: user.email,
    });
  }

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      cpf: user.cpf,
      tenants: user.tenants.map((t) => ({
        tenantId: t.tenantId,
        role: t.role,
        name: t.tenant.name,
        slug: t.tenant.slug,
      })),
    },
  };
}

export async function selectTenant(userId: number, tenantId: number, app: FastifyInstance) {
    const tenantUser = await prisma.tenantUser.findUnique({
        where: {
            tenantId_userId: {
                tenantId,
                userId
            }
        },
        include: {
            user: true,
            tenant: true
        }
    });

    if (!tenantUser) {
        throw new Error("User does not belong to this tenant");
    }

    assertTenantActive(tenantUser.tenant as any);
    const subscriptionAlert = buildSubscriptionAlert(tenantUser.tenant as any);

    const token = app.jwt.sign({
        userId: userId,
        tenantId: tenantId,
        role: tenantUser.role,
        email: tenantUser.user.email,
    });

    return { token, user: tenantUser.user, subscriptionAlert };
}

export async function changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) throw new Error("Senha atual incorreta");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
    });
}
