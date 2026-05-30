import type { IContinuidadeRepository } from '@/modules/continuidade/domain/ports/IContinuidadeRepository.js'

function grade(score: number): 'SAUDAVEL' | 'ATENCAO' | 'RISCO' | 'CRITICO' {
  if (score >= 85) return 'SAUDAVEL'
  if (score >= 70) return 'ATENCAO'
  if (score >= 50) return 'RISCO'
  return 'CRITICO'
}

export async function calcularReadinessPlano(args: {
  tenantId: number
  planoId: number
  repo: IContinuidadeRepository
}) {
  const plano = await args.repo.getBcpPlanoById(args.tenantId, args.planoId)
  if (!plano) return { ok: false as const, reason: 'PLANO_INVALIDO' }

  const p = plano as {
    ownerUserId: number | null
    rtoMinutos: number
    rpoMinutos: number
    aprovadoPor: number | null
    aprovadoEm: Date | null
  }

  const [ativos, runbooks, ultTeste, drOk] = await Promise.all([
    args.repo.countBcpPlanoAtivosCriticos(args.tenantId, args.planoId),
    args.repo.countBcpPlanoRunbooks(args.tenantId, args.planoId),
    args.repo.findLastBcpTeste(args.tenantId, args.planoId),
    args.repo.countDrExecucoesConcluidas(args.tenantId, args.planoId),
  ])

  const teste = ultTeste as { scoreProntidao?: number | null } | null

  let score = 0
  if (ativos > 0) score += 15
  if (runbooks > 0) score += 15
  if (p.ownerUserId) score += 10
  if (p.rtoMinutos > 0 && p.rpoMinutos > 0) score += 10
  if (teste?.scoreProntidao && teste.scoreProntidao >= 70) score += 20
  if (drOk > 0) score += 20
  if (p.aprovadoPor && p.aprovadoEm) score += 10

  const componentes = {
    ativosCadastrados: ativos > 0,
    runbooksVinculados: runbooks > 0,
    ownerDefinido: Boolean(p.ownerUserId),
    rtoRpoDefinidos: p.rtoMinutos > 0 && p.rpoMinutos > 0,
    ultimoTesteScore: teste?.scoreProntidao ?? null,
    possuiDrConcluido: drOk > 0,
    aprovado: Boolean(p.aprovadoPor && p.aprovadoEm),
  }

  return { ok: true as const, score, class: grade(score), componentes }
}
