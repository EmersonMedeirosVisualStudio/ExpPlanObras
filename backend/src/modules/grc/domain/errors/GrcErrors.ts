import { AppError } from '@/shared/errors/AppError.js'

export class GrcRiscoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Risco ${id} não encontrado` : 'Risco não encontrado', 404, 'NOT_FOUND')
    this.name = 'GrcRiscoNotFoundError'
  }
}

export class GrcControleNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Controle ${id} não encontrado` : 'Controle não encontrado', 404, 'NOT_FOUND')
    this.name = 'GrcControleNotFoundError'
  }
}

export class GrcAuditoriaNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Auditoria ${id} não encontrada` : 'Auditoria não encontrada', 404, 'NOT_FOUND')
    this.name = 'GrcAuditoriaNotFoundError'
  }
}

export class GrcAchadoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Achado ${id} não encontrado` : 'Achado não encontrado', 404, 'NOT_FOUND')
    this.name = 'GrcAchadoNotFoundError'
  }
}

export class GrcPlanoAcaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Plano de ação ${id} não encontrado` : 'Plano de ação não encontrado', 404, 'NOT_FOUND')
    this.name = 'GrcPlanoAcaoNotFoundError'
  }
}

export class GrcForbiddenError extends AppError {
  constructor() {
    super('Acesso negado', 403, 'FORBIDDEN')
    this.name = 'GrcForbiddenError'
  }
}

export class GrcUnauthorizedError extends AppError {
  constructor() {
    super('Não autenticado', 401, 'UNAUTHORIZED')
    this.name = 'GrcUnauthorizedError'
  }
}
