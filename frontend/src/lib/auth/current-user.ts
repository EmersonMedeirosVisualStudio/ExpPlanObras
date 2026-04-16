import { cookies } from 'next/headers';
import type { Permission, ProfileCode } from './permissions';
import { PROFILE_CODES } from './permissions';

export type CurrentUser = {
  id: number;
  tenantId: number;
  idFuncionario?: number | null;
  nome: string;
  email: string;
  perfis: ProfileCode[];
  permissoes: Permission[];
  abrangencia: {
    empresa: boolean;
    diretorias?: number[];
    obras: number[];
    unidades: number[];
  };
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('exp_user');
  if (!session) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(session.value)) as CurrentUser;
    const perfis = Array.isArray(parsed.perfis) ? parsed.perfis : [];
    if (perfis.includes(PROFILE_CODES.REPRESENTANTE_EMPRESA)) {
      const permissoes = Array.isArray(parsed.permissoes) ? parsed.permissoes : [];
      if (!permissoes.includes('*')) parsed.permissoes = [...permissoes, '*'] as Permission[];
      parsed.abrangencia = { ...(parsed.abrangencia || ({} as any)), empresa: true, obras: parsed.abrangencia?.obras ?? [], unidades: parsed.abrangencia?.unidades ?? [] };
    }
    return parsed;
  } catch {
    return null;
  }
}
