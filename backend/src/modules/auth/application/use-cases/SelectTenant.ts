import type { FastifyInstance } from 'fastify'
import { TenantAccessDeniedError } from '@/modules/auth/domain/errors/AuthErrors.js'
import type { ITenantRepository } from '@/modules/auth/domain/ports/ITenantRepository.js'
import type { IUserRepository } from '@/modules/auth/domain/ports/IUserRepository.js'
import { assertTenantActive } from '@/modules/auth/domain/services/assertTenantActive.js'
import { buildSubscriptionAlert } from '@/modules/auth/domain/services/buildSubscriptionAlert.js'

export class SelectTenantUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly resolveSessionAccess: (
      userId: number,
      tenantId: number,
      role: string,
    ) => Promise<{ perfis: string[]; permissoes: string[]; abrangencia: unknown }>,
  ) {}

  async execute(userId: number, tenantId: number, app: FastifyInstance) {
    const tenantUser = await this.tenantRepo.findTenantUser(tenantId, userId)
    if (!tenantUser) throw new TenantAccessDeniedError()

    assertTenantActive(tenantUser.tenant)
    const subscriptionAlert = buildSubscriptionAlert(tenantUser.tenant)
    const session = await this.resolveSessionAccess(userId, tenantId, tenantUser.role)
    const allTenants = await this.tenantRepo.getUserTenants(userId)
    const user = await this.userRepo.findById(userId)

    const token = app.jwt.sign({ userId, tenantId, role: tenantUser.role, email: user?.email ?? '' })

    return {
      token,
      subscriptionAlert,
      user: {
        id: userId,
        email: user?.email ?? '',
        name: user?.name ?? '',
        cpf: user?.cpf ?? null,
        perfis: session.perfis,
        permissoes: session.permissoes,
        abrangencia: session.abrangencia,
        tenants: allTenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
      },
    }
  }
}
