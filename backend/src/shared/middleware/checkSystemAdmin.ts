import type { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '@/plugins/prisma.js'

export async function checkSystemAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
    const { userId } = request.user as { userId: number }
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isSystemAdmin) {
      reply.code(403).send({ message: 'Acesso restrito: administrador do sistema necessário' })
    }
  } catch {
    reply.code(401).send({ message: 'Não autenticado' })
  }
}
