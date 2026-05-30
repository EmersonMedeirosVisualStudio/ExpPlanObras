import type { ITokenSigner } from '@/domain/repositories/ITokenSigner.js'

export class JwtTokenSigner implements ITokenSigner {
  // biome-ignore lint/suspicious/noExplicitAny: fastify-jwt sign overloads are not Record<string,unknown> compatible
  constructor(private readonly jwt: { sign: (payload: any) => string }) {}

  sign(payload: Record<string, unknown>): string {
    return this.jwt.sign(payload)
  }
}
