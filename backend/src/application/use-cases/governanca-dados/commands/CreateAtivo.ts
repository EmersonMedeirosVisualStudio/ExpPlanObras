import type { IGovernancaDadosRepository, CreateAtivoInput } from '@/domain/repositories/IGovernancaDadosRepository.js'

export interface CreateAtivoCommand {
  codigoAtivo: string
  nomeAtivo: string
  tipoAtivo: string
  dominioCodigo?: string | null
  classificacaoGlobal: string
  criticidadeNegocio: string
  schemaNome?: string | null
  objetoNome?: string | null
  datasetKey?: string | null
  origemSistema?: string | null
}

export class CreateAtivoUseCase {
  constructor(private readonly repo: IGovernancaDadosRepository) {}

  async execute(tenantId: number, command: CreateAtivoCommand) {
    let dominioId: number | null = null
    if (command.dominioCodigo) {
      const dom = await this.repo.findDominioByCode(tenantId, command.dominioCodigo.toUpperCase())
      dominioId = dom?.id ?? null
    }

    const input: CreateAtivoInput = {
      codigoAtivo: command.codigoAtivo,
      nomeAtivo: command.nomeAtivo,
      tipoAtivo: command.tipoAtivo,
      dominioId,
      classificacaoGlobal: command.classificacaoGlobal,
      criticidadeNegocio: command.criticidadeNegocio,
      schemaNome: command.schemaNome ?? null,
      objetoNome: command.objetoNome ?? null,
      datasetKey: command.datasetKey ?? null,
      origemSistema: command.origemSistema ?? null,
    }

    return this.repo.createAtivo(tenantId, input)
  }
}
