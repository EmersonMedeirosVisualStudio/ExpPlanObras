import type { IDocumentosQualificadosRepository } from '@/domain/repositories/IDocumentosQualificadosRepository.js'
import { AccessDeniedError, TenantNotSelectedError } from '@/domain/errors/DocumentosQualificadosErrors.js'

export interface AuthContext {
  isSystemAdmin: boolean
  tenantId: number | null
  userId: number
  role: string
}

export class CheckAdminOrEncarregadoUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(ctx: AuthContext): Promise<{ tenantId: number; userId: number; role: string }> {
    if (ctx.isSystemAdmin) {
      if (ctx.tenantId == null) throw new TenantNotSelectedError()
      return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }
    }

    if (ctx.tenantId == null) throw new TenantNotSelectedError()

    const tenantUser = await this.repo.findTenantUser(ctx.tenantId, ctx.userId)
    if (!tenantUser) throw new TenantNotSelectedError()
    if (tenantUser.role === 'ADMIN') return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }

    const enc = await this.repo.findEmpresaEncarregado(ctx.tenantId)
    if (enc?.userId === ctx.userId) return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }

    throw new AccessDeniedError()
  }
}
