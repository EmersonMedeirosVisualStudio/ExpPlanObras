export type QualifiedSignatureProviderType = 'ICP_QUALIFICADA' | 'AVANCADA';

export type QualifiedSignatureProviderEnv = 'SANDBOX' | 'PRODUCAO';

export type ProviderCreateEnvelopeResult = {
  envelopeId: string;
  documentId?: string | null;
  signingUrl?: string | null;
  raw?: unknown;
};

export type ProviderEnvelopeStatusResult = {
  status: string;
  raw?: unknown;
};

export type ProviderDownloadResult = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type QualifiedSignatureProvider = {
  code: string;
  type: QualifiedSignatureProviderType;
  createEnvelope(args: {
    tenantId: number;
    requestId: number;
    callbackUrl: string;
    callbackToken: string;
    document: { fileName: string; mimeType: string; buffer: Buffer };
    signers: Array<{ name: string; email: string; document?: string | null; role: string }>;
    config?: Record<string, unknown> | null;
  }): Promise<ProviderCreateEnvelopeResult>;
  getEnvelopeStatus(args: { tenantId: number; envelopeId: string; config?: Record<string, unknown> | null }): Promise<ProviderEnvelopeStatusResult>;
  downloadSignedDocument(args: { tenantId: number; envelopeId: string; config?: Record<string, unknown> | null }): Promise<ProviderDownloadResult>;
  downloadEvidenceBundle?(args: {
    tenantId: number;
    envelopeId: string;
    config?: Record<string, unknown> | null;
  }): Promise<Array<ProviderDownloadResult & { type: string }>>;
  verifyDocument?(args: { tenantId: number; buffer: Buffer; config?: Record<string, unknown> | null }): Promise<{ valid: boolean; raw?: unknown }>;
};

