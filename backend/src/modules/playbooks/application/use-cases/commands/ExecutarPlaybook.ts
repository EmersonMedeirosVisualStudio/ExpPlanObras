import { executarPlaybook } from '@/modules/playbooks/infrastructure/services/playbooksOps.js'
import type { PlaybookMode } from '@/modules/playbooks/types.js'

export interface ExecutarPlaybookInput {
  tenantId: number
  executorUserId: number
  playbookId: number
  alertaId?: number | null
  incidenteId?: number | null
  eventoOrigemId?: number | null
  modoExecucao?: PlaybookMode
}

export type ExecutarPlaybookOutput =
  | { ok: false; reason: string }
  | {
      ok: true
      execucaoId: number
      statusExecucao: string
      aprovacaoExigida: boolean
      incidenteId?: number | null
    }

export class ExecutarPlaybookUseCase {
  async execute(input: ExecutarPlaybookInput): Promise<ExecutarPlaybookOutput> {
    return executarPlaybook(input) as Promise<ExecutarPlaybookOutput>
  }
}
