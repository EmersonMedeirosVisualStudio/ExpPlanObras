import prisma from '../../plugins/prisma.js';

export type RetentionResourceHandler = {
  resource: string;
  resolveBaseDate: (tenantId: number, entityId: number) => Promise<Date | null>;
  resolveCategory?: (tenantId: number, entityId: number) => Promise<string | null>;
  resolveStorageRefs?: (tenantId: number, entityId: number) => Promise<{ path?: string | null; hash?: string | null; sizeBytes?: number | null }>;
  archiveCold?: (tenantId: number, entityId: number) => Promise<void>;
  anonymize?: (tenantId: number, entityId: number, fields?: string[]) => Promise<void>;
  deleteSoft?: (tenantId: number, entityId: number) => Promise<void>;
  deleteHard?: (tenantId: number, entityId: number) => Promise<void>;
};

const handlers: RetentionResourceHandler[] = [
  {
    resource: 'DOCUMENTO',
    resolveBaseDate: async (tenantId, entityId) => {
      const d = await prisma.documento.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!d || d.tenantId !== tenantId) return null;
      return d.uploadedAt;
    },
    resolveStorageRefs: async (tenantId, entityId) => {
      const d = await prisma.documento.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!d || d.tenantId !== tenantId) return {};
      return { path: d.url, hash: null, sizeBytes: null };
    },
    archiveCold: async () => {},
    deleteSoft: async () => {},
    deleteHard: async () => {},
  },
  {
    resource: 'DOCUMENTO_VERSAO',
    resolveBaseDate: async (tenantId, entityId) => {
      const v = await prisma.documentoVersao.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!v || v.tenantId !== tenantId) return null;
      return v.createdAt;
    },
    resolveStorageRefs: async (tenantId, entityId) => {
      const v = await prisma.documentoVersao.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!v || v.tenantId !== tenantId) return {};
      return { path: v.urlAssinado || v.urlOriginal, hash: v.hashSha256Assinado || v.hashSha256Original, sizeBytes: null };
    },
    archiveCold: async () => {},
    deleteSoft: async () => {},
    deleteHard: async () => {},
  },
  {
    resource: 'ASSINATURA_ARTEFATO',
    resolveBaseDate: async (tenantId, entityId) => {
      const a = await prisma.documentoAssinaturaArtefato.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!a || a.tenantId !== tenantId) return null;
      return a.createdAt;
    },
    resolveStorageRefs: async (tenantId, entityId) => {
      const a = await prisma.documentoAssinaturaArtefato.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!a || a.tenantId !== tenantId) return {};
      return { path: a.storagePath || a.url, hash: a.hashSha256, sizeBytes: a.tamanhoBytes ?? null };
    },
    deleteHard: async (tenantId, entityId) => {
      const a = await prisma.documentoAssinaturaArtefato.findUnique({ where: { id: entityId } }).catch(() => null);
      if (!a || a.tenantId !== tenantId) return;
      await prisma.documentoAssinaturaArtefato.update({
        where: { id: entityId },
        data: { data: null, storagePath: null, url: null, metadataJson: { ...(a.metadataJson as any), expurgado: true } as any },
      });
    },
  },
];

export function getRetentionHandler(resource: string): RetentionResourceHandler | null {
  const r = String(resource || '').trim().toUpperCase();
  return handlers.find((h) => h.resource === r) || null;
}

export function listRetentionResources() {
  return handlers.map((h) => h.resource);
}

