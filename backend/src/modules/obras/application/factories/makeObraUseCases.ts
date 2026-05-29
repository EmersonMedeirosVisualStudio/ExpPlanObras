import { PrismaObraRepository } from '../../infrastructure/persistence/PrismaObraRepository.js'
import { CreateObraUseCase } from '../use-cases/CreateObra.js'
import { DeleteObraUseCase } from '../use-cases/DeleteObra.js'
import { GetObraByIdUseCase } from '../use-cases/GetObraById.js'
import { ListObrasUseCase } from '../use-cases/ListObras.js'
import { UpdateObraUseCase } from '../use-cases/UpdateObra.js'

export function makeObraUseCases() {
  const repo = new PrismaObraRepository()
  return {
    create: new CreateObraUseCase(repo),
    update: new UpdateObraUseCase(repo),
    delete: new DeleteObraUseCase(repo),
    getById: new GetObraByIdUseCase(repo),
    list: new ListObrasUseCase(repo),
    repo,
  }
}
