import { cookies } from 'next/headers';
import type { Permission, ProfileCode } from './permissions';

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
    return JSON.parse(decodeURIComponent(session.value)) as CurrentUser;
  } catch {
    return null;
  }
}
