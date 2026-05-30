import type { Tenant } from '@/domain/entities/Tenant.js'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function assertTenantActive(tenant: Tenant): void {
  if (tenant.status === 'INACTIVE') throw new Error('Tenant inativo')

  const now = new Date()
  const status = tenant.subscriptionStatus || 'NONE'
  const graceDays = Number(process.env.GRACE_DAYS || '10')

  if (status === 'NONE') throw new Error('Sem assinatura. Faça uma assinatura para reativação.')
  if (status === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < now)
    throw new Error('Período de teste expirou. Assinatura necessária')
  if (status === 'ACTIVE') {
    if (!tenant.paidUntil) throw new Error('Assinatura inválida. Regularize para reativação.')
    if (tenant.paidUntil < now) {
      if (now <= addDays(tenant.paidUntil, graceDays)) return
      throw new Error('Assinatura expirada. Faça uma assinatura para reativação.')
    }
  }
  if (status === 'GRACE_PERIOD') {
    const graceEndsAt =
      tenant.gracePeriodEndsAt ||
      (tenant.paidUntil ? addDays(tenant.paidUntil, graceDays) : addDays(now, -1))
    if (now <= graceEndsAt) return
    throw new Error('Assinatura expirada. Faça uma assinatura para reativação.')
  }
  if (status === 'EXPIRED') throw new Error('Assinatura expirada. Faça uma assinatura para reativação.')
}
