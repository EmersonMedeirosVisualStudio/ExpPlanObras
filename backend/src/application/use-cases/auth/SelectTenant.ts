import { TenantAccessDeniedError } from '@/domain/errors/AuthErrors.js'
import type { ITokenSigner } from '@/domain/repositories/ITokenSigner.js'
import type { ITenantRepository } from '@/domain/repositories/ITenantRepository.js'
import type { IUserRepository } from '@/domain/repositories/IUserRepository.js'
import { assertTenantActive } from '@/domain/services/assertTenantActive.js'
import { buildSubscriptionAlert } from '@/domain/services/buildSubscriptionAlert.js'

export class SelectTenantUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly resolveSessionAccess: (
      userId: number,
      tenantId: number,
      role: string,
    ) => Promise<{ perfis: string[]; permissoes: string[]; abrangencia: unknown }>,
    private readonly tokenSigner: ITokenSigner,
  ) {}

  async execute(userId: number, tenantId: number) {
    const tenantUser = await this.tenantRepo.findTenantUser(tenantId, userId)
    if (!tenantUser) throw new TenantAccessDeniedError()

    assertTenantActive(tenantUser.tenant)
    const subscriptionAlert = buildSubscriptionAlert(tenantUser.tenant)
    const session = await this.resolveSessionAccess(userId, tenantId, tenantUser.role)
    const allTenants = await this.tenantRepo.getUserTenants(userId)
    const user = await this.userRepo.findById(userId)

    const token = this.tokenSigner.sign({ userId, tenantId, role: tenantUser.role, email: user?.email ?? '' })

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
