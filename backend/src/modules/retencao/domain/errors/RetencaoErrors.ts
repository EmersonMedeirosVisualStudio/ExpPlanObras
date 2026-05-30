import { AppError } from '@/shared/errors/AppError.js'

export class PoliticaNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Política ${id} não encontrada` : 'Política não encontrada', 404, 'NOT_FOUND')
    this.name = 'PoliticaNotFoundError'
  }
}

export class LegalHoldNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Legal hold ${id} não encontrado` : 'Legal hold não encontrado', 404, 'NOT_FOUND')
    this.name = 'LegalHoldNotFoundError'
  }
}

export class DescarteLoteNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Lote ${id} não encontrado` : 'Lote não encontrado', 404, 'NOT_FOUND')
    this.name = 'DescarteLoteNotFoundError'
  }
}

export class RetencaoForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN')
    this.name = 'RetencaoForbiddenError'
  }
}
