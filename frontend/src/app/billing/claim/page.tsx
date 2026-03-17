'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

function normalizeCnpj(input: string) {
  return String(input || '').replace(/\D+/g, '');
}

function getApiErrorMessage(err: unknown) {
  if (typeof err !== 'object' || !err) return undefined;
  if (!('response' in err)) return undefined;
  const response = (err as { response?: unknown }).response;
  if (typeof response !== 'object' || !response) return undefined;
  if (!('data' in response)) return undefined;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== 'object' || !data) return undefined;
  if (!('message' in data)) return undefined;
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

export default function BillingClaimPage() {
  const router = useRouter();
  const [cnpj, setCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<'ANNUAL' | 'BIENNIAL'>('ANNUAL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [adminAccepted, setAdminAccepted] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const c = normalizeCnpj(params.get('cnpj') || '');
      const e = String(params.get('email') || '').trim();
      const p = String(params.get('plan') || 'ANNUAL').trim().toUpperCase();
      setCnpj(c);
      setEmail(e);
      setSelectedPlan(p === 'BIENNIAL' ? 'BIENNIAL' : 'ANNUAL');
      const rawUser = localStorage.getItem('user');
      if (rawUser) {
        const u = JSON.parse(rawUser) as { isSystemAdmin?: boolean } | null;
        setIsSystemAdmin(Boolean(u?.isSystemAdmin));
      } else {
        setIsSystemAdmin(false);
      }
    } catch {
    }
  }, []);

  const back = () => {
    try {
      if (window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
    }
    router.push('/login');
  };

  const start = async (p?: 'ANNUAL' | 'BIENNIAL') => {
    setError('');
    if (cnpj.length !== 14) {
      setError('CNPJ inválido.');
      return;
    }
    if (!email || !email.includes('@')) {
      setError('E-mail inválido.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/api/billing/checkout-claim', {
        cnpj,
        email,
        plan: p || selectedPlan,
      });
      const initPoint = String(res.data?.initPoint || '');
      if (!initPoint) {
        setError('Não foi possível gerar o link do Mercado Pago.');
        return;
      }
      window.location.href = initPoint;
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'Falha ao iniciar pagamento.');
    } finally {
      setLoading(false);
    }
  };

  const acceptAsAdmin = async () => {
    setError('');
    if (!adminAccepted) {
      setError('Confirme o aceite para continuar.');
      return;
    }
    if (cnpj.length !== 14) {
      setError('CNPJ inválido.');
      return;
    }
    if (!email || !email.includes('@')) {
      setError('E-mail inválido.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/admin/tenants/claim-accept', {
        cnpj,
        email,
        plan: selectedPlan,
      });
      router.push('/admin/tenants');
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'Falha ao regularizar assinatura.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm border space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-bold text-gray-900">Regularizar assinatura</div>
          <button type="button" onClick={back} className="px-3 py-2 border rounded text-gray-800 hover:bg-gray-50">
            Voltar
          </button>
        </div>
        <div className="text-sm text-gray-700">
          {isSystemAdmin
            ? 'Como administrador do sistema, você pode regularizar por aceite (sem MercadoPago).'
            : 'Ao continuar, você será redirecionado para o MercadoPago para iniciar/regularizar a assinatura.'}
        </div>

        <div className="space-y-2 text-sm text-gray-800">
          <div>
            <span className="font-semibold">CNPJ:</span> {cnpj || '-'}
          </div>
          <div>
            <span className="font-semibold">E-mail:</span> {email || '-'}
          </div>
          <div>
            <span className="font-semibold">Plano:</span> {selectedPlan}
          </div>
        </div>

        {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSelectedPlan('ANNUAL')}
            disabled={loading}
            className={`px-4 py-2 border rounded ${selectedPlan === 'ANNUAL' ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-900 hover:bg-gray-50'} disabled:opacity-50`}
          >
            1 ano
          </button>
          <button
            type="button"
            onClick={() => setSelectedPlan('BIENNIAL')}
            disabled={loading}
            className={`px-4 py-2 border rounded ${selectedPlan === 'BIENNIAL' ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-900 hover:bg-gray-50'} disabled:opacity-50`}
          >
            2 anos
          </button>
        </div>

        <button
          type="button"
          onClick={() => (isSystemAdmin ? acceptAsAdmin() : start())}
          disabled={loading || (isSystemAdmin && !adminAccepted)}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSystemAdmin ? 'Aceitar e ativar' : 'Ir para MercadoPago'}
        </button>

        {isSystemAdmin && (
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={adminAccepted} onChange={(e) => setAdminAccepted(e.target.checked)} />
            Confirmo a regularização manual desta assinatura.
          </label>
        )}
      </div>
    </div>
  );
}
