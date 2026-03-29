import prisma from '../../../plugins/prisma.js';
import type { PlaybookActionExecutor } from '../types.js';

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

export const authExecutors: PlaybookActionExecutor[] = [
  {
    type: 'SESSOES_INVALIDAR_USUARIO',
    async execute(input) {
      const userId = Number(input.configuracao?.userId || input.configuracao?.targetUserId || input.executorUserId || 0);
      if (!userId) return { ok: false, error: 'userId ausente' };
      const tu = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: input.tenantId, userId } } }).catch(() => null);
      if (!tu) return { ok: false, error: 'tenantUser não encontrado' };
      const now = new Date();
      await prisma.tenantUser.update({ where: { id: tu.id }, data: { tokenRevokedBefore: now } as any });
      return { ok: true, output: { userId, tokenRevokedBefore: now.toISOString() } };
    },
  },
  {
    type: 'USUARIO_EXIGIR_REAUTENTICACAO',
    async execute(input) {
      const userId = Number(input.configuracao?.userId || input.configuracao?.targetUserId || input.executorUserId || 0);
      if (!userId) return { ok: false, error: 'userId ausente' };
      const tu = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: input.tenantId, userId } } }).catch(() => null);
      if (!tu) return { ok: false, error: 'tenantUser não encontrado' };
      const now = new Date();
      await prisma.tenantUser.update({ where: { id: tu.id }, data: { tokenRevokedBefore: now } as any });
      return { ok: true, output: { userId, tokenRevokedBefore: now.toISOString() } };
    },
  },
  {
    type: 'TOKEN_REVOGAR',
    async execute(input) {
      const userId = Number(input.configuracao?.userId || input.configuracao?.targetUserId || input.executorUserId || 0);
      if (!userId) return { ok: false, error: 'userId ausente' };
      const tu = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: input.tenantId, userId } } }).catch(() => null);
      if (!tu) return { ok: false, error: 'tenantUser não encontrado' };
      const now = new Date();
      await prisma.tenantUser.update({ where: { id: tu.id }, data: { tokenRevokedBefore: now } as any });
      return { ok: true, output: { userId, tokenRevokedBefore: now.toISOString() } };
    },
  },
  {
    type: 'USUARIO_BLOQUEAR_TEMPORARIAMENTE',
    async execute(input) {
      const userId = Number(input.configuracao?.userId || input.configuracao?.targetUserId || input.executorUserId || 0);
      if (!userId) return { ok: false, error: 'userId ausente' };
      const minutes = Number(input.configuracao?.duracaoMinutos || 60);
      const tu = await prisma.tenantUser.findUnique({ where: { tenantId_userId: { tenantId: input.tenantId, userId } } }).catch(() => null);
      if (!tu) return { ok: false, error: 'tenantUser não encontrado' };
      const now = new Date();
      const until = addMinutes(now, Math.max(1, Math.min(minutes, 24 * 60)));
      await prisma.tenantUser.update({ where: { id: tu.id }, data: { bloqueado: true, bloqueadoAteEm: until, tokenRevokedBefore: now } as any });
      return { ok: true, output: { userId, bloqueadoAteEm: until.toISOString(), tokenRevokedBefore: now.toISOString() } };
    },
  },
];

