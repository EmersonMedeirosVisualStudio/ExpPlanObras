import bcrypt from 'bcryptjs';
import prisma from '../../../../shared/plugins/prisma.js';
import { UserAlreadyExistsError } from '../../domain/errors/AuthErrors.js';
import { generateUniqueTenantSlug } from '../../../../utils/slug.js';
import { normalizeEmail, validateCEP, validateCNPJ, validateCPF, validateSlug } from '../../../../utils/validators.js';
export class RegisterUseCase {
    async execute(input) {
        const cleanEmail = normalizeEmail(input.email);
        const cleanCPF = validateCPF(input.cpf);
        const cleanCNPJ = validateCNPJ(input.cnpj);
        const cleanCompanyEmail = normalizeEmail(input.companyEmail);
        const cleanCEP = validateCEP(input.cep);
        const hashedPassword = await bcrypt.hash(input.password, 10);
        const trialDays = Number(process.env.TRIAL_DAYS || '60');
        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
        try {
            return await prisma.$transaction(async (tx) => {
                const cleanSlug = input.tenantSlug
                    ? validateSlug(input.tenantSlug)
                    : await generateUniqueTenantSlug(tx, input.tenantName);
                const tenant = await tx.tenant.create({
                    data: {
                        name: input.tenantName,
                        slug: cleanSlug,
                        cnpj: cleanCNPJ ?? '',
                        companyEmail: cleanCompanyEmail ?? '',
                        companyWhatsapp: input.companyWhatsapp ?? null,
                        link: input.link ?? null,
                        googleMapsLink: input.link ?? null,
                        street: input.street,
                        number: input.number,
                        neighborhood: input.neighborhood,
                        city: input.city,
                        state: input.state,
                        cep: cleanCEP ?? '',
                        latitude: input.latitude ?? null,
                        longitude: input.longitude ?? null,
                        status: 'ACTIVE',
                        subscriptionStatus: 'TRIAL',
                        trialEndsAt,
                        trialExpiresAt: trialEndsAt,
                        paidUntil: null,
                        gracePeriodEndsAt: null,
                    },
                });
                const user = await tx.user.create({
                    data: {
                        email: cleanEmail ?? input.email,
                        cpf: cleanCPF ?? '',
                        name: input.name,
                        password: hashedPassword,
                        whatsapp: input.whatsapp ?? null,
                        address: input.address ?? null,
                        location: input.location ?? null,
                        oauthProvider: input.oauthProvider ?? null,
                        oauthId: input.oauthId ?? null,
                    },
                });
                await tx.tenantUser.create({ data: { tenantId: tenant.id, userId: user.id, role: 'ADMIN' } });
                await tx.empresaRepresentante.create({
                    data: {
                        tenantId: tenant.id,
                        funcionarioId: null,
                        nomeRepresentante: input.name,
                        cpf: cleanCPF ?? '',
                        email: cleanEmail ?? input.email,
                        ativo: true,
                        dataInicio: new Date(),
                        dataFim: null,
                    },
                });
                await tx.tenantHistoryEntry.create({
                    data: { tenantId: tenant.id, source: 'SYSTEM', action: 'TENANT_CREATED', message: 'Empresa cadastrada. Status: TRIAL.' },
                });
                await tx.subscription.create({
                    data: { tenantId: tenant.id, plan: 'TRIAL', status: 'TRIAL', startedAt: new Date(), expiresAt: trialEndsAt },
                });
                return { tenant, user };
            });
        }
        catch (err) {
            if (err?.code === 'P2002')
                throw new UserAlreadyExistsError();
            throw err;
        }
    }
}
