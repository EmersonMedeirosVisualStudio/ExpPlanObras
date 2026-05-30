import type { IPlaybooksRepository } from '@/modules/playbooks/domain/ports/IPlaybooksRepository.js'
import { maxRisk, needsApproval } from '@/modules/playbooks/guardrails.js'
import type {
  PlaybookActionType,
  PlaybookApprovalPolicy,
  PlaybookRiskLevel,
} from '@/modules/playbooks/types.js'

export interface SimularPlaybookInput {
  tenantId: number
  playbookId: number
}

export type SimularPlaybookOutput =
  | { ok: false; reason: string }
  | {
      ok: true
      playbook: {
        id: number
        codigo: string
        nome: string
        modoExecucao: string
        gatilhoTipo: string
      }
      riskMax: PlaybookRiskLevel
      approvalRequired: boolean
      policy: PlaybookApprovalPolicy
      steps: Array<{
        id: number
        ordemExecucao: number
        tipoAcao: string
        nomePasso: string
        riscoAcao: string
        reversivel: boolean
      }>
    }

function toRisk(v: unknown): PlaybookRiskLevel {
  const s = String(v ?? '').toUpperCase()
  if (s === 'MEDIO' || s === 'ALTO' || s === 'CRITICO') return s as PlaybookRiskLevel
  return 'BAIXO'
}

function toApprovalPolicy(v: unknown): PlaybookApprovalPolicy {
  const s = String(v ?? '').toUpperCase()
  if (
    s === 'NAO_EXIGE' ||
    s === 'EXIGE_ANTES' ||
    s === 'EXIGE_SE_RISCO_ALTO' ||
    s === 'QUATRO_OLHOS'
  )
    return s as PlaybookApprovalPolicy
  return 'EXIGE_SE_RISCO_ALTO'
}

export class SimularPlaybookUseCase {
  constructor(private readonly repo: IPlaybooksRepository) {}

  async execute(input: SimularPlaybookInput): Promise<SimularPlaybookOutput> {
    const pb = (await this.repo.getPlaybookWithSteps(input.tenantId, input.playbookId)) as Record<
      string,
      unknown
    > | null
    if (!pb) return { ok: false, reason: 'PLAYBOOK_INVALIDO' }

    const passos = pb['passos'] as Array<Record<string, unknown>>
    const policy = toApprovalPolicy(pb['politicaAprovacao'])
    let riskMax = toRisk(pb['riscoPadrao'])
    const actionTypes: PlaybookActionType[] = passos.map(
      (p) => String(p['tipoAcao']) as PlaybookActionType,
    )
    for (const p of passos) {
      riskMax = maxRisk(riskMax, toRisk(p['riscoAcao']))
    }
    const approvalRequired = needsApproval({ policy, riskMax, actionTypes })

    return {
      ok: true,
      playbook: {
        id: pb['id'] as number,
        codigo: pb['codigo'] as string,
        nome: pb['nome'] as string,
        modoExecucao: pb['modoExecucao'] as string,
        gatilhoTipo: pb['gatilhoTipo'] as string,
      },
      riskMax,
      approvalRequired,
      policy,
      steps: passos.map((p) => ({
        id: p['id'] as number,
        ordemExecucao: p['ordemExecucao'] as number,
        tipoAcao: p['tipoAcao'] as string,
        nomePasso: p['nomePasso'] as string,
        riscoAcao: p['riscoAcao'] as string,
        reversivel: p['reversivel'] as boolean,
      })),
    }
  }
}
