import { verifyMercadoPagoSignature, syncTenantFromPreapproval } from '../billing/billing.service.js';
export default async function mercadoPagoWebhooks(server) {
    server.post('/mercadopago', async (request, reply) => {
        const headers = request.headers;
        const query = request.query;
        const body = request.body;
        const dataId = (typeof query?.['data.id'] === 'string' && query['data.id']) ||
            (typeof body?.data?.id === 'string' && body.data.id) ||
            (typeof body?.data?.id === 'number' && String(body.data.id)) ||
            (typeof query?.id === 'string' && query.id) ||
            undefined;
        if (!dataId) {
            return reply.code(200).send({ ok: true });
        }
        const verified = verifyMercadoPagoSignature({
            xSignature: headers['x-signature'],
            xRequestId: headers['x-request-id'],
            dataId,
        });
        if (!verified.ok) {
            return reply.code(401).send({ message: 'Invalid signature' });
        }
        await syncTenantFromPreapproval(dataId);
        return reply.code(200).send({ ok: true });
    });
}
