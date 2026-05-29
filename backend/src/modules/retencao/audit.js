import prisma from '../../plugins/prisma.js';
export async function auditRetencao(args) {
    await prisma.governancaRetencaoAuditoria.create({
        data: {
            tenantId: args.tenantId,
            recurso: String(args.recurso),
            entidadeId: typeof args.entidadeId === 'number' ? args.entidadeId : null,
            retencaoItemId: typeof args.retencaoItemId === 'number' ? args.retencaoItemId : null,
            tipoEvento: String(args.tipoEvento),
            descricaoEvento: String(args.descricaoEvento),
            userId: typeof args.userId === 'number' ? args.userId : null,
            metadataJson: args.metadataJson ? args.metadataJson : null,
        },
    });
}
