import { AppError } from '@/shared/errors/AppError.js'

export class DocumentoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Documento ${id} não encontrado` : 'Documento não encontrado', 404, 'NOT_FOUND')
    this.name = 'DocumentoNotFoundError'
  }
}

export class VersaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Versão ${id} não encontrada` : 'Versão não encontrada', 404, 'NOT_FOUND')
    this.name = 'VersaoNotFoundError'
  }
}

export class DocumentoForbiddenError extends AppError {
  constructor() {
    super('Acesso negado ao documento', 403, 'FORBIDDEN')
    this.name = 'DocumentoForbiddenError'
  }
}

export class VersaoArquivoIndisponivel extends AppError {
  constructor() {
    super('Arquivo indisponível', 404, 'NOT_FOUND')
    this.name = 'VersaoArquivoIndisponivel'
  }
}

export class VersaoTokenInvalidoError extends AppError {
  constructor() {
    super('Token inválido', 404, 'NOT_FOUND')
    this.name = 'VersaoTokenInvalidoError'
  }
}
