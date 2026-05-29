import { AppError } from '@/shared/errors/AppError.js'

export class ContratoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Contrato ${id} não encontrado` : 'Contrato não encontrado', 404, 'NOT_FOUND')
    this.name = 'ContratoNotFoundError'
  }
}

export class ContratoConflictError extends AppError {
  constructor(numero: string) {
    super(`Número de contrato "${numero}" já existe`, 409, 'CONFLICT')
    this.name = 'ContratoConflictError'
  }
}
