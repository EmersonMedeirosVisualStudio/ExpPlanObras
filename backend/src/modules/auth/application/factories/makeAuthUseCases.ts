import prisma from '@/shared/plugins/prisma.js'
import { ChangePasswordUseCase } from '@/modules/auth/application/use-cases/ChangePassword.js'
import { LoginUseCase } from '@/modules/auth/application/use-cases/Login.js'
import { RegisterUseCase } from '@/modules/auth/application/use-cases/Register.js'
import { SelectTenantUseCase } from '@/modules/auth/application/use-cases/SelectTenant.js'
import type { ITokenSigner } from '@/modules/auth/domain/ports/ITokenSigner.js'
import { PrismaTenantRepository } from '@/modules/auth/infrastructure/persistence/PrismaTenantRepository.js'
import { PrismaUserRepository } from '@/modules/auth/infrastructure/persistence/PrismaUserRepository.js'

async function resolveSessionAccess(
  userId: number,
  tenantId: number,
  tenantRole: string,
): Promise<{ perfis: string[]; permissoes: string[]; abrangencia: unknown }> {
  const perfilRows = await prisma.usuarioPerfil.findMany({
    where: { userId, ativo: true },
    include: {
      perfil: {
        select: {
          codigo: true,
          ativo: true,
          tenantId: true,
          tenantScope: true,
          permissoes: { where: { permitido: true }, select: { modulo: true, janela: true, acao: true } },
        },
      },
    },
  })

  const perfis = new Set<string>()
  const permissoes = new Set<string>()

  for (const row of perfilRows) {
    const p = row.perfil as Record<string, unknown>
    if (!p || p.ativo === false) continue
    const scope = String(p.tenantScope || '').toUpperCase()
    const isBase = scope === 'BASE' || scope === 'GLOBAL'
    const isTenant = Number(p.tenantId || 0) === tenantId
    if (!isBase && !isTenant) continue
    if (String(p.codigo || '').trim()) perfis.add(String(p.codigo).trim().toUpperCase())
    for (const perm of (p.permissoes as Array<{ janela: string }>) ?? []) {
      const code = String(perm?.janela || '').trim().toLowerCase()
      if (code) permissoes.add(code)
    }
  }

  const ROLE_PROFILES: Record<string, string[]> = {
    ADMIN: ['REPRESENTANTE_EMPRESA'], REPRESENTANTE: ['REPRESENTANTE_EMPRESA'], CEO: ['CEO'],
    DIRETOR: ['DIRETOR'], ENGENHEIRO: ['ENGENHEIRO'], MESTRE_OBRA: ['MESTRE_OBRA'],
  }
  if (perfis.size === 0) {
    for (const code of ROLE_PROFILES[tenantRole.toUpperCase()] ?? ['DIRETOR']) perfis.add(code)
  }

  const abrangenciaRows = await prisma.usuarioAbrangencia.findMany({ where: { userId, ativo: true } })
  const obras = new Set<number>()
  const unidades = new Set<number>()
  let empresa = false

  for (const a of abrangenciaRows as Array<{ tipoAbrangencia: string; obraId: number | null; unidadeId: number | null }>) {
    const tipo = String(a.tipoAbrangencia || '').toUpperCase()
    if (tipo === 'EMPRESA') { empresa = true; continue }
    if (tipo === 'OBRA' && typeof a.obraId === 'number') obras.add(a.obraId)
    if (tipo === 'UNIDADE' && typeof a.unidadeId === 'number') unidades.add(a.unidadeId)
  }

  if (!empresa && obras.size === 0 && unidades.size === 0) empresa = true

  const isAdmin = perfis.has('REPRESENTANTE_EMPRESA') || tenantRole.toUpperCase() === 'ADMIN'
  if (isAdmin) {
    empresa = true; obras.clear(); unidades.clear(); permissoes.clear(); permissoes.add('*')
  }

  return {
    perfis: Array.from(perfis),
    permissoes: Array.from(permissoes),
    abrangencia: { empresa, obras: Array.from(obras), unidades: Array.from(unidades) },
  }
}

export function makeAuthUseCases(tokenSigner: ITokenSigner) {
  const userRepo = new PrismaUserRepository()
  const tenantRepo = new PrismaTenantRepository()
  return {
    login: new LoginUseCase(userRepo, tenantRepo, resolveSessionAccess, tokenSigner),
    selectTenant: new SelectTenantUseCase(userRepo, tenantRepo, resolveSessionAccess, tokenSigner),
    changePassword: new ChangePasswordUseCase(userRepo),
    register: new RegisterUseCase(),
    userRepo,
  }
}
