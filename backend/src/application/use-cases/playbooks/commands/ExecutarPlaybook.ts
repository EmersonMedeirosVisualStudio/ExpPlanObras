import { executarPlaybook } from '@/infra/providers/playbooks/playbooksOps.js'
import type { PlaybookMode } from '@/infra/providers/playbooks/types.js'

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
