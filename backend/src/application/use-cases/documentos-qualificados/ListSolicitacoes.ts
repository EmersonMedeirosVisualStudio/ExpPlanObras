import type {
  IDocumentosQualificadosRepository,
  ListSolicitacoesFilter,
  SolicitacaoRow,
} from '@/domain/repositories/IDocumentosQualificadosRepository.js'

export interface ListSolicitacoesResult {
  rows: SolicitacaoRow[]
  total: number
}

export class ListSolicitacoesUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number, filter: ListSolicitacoesFilter): Promise<ListSolicitacoesResult> {
    return this.repo.listSolicitacoes(tenantId, filter)
  }
}
