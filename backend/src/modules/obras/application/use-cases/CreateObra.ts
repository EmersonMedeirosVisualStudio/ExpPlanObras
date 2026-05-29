import type { IObraRepository } from '../../domain/ports/IObraRepository.js'
import { ObraAccessDeniedError } from '../../domain/errors/ObraErrors.js'
import type { CreateObraDto } from '../dtos/createObraDto.js'

export class CreateObraUseCase {
  constructor(private readonly repo: IObraRepository) {}

  async execute(tenantId: number, input: CreateObraDto) {
    return this.repo.create(tenantId, input)
  }
}
