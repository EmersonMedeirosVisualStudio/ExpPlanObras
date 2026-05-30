import { cancelarExecucao } from '@/infra/providers/playbooks/playbooksOps.js'

export interface CancelarExecucaoInput {
  tenantId: number
  userId: number
  execucaoId: number
  motivo?: string | null
}

export type CancelarExecucaoOutput = { ok: false; reason: string } | { ok: true }

export class CancelarExecucaoUseCase {
  async execute(input: CancelarExecucaoInput): Promise<CancelarExecucaoOutput> {
    return cancelarExecucao(input) as Promise<CancelarExecucaoOutput>
  }
}
