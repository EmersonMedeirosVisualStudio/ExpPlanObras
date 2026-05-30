import { AppError } from '@/shared/errors/AppError.js'

export class AtivoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Ativo ${id} não encontrado` : 'Ativo não encontrado', 404, 'NOT_FOUND')
    this.name = 'AtivoNotFoundError'
  }
}

export class PiiScanNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Scan ${id} não encontrado` : 'Scan não encontrado', 404, 'NOT_FOUND')
    this.name = 'PiiScanNotFoundError'
  }
}

export class QualidadeRegraNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Regra ${id} não encontrada` : 'Regra não encontrada', 404, 'NOT_FOUND')
    this.name = 'QualidadeRegraNotFoundError'
  }
}

export class GovernancaForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN')
    this.name = 'GovernancaForbiddenError'
  }
}
