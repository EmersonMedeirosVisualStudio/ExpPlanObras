import type { IGovernancaDadosRepository, CreateGlossarioInput } from '@/modules/governanca-dados/domain/ports/IGovernancaDadosRepository.js'

export interface CreateGlossarioCommand {
  termo: string
  definicao: string
  formulaNegocio?: string | null
  exemplosJson?: unknown
  dominioCodigo?: string | null
  ownerUserId?: number | null
  ativo: boolean
}

export class CreateGlossarioEntryUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, command: CreateGlossarioCommand) {
    let dominioId: number | null = null
    if (command.dominioCodigo) {
      const dom = await this.repo.findDominioByCode(tenantId, command.dominioCodigo.toUpperCase())
      dominioId = dom?.id ?? null
    }

    const input: CreateGlossarioInput = {
      termo: command.termo,
      definicao: command.definicao,
      formulaNegocio: command.formulaNegocio ?? null,
      exemplosJson: command.exemplosJson,
      dominioId,
      ownerUserId: command.ownerUserId ?? null,
      ativo: command.ativo,
    }

    return this.repo.createGlossario(tenantId, input)
  }
}
