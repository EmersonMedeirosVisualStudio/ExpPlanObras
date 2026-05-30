import type { IGovernancaDadosRepository } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { QualidadeRegraNotFoundError, AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'
import { calcularScoreQualidadePorAtivo } from '@/modules/governanca-dados/quality.js'

type ExecStatus = 'OK' | 'ALERTA' | 'FALHA' | 'ERRO'

export interface ExecutarRegraResult {
  execucaoId: number
  statusExecucao: ExecStatus
  mensagemResultado: string | null
  score: { score: number; status: string }
}

export class ExecutarQualidadeRegraUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, regraId: number): Promise<ExecutarRegraResult> {
    const regra = await this.repo.getQualidadeRegraById(tenantId, regraId)
    if (!regra) throw new QualidadeRegraNotFoundError(regraId)

    const ativo = await this.repo.findAtivoRaw(regra.ativoId)
    if (!ativo || ativo.tenantId !== tenantId) throw new AtivoNotFoundError(regra.ativoId)

    const tipo = String(regra.tipoRegra || '').toUpperCase()
    const objeto = ativo.objetoNome ? String(ativo.objetoNome) : null

    let statusExecucao: ExecStatus = 'OK'
    let totalRegistros: number | null = null
    let totalInconsistencias: number | null = null
    let valorApurado: number | null = null
    let mensagemResultado: string | null = null

    try {
      const dynamicResult = await this.repo.executarRegraQualidadeDinamica({
        tipo,
        objeto,
        regra,
        ativo,
      })
      statusExecucao = dynamicResult.statusExecucao
      totalRegistros = dynamicResult.totalRegistros
      totalInconsistencias = dynamicResult.totalInconsistencias
      valorApurado = dynamicResult.valorApurado
      mensagemResultado = dynamicResult.mensagemResultado
    } catch (e: unknown) {
      statusExecucao = 'ERRO'
      mensagemResultado = String((e as Error)?.message || 'Erro ao executar regra')
    }

    const exec = await this.repo.createQualidadeExecucao({
      tenantId,
      regraId: regra.id,
      statusExecucao,
      valorApurado: valorApurado ?? null,
      thresholdOk: regra.thresholdOk ?? null,
      thresholdAlerta: regra.thresholdAlerta ?? null,
      totalRegistros: totalRegistros ?? null,
      totalInconsistencias: totalInconsistencias ?? null,
      mensagemResultado,
    })

    if (statusExecucao === 'FALHA' || statusExecucao === 'ALERTA') {
      const now = new Date()
      const titulo = `${tipo} ${regra.nomeRegra}`
      const existing = await this.repo.findOpenIssueByRegra(tenantId, regra.ativoId, regra.id)
      if (existing) {
        await this.repo.updateQualidadeIssue(tenantId, existing.id, {
          ultimaOcorrenciaEm: now,
          severidade: regra.severidade,
          metadataJson: { lastExecId: exec.id, statusExecucao },
        })
      } else {
        await this.repo.createQualidadeIssue({
          tenantId,
          ativoId: regra.ativoId,
          regraId: regra.id,
          tituloIssue: titulo,
          descricaoIssue: mensagemResultado,
          severidade: regra.severidade,
          statusIssue: 'ABERTA',
          responsavelUserId: null,
          primeiraOcorrenciaEm: now,
          ultimaOcorrenciaEm: now,
          metadataJson: { firstExecId: exec.id, statusExecucao },
        })
      }
    }

    const score = await calcularScoreQualidadePorAtivo({ tenantId, ativoId: regra.ativoId })
    return { execucaoId: exec.id, statusExecucao, mensagemResultado, score }
  }
}
