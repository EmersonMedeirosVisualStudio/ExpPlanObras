import prisma from '../../../../shared/plugins/prisma.js';
import { PrismaTenantRepository } from '../../infrastructure/persistence/PrismaTenantRepository.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/PrismaUserRepository.js';
import { ChangePasswordUseCase } from '../use-cases/ChangePassword.js';
import { LoginUseCase } from '../use-cases/Login.js';
import { RegisterUseCase } from '../use-cases/Register.js';
import { SelectTenantUseCase } from '../use-cases/SelectTenant.js';
async function resolveSessionAccess(userId, tenantId, tenantRole) {
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
    });
    const perfis = new Set();
    const permissoes = new Set();
    for (const row of perfilRows) {
        const p = row.perfil;
        if (!p || p.ativo === false)
            continue;
        const scope = String(p.tenantScope || '').toUpperCase();
        const isBase = scope === 'BASE' || scope === 'GLOBAL';
        const isTenant = Number(p.tenantId || 0) === tenantId;
        if (!isBase && !isTenant)
            continue;
        if (String(p.codigo || '').trim())
            perfis.add(String(p.codigo).trim().toUpperCase());
        for (const perm of p.permissoes ?? []) {
            const code = String(perm?.janela || '').trim().toLowerCase();
            if (code)
                permissoes.add(code);
        }
    }
    const ROLE_PROFILES = {
        ADMIN: ['REPRESENTANTE_EMPRESA'], REPRESENTANTE: ['REPRESENTANTE_EMPRESA'], CEO: ['CEO'],
        DIRETOR: ['DIRETOR'], ENGENHEIRO: ['ENGENHEIRO'], MESTRE_OBRA: ['MESTRE_OBRA'],
    };
    if (perfis.size === 0) {
        for (const code of ROLE_PROFILES[tenantRole.toUpperCase()] ?? ['DIRETOR'])
            perfis.add(code);
    }
    const abrangenciaRows = await prisma.usuarioAbrangencia.findMany({ where: { userId, ativo: true } });
    const obras = new Set();
    const unidades = new Set();
    let empresa = false;
    for (const a of abrangenciaRows) {
        const tipo = String(a.tipoAbrangencia || '').toUpperCase();
        if (tipo === 'EMPRESA') {
            empresa = true;
            continue;
        }
        if (tipo === 'OBRA' && typeof a.obraId === 'number')
            obras.add(a.obraId);
        if (tipo === 'UNIDADE' && typeof a.unidadeId === 'number')
            unidades.add(a.unidadeId);
    }
    if (!empresa && obras.size === 0 && unidades.size === 0)
        empresa = true;
    const isAdmin = perfis.has('REPRESENTANTE_EMPRESA') || tenantRole.toUpperCase() === 'ADMIN';
    if (isAdmin) {
        empresa = true;
        obras.clear();
        unidades.clear();
        permissoes.clear();
        permissoes.add('*');
    }
    return {
        perfis: Array.from(perfis),
        permissoes: Array.from(permissoes),
        abrangencia: { empresa, obras: Array.from(obras), unidades: Array.from(unidades) },
    };
}
export function makeAuthUseCases() {
    const userRepo = new PrismaUserRepository();
    const tenantRepo = new PrismaTenantRepository();
    return {
        login: new LoginUseCase(userRepo, tenantRepo, resolveSessionAccess),
        selectTenant: new SelectTenantUseCase(userRepo, tenantRepo, resolveSessionAccess),
        changePassword: new ChangePasswordUseCase(userRepo),
        register: new RegisterUseCase(),
    };
}
