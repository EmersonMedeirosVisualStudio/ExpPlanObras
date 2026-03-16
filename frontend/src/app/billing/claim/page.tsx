'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const params = useSearchParams();
  const cnpj = useMemo(() => normalizeCnpj(params.get('cnpj') || ''), [params]);
  const email = useMemo(() => String(params.get('email') || '').trim(), [params]);
  const plan = useMemo(() => String(params.get('plan') || 'ANNUAL').trim().toUpperCase(), [params]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validPlan = plan === 'ANNUAL' || plan === 'BIENNIAL' ? plan : 'ANNUAL';
  const [selectedPlan, setSelectedPlan] = useState<'ANNUAL' | 'BIENNIAL'>(validPlan);

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm border space-y-4">
        <div className="text-xl font-bold text-gray-900">Regularizar assinatura</div>
        <div className="text-sm text-gray-700">
          Ao continuar, você será redirecionado para o MercadoPago para iniciar/regularizar a assinatura.
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
          onClick={() => start()}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Ir para MercadoPago
        </button>
      </div>
    </div>
  );
}
