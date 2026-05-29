import prisma from '../../../../shared/plugins/prisma.js';
export class PrismaUserRepository {
    async findByEmail(email) {
        const row = await prisma.user.findUnique({
            where: { email },
            include: { tenants: { include: { tenant: true } } },
        });
        if (!row)
            return null;
        return {
            ...row,
            name: row.name ?? null,
            tenants: row.tenants.map((t) => ({
                tenantId: t.tenantId,
                role: t.role,
                name: t.tenant.name,
                slug: t.tenant.slug,
                funcionarioId: t.funcionarioId ?? null,
            })),
        };
    }
    async findById(id) {
        const row = await prisma.user.findUnique({ where: { id } });
        if (!row)
            return null;
        return { ...row, name: row.name ?? null };
    }
    async create(input) {
        const row = await prisma.user.create({
            data: {
                email: input.email,
                name: input.name,
                cpf: input.cpf ?? '',
                password: input.password,
                whatsapp: input.whatsapp ?? null,
                address: input.address ?? null,
                location: input.location ?? null,
                oauthProvider: input.oauthProvider ?? null,
                oauthId: input.oauthId ?? null,
            },
        });
        return { ...row, name: row.name ?? null };
    }
    async updatePassword(userId, hashedPassword) {
        await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
    }
}
