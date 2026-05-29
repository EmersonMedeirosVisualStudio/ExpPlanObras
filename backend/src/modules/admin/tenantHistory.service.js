import prisma from '../../plugins/prisma.js';
export async function addTenantHistoryEntry(db, input) {
    const entry = await db.tenantHistoryEntry.create({
        data: {
            tenantId: input.tenantId,
            source: input.source,
            action: input.action == null ? null : String(input.action),
            message: input.message,
            actorUserId: input.actorUserId ?? null,
        },
    });
    const urls = (input.attachmentUrls || []).map((u) => String(u || '').trim()).filter((u) => u.length > 0);
    if (urls.length > 0) {
        await db.tenantHistoryAttachment.createMany({
            data: urls.map((url) => ({ entryId: entry.id, url })),
        });
    }
    return entry;
}
export async function listTenantHistory(tenantId) {
    return prisma.tenantHistoryEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { attachments: true, actorUser: { select: { id: true, name: true, email: true } } },
    });
}
