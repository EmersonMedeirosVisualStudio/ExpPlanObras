import type { IDocumentosRepository, ListDocumentosFilter } from '@/domain/repositories/IDocumentosRepository.js'

export class ListDocumentosUseCase {
  constructor(private readonly repo: IDocumentosRepository) {}

  async execute(filter: ListDocumentosFilter) {
    return this.repo.findManyDocumentos(filter)
  }
}
