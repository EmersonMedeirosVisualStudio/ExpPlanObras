import prisma from '@/infra/database/prisma/client.js'
import type {
  CreateDocumentoInput,
  CreateVersaoInput,
  DocumentoRow,
  IDocumentosRepository,
  ListDocumentosFilter,
  ObraIdRow,
  TenantUserRow,
  UpdateDocumentoInput,
  UpdateDocumentoVersaoAtualInput,
  UpdateVersaoInput,
  VersaoRow,
  VersaoWithDocumento,
} from '@/domain/repositories/IDocumentosRepository.js'

export class PrismaDocumentosRepository implements IDocumentosRepository {
  async findManyDocumentos(filter: ListDocumentosFilter): Promise<DocumentoRow[]> {
    const { tenantId, entidadeTipo, entidadeId, categoriaPrefix, incluirObrasDoContrato, limit = 200 } = filter
    const take = Math.min(500, Math.max(1, limit))

    const whereBase: Record<string, unknown> = { tenantId }
    if (categoriaPrefix) whereBase.categoriaDocumento = { startsWith: categoriaPrefix }

    let where: Record<string, unknown> = whereBase
    if (entidadeTipo === 'OBRA' && entidadeId) {
      where = { ...whereBase, obraId: entidadeId }
    } else if (entidadeTipo === 'CONTRATO' && entidadeId) {
      if (incluirObrasDoContrato) {
        const obras = await prisma.obra.findMany({
          where: { tenantId, contratoId: entidadeId },
          select: { id: true },
          take: 5000,
        })
        const ids = obras.map((o) => o.id)
        where = {
          ...whereBase,
          OR: [{ contratoId: entidadeId }, ...(ids.length ? [{ obraId: { in: ids } }] : [])],
        }
      } else {
        where = { ...whereBase, contratoId: entidadeId }
      }
    }

    return prisma.documento.findMany({
      where,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
      take,
    }) as Promise<DocumentoRow[]>
  }

  async createDocumento(input: CreateDocumentoInput): Promise<{ id: number }> {
    return prisma.documento.create({
      data: input as never,
      select: { id: true },
    })
  }

  async findUniqueDocumento(id: number): Promise<DocumentoRow | null> {
    return prisma.documento.findUnique({ where: { id } }) as Promise<DocumentoRow | null>
  }

  async updateDocumento(id: number, data: UpdateDocumentoInput): Promise<void> {
    await prisma.documento.update({ where: { id }, data: data as never })
  }

  async findManyVersoes(tenantId: number, documentoId: number): Promise<VersaoRow[]> {
    return prisma.documentoVersao.findMany({
      where: { tenantId, documentoId },
      orderBy: [{ numeroVersao: 'desc' }, { id: 'desc' }],
      take: 200,
    }) as Promise<VersaoRow[]>
  }

  async findFirstVersao(tenantId: number, documentoId: number): Promise<{ numeroVersao: number } | null> {
    return prisma.documentoVersao.findFirst({
      where: { tenantId, documentoId },
      orderBy: [{ numeroVersao: 'desc' }, { id: 'desc' }],
      select: { numeroVersao: true },
    })
  }

  async findUniqueVersao(id: number): Promise<VersaoRow | null> {
    return prisma.documentoVersao.findUnique({ where: { id } }) as Promise<VersaoRow | null>
  }

  async findUniqueVersaoWithDocumento(id: number): Promise<VersaoWithDocumento | null> {
    return prisma.documentoVersao.findUnique({
      where: { id },
      include: { documento: true },
    }) as Promise<VersaoWithDocumento | null>
  }

  async findFirstVersaoByToken(token: string): Promise<VersaoWithDocumento | null> {
    return prisma.documentoVersao.findFirst({
      where: { verificacaoToken: token },
      include: { documento: true },
      orderBy: { id: 'desc' },
    }) as Promise<VersaoWithDocumento | null>
  }

  async createVersao(input: CreateVersaoInput): Promise<{ id: number }> {
    return prisma.documentoVersao.create({
      data: input as never,
      select: { id: true },
    })
  }

  async updateVersao(id: number, data: UpdateVersaoInput): Promise<void> {
    await prisma.documentoVersao.update({ where: { id }, data: data as never })
  }

  async findObrasByContrato(tenantId: number, contratoId: number): Promise<ObraIdRow[]> {
    return prisma.obra.findMany({
      where: { tenantId, contratoId },
      select: { id: true },
      take: 5000,
    })
  }

  async findTenantUser(tenantId: number, userId: number): Promise<TenantUserRow | null> {
    return prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    })
  }

  async updateVersaoAndDocumentoTx(
    versaoId: number,
    versaoData: UpdateVersaoInput,
    documentoId: number,
    documentoData: UpdateDocumentoVersaoAtualInput,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.documentoVersao.update({ where: { id: versaoId }, data: versaoData as never }),
      prisma.documento.update({ where: { id: documentoId }, data: documentoData as never }),
    ])
  }
}
