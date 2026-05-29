import prisma from '../../plugins/prisma.js';
export async function auditGovernanca(args) {
    await prisma.governancaDadosAuditoria.create({
        data: {
            tenantId: args.tenantId,
            tipoEvento: String(args.tipoEvento),
            recursoTipo: String(args.recursoTipo),
            recursoId: typeof args.recursoId === 'number' ? args.recursoId : null,
            userId: typeof args.userId === 'number' ? args.userId : null,
            detalhesJson: args.detalhesJson ? args.detalhesJson : null,
            ip: args.ip ? String(args.ip) : null,
            userAgent: args.userAgent ? String(args.userAgent) : null,
        },
    });
}
