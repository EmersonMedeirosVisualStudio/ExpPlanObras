
import prisma from "../../plugins/prisma.js";
import { CreateTenantInput, UpdateTenantInput } from "./admin.schema.js";
import bcrypt from "bcryptjs";

function getTrialEndsAt() {
  const days = Number(process.env.TRIAL_DAYS || '30');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createTenantByAdmin(input: CreateTenantInput) {
  const { 
    name, slug, cnpj, 
    representativeName, representativeEmail, representativeCpf, representativePassword,
    representativeWhatsapp, representativeAddress, representativeLocation
  } = input;

  const hashedPassword = await bcrypt.hash(representativePassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Tenant
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug,
        cnpj,
        subscriptionStatus: 'TRIAL',
        trialEndsAt: getTrialEndsAt(),
      },
    });

    // 2. Check if user already exists
    let user = await tx.user.findUnique({
        where: { cpf: representativeCpf }
    });

    if (!user) {
        // Create User if not exists
        user = await tx.user.create({
            data: {
                email: representativeEmail,
                cpf: representativeCpf,
                name: representativeName,
                password: hashedPassword,
                whatsapp: representativeWhatsapp,
                address: representativeAddress,
                location: representativeLocation
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
        }
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

export async function activateTenantSubscription(id: number, months: number) {
  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + months);
  return prisma.tenant.update({
    where: { id },
    data: {
      subscriptionStatus: 'ACTIVE',
      paidUntil,
    },
  });
}

export async function grantTenantAccessDays(id: number, days: number) {
  const paidUntil = new Date();
  paidUntil.setDate(paidUntil.getDate() + days);
  return prisma.tenant.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
      paidUntil,
      billingProvider: 'MANUAL',
      billingPlan: `MANUAL_${days}D`,
    } as any,
  });
}

export async function deleteTenant(id: number) {
    return prisma.tenant.delete({
        where: { id }
    });
}
