
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

type TenantOption = {
  tenantId: number;
  role: string;
  name: string;
  slug: string;
};

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

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [link, setLink] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Multi-tenant selection state
  const [showTenantSelection, setShowTenantSelection] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const authError = localStorage.getItem('auth_error');
    if (authError) {
      localStorage.removeItem('auth_error');
      setError(authError);
    }

    const params = new URLSearchParams(window.location.search);
    const gt = params.get('googleToken');
    const mode = params.get('mode');
    const googleLogin = params.get('googleLogin');
    const emailParam = params.get('email');
    const nameParam = params.get('name');

    if (gt) {
      setGoogleToken(gt);
      if (emailParam) setEmail(emailParam);
      if (nameParam) setName(nameParam);
      if (mode === 'register') setIsLogin(false);
    }

    if (gt && googleLogin === '1') {
      setLoading(true);
      api
        .post('/api/auth/google/login', { googleToken: gt })
        .then((response) => {
          const { token, user } = response.data;

          if (token) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            if (user.isSystemAdmin) {
              router.push('/admin/tenants');
            } else {
              router.push('/dashboard');
            }
          } else if (user.tenants && user.tenants.length > 0) {
            setUserId(user.id);
            setAvailableTenants(user.tenants);
            setShowTenantSelection(true);
          } else {
            setError('Usuário não vinculado a nenhuma empresa.');
          }
        })
        .catch((err: unknown) => {
          setError(getApiErrorMessage(err) || 'Falha no login Google');
        })
        .finally(() => {
          setLoading(false);
        });
    }

    api
      .get('/api/auth/google/status')
      .then((res) => {
        setGoogleEnabled(Boolean(res.data?.enabled));
      })
      .catch(() => {
        setGoogleEnabled(false);
      });
  }, []);

  const handleGoogle = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
    window.location.href = `${apiBase.replace(/\/$/, '')}/api/auth/google/start`;
  };

  const formatCpf = (input: string) => {
    let value = input.replace(/\D/g, '').slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return value;
  };

  const formatCnpj = (input: string) => {
    let value = input.replace(/\D/g, '').slice(0, 14);
    value = value.replace(/^(\d{2})(\d)/, '$1.$2');
    value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
    value = value.replace(/(\d{4})(\d)/, '$1-$2');
    return value;
  };

  const formatCep = (input: string) => {
    let value = input.replace(/\D/g, '').slice(0, 8);
    if (value.length > 5) value = value.replace(/^(\d{5})(\d)/, '$1-$2');
    return value;
  };

  const formatWhatsapp = (input: string) => {
    const digits = input.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  };

  const parseFromLink = (raw: string) => {
    const linkValue = String(raw || '').trim();
    if (!linkValue) return;

    const atMatch = linkValue.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      setLatitude(atMatch[1]);
      setLongitude(atMatch[2]);
    }

    const queryMatch = linkValue.match(/[?&](?:query|q)=([^&]+)/i);
    if (queryMatch) {
      try {
        const decoded = decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')).trim();
        if (decoded.length > 0) {
          const parts = decoded.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
          if (parts.length > 0 && street.length === 0) setStreet(parts[0]);
          const cepMatch = decoded.match(/\b(\d{5})-?(\d{3})\b/);
          if (cepMatch && cep.length === 0) setCep(formatCep(`${cepMatch[1]}${cepMatch[2]}`));
          const ufMatch = decoded.match(/\b([A-Z]{2})\b/);
          if (ufMatch && state.length === 0) setState(ufMatch[1]);
          if (parts.length >= 2 && neighborhood.length === 0) setNeighborhood(parts[1]);
          if (parts.length >= 3 && city.length === 0) setCity(parts[2]);
        }
      } catch {
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const response = await api.post('/api/auth/login', { email, password });
        const { token, user } = response.data;

        if (token) {
            // User has only one tenant, logged in directly
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            if (user.isSystemAdmin) {
                router.push('/admin/tenants');
            } else {
                router.push('/dashboard');
            }
        } else if (user.tenants && user.tenants.length > 0) {
            // Multiple tenants, show selection
            setUserId(user.id);
            setAvailableTenants(user.tenants);
            setShowTenantSelection(true);
        } else {
            setError('Usuário não vinculado a nenhuma empresa.');
        }

      } else {
        // Register
        await api.post('/api/auth/register', {
          email,
          cpf: cpf.replace(/\D/g, ''),
          password,
          name,
          tenantName,
          tenantSlug,
          cnpj: cnpj.replace(/\D/g, ''),
          link,
          street,
          number,
          neighborhood,
          city,
          state,
          cep: cep.replace(/\D/g, ''),
          latitude: latitude.length > 0 ? latitude : undefined,
          longitude: longitude.length > 0 ? longitude : undefined,
          whatsapp,
          googleToken: googleToken || undefined
        });
        
        // Auto login after register
        const response = await api.post('/api/auth/login', { email, password });
        const { token, user } = response.data;
        
        // New users always have 1 tenant initially
        if (token) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            router.push('/dashboard');
        } else {
            // Fallback just in case
            setIsLogin(true);
            setError('Cadastro realizado. Faça login.');
        }
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTenant = async (tenantId: number) => {
    if (!userId) return;
    setLoading(true);
    try {
        const response = await api.post('/api/auth/select-tenant', {
            userId,
            tenantId
        });
        localStorage.setItem('token', response.data.token);
        // We need to fetch full user data again or just store basic info? 
        // For now, let's assume the previous user object is fine, or we update it.
        // But we don't have the full user object here if we only got tenants list.
        // Ideally we should store the user info we got from login.
        
        // Hack: We don't have the user object in scope if we refreshed. 
        // But we have it in state if we just logged in.
        // Let's rely on the token.
        router.push('/dashboard');
    } catch (err: unknown) {
        setError(getApiErrorMessage(err) || 'Falha ao selecionar empresa.');
    } finally {
        setLoading(false);
    }
  };

  if (showTenantSelection) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
            <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
                <div className="flex justify-center mb-6">
                    <img
                      src="/LogoDoSistema.jpg"
                      alt="Logo"
                      className="h-16 w-auto"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/LogoDoSistema2.jpg';
                      }}
                    />
                </div>
                <div className="text-center">
                    <h2 className="text-3xl font-bold tracking-tight text-gray-900">Selecione a Empresa</h2>
                    <p className="mt-2 text-sm text-gray-600">Você possui vínculo com múltiplas empresas.</p>
                </div>
                <div className="mt-8 space-y-4">
                    {availableTenants.map((t) => (
                        <button
                            key={t.tenantId}
                            onClick={() => handleSelectTenant(t.tenantId)}
                            className="w-full flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <div>
                                <p className="font-semibold text-gray-900">{t.name}</p>
                                <p className="text-sm text-gray-500">{t.slug}</p>
                            </div>
                            <span className="text-blue-600 text-sm font-medium">Acessar &rarr;</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div className="flex justify-center mb-6">
            <img
              src="/LogoDoSistema.jpg"
              alt="Logo"
              className="h-20 w-auto"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/LogoDoSistema2.jpg';
              }}
            />
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            {isLogin ? 'Acessar Sistema' : 'Nova Conta'}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Ou{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              {isLogin ? 'criar uma nova conta' : 'entrar em sua conta existente'}
            </button>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="-space-y-px rounded-md shadow-sm space-y-2">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome do Representante</label>
                  <input
                    name="name"
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700">Email do Representante</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome da Empresa</label>
                  <input
                    name="tenantName"
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Slug (URL)</label>
                        <input
                            name="tenantSlug"
                            type="text"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                            placeholder="minha-empresa"
                            value={tenantSlug}
                            onChange={(e) => setTenantSlug(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">CNPJ</label>
                        <input
                            name="cnpj"
                            type="text"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                            placeholder="00.000.000/0000-00"
                            value={cnpj}
                            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                        />
                    </div>
                </div>
              </>
            )}
            
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rua / Logradouro</label>
                  <input
                    name="street"
                    type="text"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Número</label>
                    <input
                      name="number"
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Bairro</label>
                    <input
                      name="neighborhood"
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cidade</label>
                    <input
                      name="city"
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Estado (UF)</label>
                    <input
                      name="state"
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      placeholder="SP"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">CEP</label>
                    <input
                      name="cep"
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => setCep(formatCep(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Whatsapp</label>
                    <input
                      name="whatsapp"
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                      placeholder="(00) 00000-0000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Link (site ou referência)</label>
                  <input
                    name="link"
                    type="text"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={link}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLink(v);
                      parseFromLink(v);
                    }}
                  />
                </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">CPF do Representante</label>
              <input
                id="cpf"
                name="cpf"
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
              />
            </div>
              </>
            )}
            
            {isLogin && (
                 <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? 'Entrar' : 'Cadastrar'}
            </button>
          </div>

          {googleEnabled && (
            <div>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="group relative flex w-full justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Entrar com Google
              </button>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
