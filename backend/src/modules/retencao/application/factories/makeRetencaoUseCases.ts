import { PrismaRetencaoRepository } from '@/modules/retencao/infrastructure/persistence/PrismaRetencaoRepository.js'

import { ListPoliticasUseCase } from '@/modules/retencao/application/use-cases/queries/ListPoliticas.js'
import { GetPoliticaByIdUseCase } from '@/modules/retencao/application/use-cases/queries/GetPoliticaById.js'
import { CreatePoliticaUseCase } from '@/modules/retencao/application/use-cases/commands/CreatePolitica.js'
import { UpdatePoliticaUseCase } from '@/modules/retencao/application/use-cases/commands/UpdatePolitica.js'

import { ListRetencaoItemsUseCase } from '@/modules/retencao/application/use-cases/queries/ListRetencaoItems.js'

import { ListLegalHoldsUseCase } from '@/modules/retencao/application/use-cases/queries/ListLegalHolds.js'
import { GetLegalHoldByIdUseCase } from '@/modules/retencao/application/use-cases/queries/GetLegalHoldById.js'
import { CreateLegalHoldUseCase } from '@/modules/retencao/application/use-cases/commands/CreateLegalHold.js'

import { ListDescarteLotesUseCase } from '@/modules/retencao/application/use-cases/queries/ListDescarteLotes.js'
import { GetDescarteLoteByIdUseCase } from '@/modules/retencao/application/use-cases/queries/GetDescarteLoteById.js'

import { ListAuditoriaUseCase } from '@/modules/retencao/application/use-cases/queries/ListAuditoria.js'

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
