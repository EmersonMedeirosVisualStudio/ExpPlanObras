import { PrismaContinuidadeRepository } from '@/infra/database/repositories/PrismaContinuidadeRepository.js'
import { ListBcpPlanosUseCase } from '@/application/use-cases/continuidade/queries/ListBcpPlanos.js'
import { GetBcpPlanoByIdUseCase } from '@/application/use-cases/continuidade/queries/GetBcpPlanoById.js'
import { CreateBcpPlanoUseCase } from '@/application/use-cases/continuidade/commands/CreateBcpPlano.js'
import { ListDrExecucoesUseCase } from '@/application/use-cases/continuidade/queries/ListDrExecucoes.js'
import { CreateDrExecucaoUseCase } from '@/application/use-cases/continuidade/commands/CreateDrExecucao.js'
import { ApproveDrExecucaoUseCase } from '@/application/use-cases/continuidade/commands/ApproveDrExecucao.js'
import { ConcludeDrExecucaoUseCase } from '@/application/use-cases/continuidade/commands/ConcludeDrExecucao.js'
import { ListCrisesUseCase } from '@/application/use-cases/continuidade/queries/ListCrises.js'
import { CreateCriseRegistroUseCase } from '@/application/use-cases/continuidade/commands/CreateCriseRegistro.js'

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
