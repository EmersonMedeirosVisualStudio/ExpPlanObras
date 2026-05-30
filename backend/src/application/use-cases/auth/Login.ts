import bcrypt from 'bcryptjs'
import { InvalidCredentialsError } from '@/domain/errors/AuthErrors.js'
import type { ITokenSigner } from '@/domain/repositories/ITokenSigner.js'
import type { ITenantRepository } from '@/domain/repositories/ITenantRepository.js'
import type { IUserRepository } from '@/domain/repositories/IUserRepository.js'
import { assertTenantActive } from '@/domain/services/assertTenantActive.js'
import { buildSubscriptionAlert } from '@/domain/services/buildSubscriptionAlert.js'
import type { LoginDto } from '@/application/dto/auth/loginDto.js'

export interface LoginResult {
  token: string | null
  subscriptionAlert: string | null
  user: {
    id: number
    email: string
    name: string | null
    cpf: string | null
    isSystemAdmin?: boolean
    idFuncionario?: number | null
    perfis?: string[]
    permissoes?: string[]
    abrangencia?: unknown
    tenants: Array<{ tenantId: number; role: string; name: string; slug: string }>
  }
}

export class LoginUseCase {
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

  async execute(input: LoginDto): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(input.email)
    if (!user) throw new InvalidCredentialsError()

    const isValid = await bcrypt.compare(input.password, user.password)
    if (!isValid) throw new InvalidCredentialsError()

    if (user.isSystemAdmin) {
      const token = this.tokenSigner.sign({ userId: user.id, role: 'SYSTEM_ADMIN', email: user.email, isSystemAdmin: true })
      return {
        token,
        subscriptionAlert: null,
        user: { id: user.id, email: user.email, name: user.name, cpf: user.cpf, isSystemAdmin: true, tenants: [] },
      }
    }

    const tenants = user.tenants
    if (tenants.length === 1) {
      const selected = tenants[0]
      const fullTenant = await this.tenantRepo.findById(selected.tenantId)
      if (fullTenant) assertTenantActive(fullTenant)
      const subscriptionAlert = fullTenant ? buildSubscriptionAlert(fullTenant) : null
      const session = await this.resolveSessionAccess(user.id, selected.tenantId, selected.role)
      const token = this.tokenSigner.sign({ userId: user.id, tenantId: selected.tenantId, role: selected.role, email: user.email })
      return {
        token,
        subscriptionAlert,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          cpf: user.cpf,
          idFuncionario: selected.funcionarioId,
          perfis: session.perfis,
          permissoes: session.permissoes,
          abrangencia: session.abrangencia,
          tenants: tenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
        },
      }
    }

    return {
      token: null,
      subscriptionAlert: null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        cpf: user.cpf,
        tenants: tenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
      },
    }
  }
}
