import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../plugins/prisma.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
}

export async function checkSystemAdmin(request: FastifyRequest, reply: FastifyReply) {
    try {
        await request.jwtVerify();
        const { userId } = request.user;
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user || !user.isSystemAdmin) {
            reply.code(403).send({ message: 'Forbidden: System Admin access required' });
            return;
        }
    } catch (err) {
        reply.send(err);
    }
}
