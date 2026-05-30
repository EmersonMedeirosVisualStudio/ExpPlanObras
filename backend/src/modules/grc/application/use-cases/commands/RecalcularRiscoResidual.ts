import type { IGrcRepository } from '@/modules/grc/domain/ports/IGrcRepository.js'
import { GrcRiscoNotFoundError } from '@/modules/grc/domain/errors/GrcErrors.js'
import { reduzirScorePorControles } from '@/modules/grc/score.js'

export class RecalcularRiscoResidual {
  constructor(private readonly repo: IGrcRepository) {}

  async execute(riscoId: number, tenantId: number) {
    const risco = await this.repo.findUniqueRisco(riscoId)
    if (!risco || risco.tenantId !== tenantId) throw new GrcRiscoNotFoundError(riscoId)

    const links = await this.repo.findManyRiscoControles(tenantId, riscoId)

    let efetividade = 0
    for (const link of links) {
      const last = await this.repo.findFirstControleTeste(tenantId, link.controleId)
      const eff =
        typeof last?.efetividadeScore === 'number'
          ? last.efetividadeScore
          : last?.resultadoTeste === 'EFETIVO'
            ? 80
            : last?.resultadoTeste === 'PARCIALMENTE_EFETIVO'
              ? 40
              : 0
      efetividade += eff * Math.max(1, link.pesoMitigacao)
    }

    const pesoTotal = links.reduce((acc, l) => acc + Math.max(1, l.pesoMitigacao), 0)
    const efetividadePonderada = pesoTotal ? Math.round(efetividade / pesoTotal) : 0
    const { residual } = reduzirScorePorControles({ scoreInerente: risco.scoreInerente, efetividadePonderada })

    await this.repo.updateRisco(risco.id, {
      scoreResidual: residual,
      impactoResidual: risco.impactoResidual ?? risco.impactoInerente,
      probabilidadeResidual: risco.probabilidadeResidual ?? risco.probabilidadeInerente,
    })

    return { scoreResidual: residual, efetividadePonderada }
  }
}
