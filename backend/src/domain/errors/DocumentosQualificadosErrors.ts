import { AppError } from '@/shared/errors/AppError.js'

export class DocumentoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Document ${id} not found` : 'Document not found', 404, 'NOT_FOUND')
    this.name = 'DocumentoNotFoundError'
  }
}

export class DocumentoVersaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Document version ${id} not found` : 'Document version not found', 404, 'NOT_FOUND')
    this.name = 'DocumentoVersaoNotFoundError'
  }
}

export class ProvedorNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Signature provider ${id} not found` : 'Signature provider not found', 404, 'NOT_FOUND')
    this.name = 'ProvedorNotFoundError'
  }
}

export class SolicitacaoNotFoundError extends AppError {
  constructor(id?: number) {
    super(id ? `Signature request ${id} not found` : 'Signature request not found', 404, 'NOT_FOUND')
    this.name = 'SolicitacaoNotFoundError'
  }
}

export class ArtefatoNotFoundError extends AppError {
  constructor() {
    super('Signed PDF artifact not found', 404, 'NOT_FOUND')
    this.name = 'ArtefatoNotFoundError'
  }
}

export class SolicitacaoInvalidStatusError extends AppError {
  constructor(status: string) {
    super(`Signature request cannot be sent in status: ${status}`, 409, 'CONFLICT')
    this.name = 'SolicitacaoInvalidStatusError'
  }
}

export class SolicitacaoMissingCallbackTokenError extends AppError {
  constructor() {
    super('Signature request is missing callbackToken', 400, 'UNPROCESSABLE')
    this.name = 'SolicitacaoMissingCallbackTokenError'
  }
}

export class SolicitacaoMissingEnvelopeIdError extends AppError {
  constructor() {
    super('Signature request has no envelopeId', 400, 'UNPROCESSABLE')
    this.name = 'SolicitacaoMissingEnvelopeIdError'
  }
}

export class ProviderNotSupportedError extends AppError {
  constructor(code: string) {
    super(`Provider not supported for code: ${code}`, 501, 'UNPROCESSABLE')
    this.name = 'ProviderNotSupportedError'
  }
}

export class SecretsKeyNotConfiguredError extends AppError {
  constructor() {
    super('APP_SECRETS_KEY not configured. Set it to store provider secrets.', 501, 'UNPROCESSABLE')
    this.name = 'SecretsKeyNotConfiguredError'
  }
}

export class SecretEncryptionError extends AppError {
  constructor() {
    super('Failed to encrypt provider secrets.', 500, 'UNPROCESSABLE')
    this.name = 'SecretEncryptionError'
  }
}

export class DocumentDownloadError extends AppError {
  constructor() {
    super('Failed to download the original document', 502, 'UNPROCESSABLE')
    this.name = 'DocumentDownloadError'
  }
}

export class PublicApiUrlNotConfiguredError extends AppError {
  constructor() {
    super('PUBLIC_API_URL not configured to receive provider callbacks', 501, 'UNPROCESSABLE')
    this.name = 'PublicApiUrlNotConfiguredError'
  }
}

export class InvalidExpiraEmError extends AppError {
  constructor() {
    super('expiraEm is invalid', 400, 'UNPROCESSABLE')
    this.name = 'InvalidExpiraEmError'
  }
}

export class AccessDeniedError extends AppError {
  constructor() {
    super('Access denied', 403, 'FORBIDDEN')
    this.name = 'AccessDeniedError'
  }
}

export class TenantNotSelectedError extends AppError {
  constructor() {
    super('Tenant not selected', 403, 'FORBIDDEN')
    this.name = 'TenantNotSelectedError'
  }
}
