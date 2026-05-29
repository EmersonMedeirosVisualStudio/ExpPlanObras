export interface Tenant {
  id: number
  name: string
  slug: string
  status: string
  subscriptionStatus: string | null
  trialEndsAt: Date | null
  paidUntil: Date | null
  gracePeriodEndsAt: Date | null
}

export function isTrialExpired(tenant: Tenant, now: Date): boolean {
  return (
    (tenant.subscriptionStatus || 'TRIAL') === 'TRIAL' &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt < now
  )
}

export function buildSubscriptionAlert(tenant: Tenant): string | null {
  const now = new Date()
  const status = String(tenant.subscriptionStatus || 'NONE')
  const graceDays = Number(process.env.GRACE_DAYS || '10')

  function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
  }

  function daysLeft(expiresAt: Date): number {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(expiresAt)
    end.setHours(0, 0, 0, 0)
    return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  }

  if (status === 'ACTIVE' && tenant.paidUntil) {
    const left = daysLeft(tenant.paidUntil)
    if (left === 15) return 'Sua assinatura vencerá em 15 dias. Regularize para evitar bloqueio do sistema.'
    if (tenant.paidUntil < now) {
      const graceEndsAt = addDays(tenant.paidUntil, graceDays)
      if (now <= graceEndsAt) {
        const gLeft = Math.max(0, daysLeft(graceEndsAt))
        return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`
      }
      return 'Assinatura expirada. Faça uma assinatura para reativação.'
    }
    return null
  }

  if (status === 'TRIAL' && tenant.trialEndsAt) {
    const left = daysLeft(tenant.trialEndsAt)
    if (left === 10) return 'Seu período de teste termina em 10 dias.'
    if (left === 5) return 'Seu período de teste termina em 5 dias.'
    if (tenant.trialEndsAt < now) return 'Período de teste expirou. Faça uma assinatura para reativação.'
    return null
  }

  if (status === 'GRACE_PERIOD') {
    const graceEndsAt =
      tenant.gracePeriodEndsAt ||
      (tenant.paidUntil
        ? (() => { const d = new Date(tenant.paidUntil!); d.setDate(d.getDate() + graceDays); return d })()
        : (() => { const d = new Date(now); d.setDate(d.getDate() - 1); return d })())
    if (now <= graceEndsAt) {
      const gLeft = Math.max(0, daysLeft(graceEndsAt))
      return `Sua assinatura está vencida. Você tem ${gLeft} dia(s) para regularizar.`
    }
    return 'Assinatura expirada. Faça uma assinatura para reativação.'
  }

  if (status === 'EXPIRED') return 'Assinatura expirada. Faça uma assinatura para reativação.'
  if (status === 'NONE') return 'Sem assinatura. Faça uma assinatura para reativação.'
  return null
}

export function assertTenantActive(tenant: Tenant): void {
  if (tenant.status === 'INACTIVE') throw new Error('Tenant inativo')

  const now = new Date()
  const status = tenant.subscriptionStatus || 'NONE'
  const graceDays = Number(process.env.GRACE_DAYS || '10')

  function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
  }

  if (status === 'NONE') throw new Error('Sem assinatura. Faça uma assinatura para reativação.')
  if (status === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < now)
    throw new Error('Período de teste expirou. Assinatura necessária')
  if (status === 'ACTIVE') {
    if (!tenant.paidUntil) throw new Error('Assinatura inválida. Regularize para reativação.')
    if (tenant.paidUntil < now) {
      const graceEndsAt = addDays(tenant.paidUntil, graceDays)
      if (now <= graceEndsAt) return
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
