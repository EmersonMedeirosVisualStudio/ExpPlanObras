import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: number;
      tenantId: number;
      role: string;
      email: string;
    };
    user: {
      userId: number;
      tenantId: number;
      role: string;
      email: string;
    };
  }
}
