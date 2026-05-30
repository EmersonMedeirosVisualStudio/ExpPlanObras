import { PrismaRetencaoRepository } from '@/infra/database/repositories/PrismaRetencaoRepository.js'

import { ListPoliticasUseCase } from '@/application/use-cases/retencao/queries/ListPoliticas.js'
import { GetPoliticaByIdUseCase } from '@/application/use-cases/retencao/queries/GetPoliticaById.js'
import { CreatePoliticaUseCase } from '@/application/use-cases/retencao/commands/CreatePolitica.js'
import { UpdatePoliticaUseCase } from '@/application/use-cases/retencao/commands/UpdatePolitica.js'

import { ListRetencaoItemsUseCase } from '@/application/use-cases/retencao/queries/ListRetencaoItems.js'

import { ListLegalHoldsUseCase } from '@/application/use-cases/retencao/queries/ListLegalHolds.js'
import { GetLegalHoldByIdUseCase } from '@/application/use-cases/retencao/queries/GetLegalHoldById.js'
import { CreateLegalHoldUseCase } from '@/application/use-cases/retencao/commands/CreateLegalHold.js'

import { ListDescarteLotesUseCase } from '@/application/use-cases/retencao/queries/ListDescarteLotes.js'
import { GetDescarteLoteByIdUseCase } from '@/application/use-cases/retencao/queries/GetDescarteLoteById.js'

import { ListAuditoriaUseCase } from '@/application/use-cases/retencao/queries/ListAuditoria.js'

export function makeRetencaoUseCases() {
  const repo = new PrismaRetencaoRepository()

  return {
    repo,

    // Politica
    listPoliticas: new ListPoliticasUseCase(repo),
    getPoliticaById: new GetPoliticaByIdUseCase(repo),
    createPolitica: new CreatePoliticaUseCase(repo),
    updatePolitica: new UpdatePoliticaUseCase(repo),

    // Inventory
    listRetencaoItems: new ListRetencaoItemsUseCase(repo),

    // Legal hold
    listLegalHolds: new ListLegalHoldsUseCase(repo),
    getLegalHoldById: new GetLegalHoldByIdUseCase(repo),
    createLegalHold: new CreateLegalHoldUseCase(repo),

    // Descarte
    listDescarteLotes: new ListDescarteLotesUseCase(repo),
    getDescarteLoteById: new GetDescarteLoteByIdUseCase(repo),

    // Auditoria
    listAuditoria: new ListAuditoriaUseCase(repo),
  }
}
