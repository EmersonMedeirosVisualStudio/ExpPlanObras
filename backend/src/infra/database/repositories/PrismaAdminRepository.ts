import prisma from '@/infra/database/prisma/client.js'
import type { IAdminRepository } from '@/domain/repositories/IAdminRepository.js'
import {
  acceptClaimAsAdmin,
  activateTenantSubscription,
  createTenantByAdmin,
  deleteTenant,
  getAllTenants,
  manualGrantTenantAccess,
  resetRepresentativePassword,
  revokeManualTenantAccess,
  updateTenant,
} from '@/infra/providers/admin/adminOps.js'
import type { CreateTenantDto } from '@/application/dto/admin/createTenantDto.js'
import type { UpdateTenantDto } from '@/application/dto/admin/updateTenantDto.js'

export class PrismaAdminRepository implements IAdminRepository {
  async listTenants() {
    return getAllTenants()
  }

  async createTenant(input: unknown, actorUserId?: number | null) {
    return createTenantByAdmin(input as CreateTenantDto)
  }

  async updateTenant(id: number, input: unknown, actorUserId?: number | null) {
    const before = await prisma.tenant.findUnique({ where: { id } })
    const tenant = await updateTenant(id, input as UpdateTenantDto)

    if (before) {
      const body = input as Record<string, unknown>
      const changes: string[] = []
      if (typeof body.status === 'string' && body.status !== before.status) changes.push(`Status: ${before.status} → ${body.status}`)
      if (typeof body.subscriptionStatus === 'string' && body.subscriptionStatus !== before.subscriptionStatus) changes.push(`Assinatura: ${before.subscriptionStatus} → ${body.subscriptionStatus}`)
      if (typeof body.link === 'string' && body.link !== (before as Record<string, unknown>).link) changes.push('Link atualizado')
      if (typeof body.city === 'string' && body.city !== (before as Record<string, unknown>).city) changes.push('Cidade atualizada')
      if (typeof body.state === 'string' && body.state !== (before as Record<string, unknown>).state) changes.push('UF atualizada')

      if (changes.length > 0) {
        await prisma.tenantHistoryEntry.create({
          data: {
            tenantId: id,
            source: 'ADMIN',
            actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
            message: `Edição pelo administrador: ${changes.join('; ')}`,
          },
        })
      }
    }

    return tenant
  }

  async deleteTenant(id: number) {
    return deleteTenant(id)
  }

  async grantAccess(id: number, input: { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number }, actorUserId?: number | null) {
    const tenant = await manualGrantTenantAccess(id, input)
    const reasonLabel = input.reason === 'PAYMENT' ? 'Pagamento confirmado' : 'Extensão do período de teste'
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: id,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: `Liberação manual. Motivo: ${reasonLabel}. Prazo: ${input.days} dia(s).`,
      },
    })
    return tenant
  }

  async revokeAccess(id: number, input: { reason: string }, actorUserId?: number | null) {
    const result = await revokeManualTenantAccess(id, input)
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: id,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: `Revogação manual. Motivo: ${(result as { reason: string }).reason}.`,
      },
    })
    return (result as { tenant: unknown }).tenant
  }

  async acceptClaim(input: { cnpj: string; email: string; plan: 'ANNUAL' | 'BIENNIAL' }, actorUserId?: number | null) {
    const result = await acceptClaimAsAdmin(input)
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: (result as { tenant: { id: number } }).tenant.id,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: `Regularização por aceite do administrador. Plano: ${input.plan}.`,
      },
    })
    return result
  }

  async activateSubscription(id: number, months: number, actorUserId?: number | null) {
    const tenant = await activateTenantSubscription(id, months)
    await prisma.tenantHistoryEntry.create({
      data: {
        tenantId: id,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: `Liberação manual: assinatura ativada por ${months} mês(es). Status: ACTIVE.`,
      },
    })
    return tenant
  }

  async resetRepresentativePassword(tenantId: number, newPassword: string) {
    return resetRepresentativePassword(tenantId, newPassword)
  }

  async getTenantHistory(tenantId: number) {
    return prisma.tenantHistoryEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
        actorUser: { select: { id: true, name: true, email: true } },
      },
    })
  }

  async addTenantHistory(tenantId: number, input: { message: string; attachmentUrls?: string[] }, actorUserId?: number | null) {
    const entry = await prisma.tenantHistoryEntry.create({
      data: {
        tenantId,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: input.message,
      },
    })

    const urls = (input.attachmentUrls || []).map((u) => String(u || '').trim()).filter((u) => u.length > 0)
    if (urls.length > 0) {
      await prisma.tenantHistoryAttachment.createMany({
        data: urls.map((url) => ({ entryId: entry.id, url })),
      })
    }

    return prisma.tenantHistoryEntry.findUnique({
      where: { id: entry.id },
      include: {
        attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
        actorUser: { select: { id: true, name: true, email: true } },
      },
    })
  }

  async uploadTenantHistoryAttachment(
    tenantId: number,
    input: { message: string; files: Array<{ filename: string; mimetype: string; buffer: Buffer }> },
    actorUserId?: number | null,
  ) {
    const entry = await prisma.tenantHistoryEntry.create({
      data: {
        tenantId,
        source: 'ADMIN',
        actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
        message: input.message.trim(),
      },
    })

    await prisma.tenantHistoryAttachment.createMany({
      data: input.files.map((f) => ({
        entryId: entry.id,
        url: null,
        filename: f.filename,
        mimeType: f.mimetype,
        data: Buffer.from(f.buffer),
      })),
    })

    return prisma.tenantHistoryEntry.findUnique({
      where: { id: entry.id },
      include: {
        attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
        actorUser: { select: { id: true, name: true, email: true } },
      },
    })
  }

  async getHistoryAttachment(attachmentId: number) {
    return prisma.tenantHistoryAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, url: true, filename: true, mimeType: true, data: true },
    })
  }
}
