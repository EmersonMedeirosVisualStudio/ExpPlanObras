import crypto from 'crypto';
import type { QualifiedSignatureProvider } from './types.js';

function fakePdfSigned() {
  const body = '%PDF-1.4\n% Mock Signed PDF\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n';
  return Buffer.from(body, 'utf8');
}

export const MockQualifiedSignatureProvider: QualifiedSignatureProvider = {
  code: 'MOCK',
  type: 'ICP_QUALIFICADA',
  async createEnvelope() {
    const envelopeId = crypto.randomUUID();
    return {
      envelopeId,
      documentId: `doc_${envelopeId}`,
      signingUrl: `https://example.com/sign/${encodeURIComponent(envelopeId)}`,
      raw: { mock: true },
    };
  },
  async getEnvelopeStatus() {
    return { status: 'AGUARDANDO_ASSINATURA', raw: { mock: true } };
  },
  async downloadSignedDocument() {
    return { fileName: 'documento-assinado.pdf', mimeType: 'application/pdf', buffer: fakePdfSigned() };
  },
  async verifyDocument() {
    return { valid: true, raw: { mock: true } };
  },
};

