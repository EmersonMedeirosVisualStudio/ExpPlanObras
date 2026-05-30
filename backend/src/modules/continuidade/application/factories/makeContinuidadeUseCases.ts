import { PrismaContinuidadeRepository } from '@/modules/continuidade/infrastructure/persistence/PrismaContinuidadeRepository.js'
import { ListBcpPlanosUseCase } from '@/modules/continuidade/application/use-cases/queries/ListBcpPlanos.js'
import { GetBcpPlanoByIdUseCase } from '@/modules/continuidade/application/use-cases/queries/GetBcpPlanoById.js'
import { CreateBcpPlanoUseCase } from '@/modules/continuidade/application/use-cases/commands/CreateBcpPlano.js'
import { ListDrExecucoesUseCase } from '@/modules/continuidade/application/use-cases/queries/ListDrExecucoes.js'
import { CreateDrExecucaoUseCase } from '@/modules/continuidade/application/use-cases/commands/CreateDrExecucao.js'
import { ApproveDrExecucaoUseCase } from '@/modules/continuidade/application/use-cases/commands/ApproveDrExecucao.js'
import { ConcludeDrExecucaoUseCase } from '@/modules/continuidade/application/use-cases/commands/ConcludeDrExecucao.js'
import { ListCrisesUseCase } from '@/modules/continuidade/application/use-cases/queries/ListCrises.js'
import { CreateCriseRegistroUseCase } from '@/modules/continuidade/application/use-cases/commands/CreateCriseRegistro.js'

export function makeContinuidadeUseCases() {
  const repo = new PrismaContinuidadeRepository()

  return {
    // BcpPlano
    listBcpPlanos: new ListBcpPlanosUseCase(repo),
    getBcpPlanoById: new GetBcpPlanoByIdUseCase(repo),
    createBcpPlano: new CreateBcpPlanoUseCase(repo),

    // DrExecucaoRecuperacao
    listDrExecucoes: new ListDrExecucoesUseCase(repo),
    createDrExecucao: new CreateDrExecucaoUseCase(repo),
    approveDrExecucao: new ApproveDrExecucaoUseCase(repo),
    concludeDrExecucao: new ConcludeDrExecucaoUseCase(repo),

    // CriseRegistro
    listCrises: new ListCrisesUseCase(repo),
    createCriseRegistro: new CreateCriseRegistroUseCase(repo),

    // Expose repo for readiness.ts (which uses domain-level helpers)
    repo,
  }
}
