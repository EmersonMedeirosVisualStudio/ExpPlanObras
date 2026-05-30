import { AppError } from '@/shared/errors/AppError.js'

export class ObraNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Obra ${id} não encontrada` : 'Obra not found', 404, 'NOT_FOUND')
    this.name = 'ObraNotFoundError'
  }
}

export class ObraAccessDeniedError extends AppError {
  constructor() {
    super('Acesso negado', 403, 'FORBIDDEN')
    this.name = 'ObraAccessDeniedError'
  }
}

export class ContratoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Contrato ${id} não encontrado` : 'Contrato não encontrado', 404, 'NOT_FOUND')
    this.name = 'ContratoNotFoundError'
  }
}

export class EnderecoNotFoundError extends AppError {
  constructor() {
    super('Endereço não encontrado', 404, 'NOT_FOUND')
    this.name = 'EnderecoNotFoundError'
  }
}
