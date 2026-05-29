import type { FastifyReply } from 'fastify'
import { AppError } from '@/shared/errors/AppError.js'

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  TOO_MANY_REQUESTS: 429,
  UNPROCESSABLE: 422,
}

export function replyError(reply: FastifyReply, err: unknown): ReturnType<FastifyReply['send']> {
  if (err instanceof AppError) {
    const status = err.code ? (STATUS_MAP[err.code] ?? err.statusCode) : err.statusCode
    return reply.code(status).send({ message: err.message })
  }
  throw err
}
