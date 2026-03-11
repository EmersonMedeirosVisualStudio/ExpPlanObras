import prisma from "../../plugins/prisma.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";
import bcrypt from "bcryptjs";
import { FastifyInstance } from "fastify";

function getTrialEndsAt() {
  const days = Number(process.env.TRIAL_DAYS || '30');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function assertTenantActive(tenant: { status: string; subscriptionStatus?: string; trialEndsAt?: Date | null; paidUntil?: Date | null }) {
  if (tenant.status === 'INACTIVE') {
    throw new Error('Tenant inativo');
  }
  const now = new Date();
  const subscriptionStatus = tenant.subscriptionStatus || 'TRIAL';
  if (subscriptionStatus === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < now) {
    throw new Error('Período de teste expirou. Assinatura necessária');
  }
  if (subscriptionStatus === 'ACTIVE' && tenant.paidUntil && tenant.paidUntil < now) {
    throw new Error('Assinatura expirada. Renovação necessária');
  }
}

export async function registerUser(input: RegisterInput) {
  // @ts-ignore
  const { name, email, cpf, password, tenantName, tenantSlug, cnpj, whatsapp, address, location } = input;

  const hashedPassword = await bcrypt.hash(password, 10);

  // Transaction to create Tenant and User
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Tenant
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
        cnpj: cnpj,
        subscriptionStatus: 'TRIAL',
        trialEndsAt: getTrialEndsAt(),
      },
    });

    // 2. Create User
    const user = await tx.user.create({
      data: {
        email,
        cpf,
        name,
        password: hashedPassword,
        whatsapp,
        address,
        location
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
      tenants: user.tenants.map(t => ({
        tenantId: t.tenantId,
        role: t.role,
        name: t.tenant.name,
        slug: t.tenant.slug
      }))
    } 
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

    const token = app.jwt.sign({
        userId: userId,
        tenantId: tenantId,
        role: tenantUser.role,
        email: tenantUser.user.email,
    });

    return { token, user: tenantUser.user };
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
