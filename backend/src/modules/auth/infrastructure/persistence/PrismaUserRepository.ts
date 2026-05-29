import prisma from '../../../../shared/plugins/prisma.js'
import type { User, UserTenant } from '../../domain/entities/User.js'
import type { CreateUserInput, IUserRepository } from '../../domain/ports/IUserRepository.js'

export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<(User & { tenants: UserTenant[] }) | null> {
    const row = await prisma.user.findUnique({
      where: { email },
      include: { tenants: { include: { tenant: true } } },
    })
    if (!row) return null
    return {
      ...row,
      name: row.name ?? null,
      tenants: (row.tenants as Array<{ tenantId: number; role: string; funcionarioId: number | null; tenant: { name: string; slug: string } }>).map((t) => ({
        tenantId: t.tenantId,
        role: t.role,
        name: t.tenant.name,
        slug: t.tenant.slug,
        funcionarioId: t.funcionarioId ?? null,
      })),
    }
  }

  async findById(id: number): Promise<User | null> {
    const row = await prisma.user.findUnique({ where: { id } })
    if (!row) return null
    return { ...row, name: row.name ?? null }
  }

  async create(input: CreateUserInput): Promise<User> {
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
    })
    return { ...row, name: row.name ?? null }
  }

  async updatePassword(userId: number, hashedPassword: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } })
  }
}
