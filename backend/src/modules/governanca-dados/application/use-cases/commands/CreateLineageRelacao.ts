import type { IGovernancaDadosRepository, CreateLineageInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'
import { AtivoNotFoundError } from '@/modules/governanca-dados/domain/errors/GovernancaErrors.js'

export interface CreateLineageCommand {
  ativoOrigemId: number
  ativoDestinoId: number
  tipoRelacao: string
  nivelRelacao: string
  campoOrigem?: string | null
  campoDestino?: string | null
  transformacaoResumo?: string | null
  pipelineNome?: string | null
  ativo: boolean
}

export class CreateLineageRelacaoUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, command: CreateLineageCommand) {
    const origem = await this.repo.getAtivoById(tenantId, command.ativoOrigemId)
    if (!origem) throw new AtivoNotFoundError(command.ativoOrigemId)

    const destino = await this.repo.getAtivoById(tenantId, command.ativoDestinoId)
    if (!destino) throw new AtivoNotFoundError(command.ativoDestinoId)

    const input: CreateLineageInput = {
      ativoOrigemId: command.ativoOrigemId,
      ativoDestinoId: command.ativoDestinoId,
      tipoRelacao: command.tipoRelacao,
      nivelRelacao: command.nivelRelacao,
      campoOrigem: command.campoOrigem ?? null,
      campoDestino: command.campoDestino ?? null,
      transformacaoResumo: command.transformacaoResumo ?? null,
      pipelineNome: command.pipelineNome ?? null,
      ativo: command.ativo,
    }

    return this.repo.createLineage(tenantId, input)
  }
}
