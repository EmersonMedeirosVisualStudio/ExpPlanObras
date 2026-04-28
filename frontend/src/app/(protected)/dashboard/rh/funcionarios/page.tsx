import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { redirect } from 'next/navigation';

export default async function FuncionariosPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);

  const sp = props.searchParams || {};
  const openRaw = Array.isArray(sp.open) ? sp.open[0] : sp.open;
  const openId = Number(openRaw || 0);
  if (Number.isFinite(openId) && openId > 0) {
    redirect(`/dashboard/rh/pessoas/funcionario/${openId}?returnTo=${encodeURIComponent('/dashboard/rh/cadastros')}`);
  }

  redirect('/dashboard/rh/cadastros');
}
