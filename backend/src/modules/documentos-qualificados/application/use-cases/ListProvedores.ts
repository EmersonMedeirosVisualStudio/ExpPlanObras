import type { IDocumentosQualificadosRepository, ProvedorRow } from '@/modules/documentos-qualificados/domain/ports/IDocumentosQualificadosRepository.js'

export class ListProvedoresUseCase {
  constructor(private readonly repo: IDocumentosQualificadosRepository) {}

  async execute(tenantId: number): Promise<ProvedorRow[]> {
    return this.repo.listProvedores(tenantId)
  }
}
