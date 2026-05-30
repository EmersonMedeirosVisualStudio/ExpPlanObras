import { aprovarExecucao } from '@/modules/playbooks/infrastructure/services/playbooksOps.js'

export interface AprovarExecucaoInput {
  tenantId: number
  aprovadorUserId: number
  execucaoId: number
}

export type AprovarExecucaoOutput =
  | { ok: false; reason: string }
  | { ok: true; triggered: unknown }

export class AprovarExecucaoUseCase {
  async execute(input: AprovarExecucaoInput): Promise<AprovarExecucaoOutput> {
    return aprovarExecucao(input) as Promise<AprovarExecucaoOutput>
  }
}
