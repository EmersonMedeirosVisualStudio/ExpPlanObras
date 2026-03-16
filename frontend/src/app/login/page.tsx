
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: string,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        }
      ) => number;
      reset: (widgetId?: number) => void;
    };
  }
}

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
  const [addressError, setAddressError] = useState('');
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
  const [companyWhatsapp, setCompanyWhatsapp] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [link, setLink] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cep, setCep] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [coordSource, setCoordSource] = useState<'MAPS' | 'CEP' | 'MANUAL' | ''>('');
  const [addressEditedAfterMaps, setAddressEditedAfterMaps] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [stateSuggestions, setStateSuggestions] = useState<string[]>([]);
  const [cepCandidates, setCepCandidates] = useState<string[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const addressSnapshotRef = useRef<{ street: string; number: string; neighborhood: string; city: string; state: string; cep: string } | null>(null);
  const UF_LIST = useRef([
    'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
  ]).current;
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaWidgetIdRef = useRef<number | null>(null);
  const captchaLoadedRef = useRef(false);
  const hcaptchaSitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY;

  const inputClass =
    'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border text-black placeholder:text-black placeholder:opacity-50';
  const label = (text: string, required?: boolean) => (
    <label className="block text-sm font-medium text-black">
      {text}
      {required ? <span className="text-red-600"> *</span> : null}
    </label>
  );

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

  useEffect(() => {
    if (!hcaptchaSitekey) return;
    if (isLogin) {
      setCaptchaToken('');
      if (window.hcaptcha && captchaWidgetIdRef.current !== null) {
        try {
          window.hcaptcha.reset(captchaWidgetIdRef.current);
        } catch {
        }
      }
      return;
    }

    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if (captchaLoadedRef.current) return resolve();
        const existing = document.querySelector('script[src^="https://hcaptcha.com/1/api.js"]');
        if (existing) {
          captchaLoadedRef.current = true;
          return resolve();
        }
        const script = document.createElement('script');
        script.src = 'https://hcaptcha.com/1/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          captchaLoadedRef.current = true;
          resolve();
        };
        document.body.appendChild(script);
      });

    ensureScript().then(() => {
      const el = document.getElementById('hcaptcha-container');
      if (!el) return;
      if (!window.hcaptcha) return;
      if (captchaWidgetIdRef.current !== null) return;
      try {
        captchaWidgetIdRef.current = window.hcaptcha.render('hcaptcha-container', {
          sitekey: hcaptchaSitekey,
          callback: (token: string) => setCaptchaToken(String(token || '')),
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
      } catch {
      }
    });
  }, [hcaptchaSitekey, isLogin]);

  useEffect(() => {
    if (isLogin) return;
    const uf = String(state || '').toUpperCase();
    if (uf.length !== 2 || !UF_LIST.includes(uf)) {
      setCityOptions([]);
      return;
    }
    api
      .get(`/api/geo/ibge/municipios?uf=${encodeURIComponent(uf)}`)
      .then((res) => {
        const list = Array.isArray(res.data) ? (res.data as string[]) : [];
        setCityOptions(list);
        if (city.trim().length > 0 && !list.includes(city.trim())) {
          setCity('');
          setAddressError('Cidade não pertence ao estado informado. Selecione uma cidade da lista.');
        }
      })
      .catch(() => {
        setCityOptions([]);
      });
  }, [UF_LIST, api, city, isLogin, state]);

  useEffect(() => {
    if (isLogin) return;
    if (state.trim().length > 0) {
      setStateSuggestions([]);
      return;
    }
    const q = city.trim();
    if (q.length < 3) {
      setStateSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .get(`/api/geo/ibge/search-city?name=${encodeURIComponent(q)}`)
        .then((res) => {
          const list = Array.isArray(res.data) ? (res.data as Array<{ city: string; uf: string }>) : [];
          const ufs = Array.from(new Set(list.filter((x) => x.city.toLowerCase() === q.toLowerCase()).map((x) => x.uf)))
            .filter((x) => x.length === 2)
            .sort((a, b) => a.localeCompare(b));
          setStateSuggestions(ufs);
        })
        .catch(() => setStateSuggestions([]));
    }, 400);
    return () => window.clearTimeout(t);
  }, [api, city, isLogin, state]);

  useEffect(() => {
    if (isLogin) return;
    if (coordSource !== 'MAPS') {
      setAddressEditedAfterMaps(false);
      return;
    }
    const snap = addressSnapshotRef.current;
    if (!snap) return;
    const edited =
      snap.street !== street ||
      snap.number !== number ||
      snap.neighborhood !== neighborhood ||
      snap.city !== city ||
      snap.state !== state ||
      snap.cep !== cep;
    setAddressEditedAfterMaps(edited);
  }, [city, coordSource, cep, isLogin, neighborhood, number, state, street]);

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

  const openLocation = () => {
    const lat = Number(String(latitude || '').replace(',', '.'));
    const lon = Number(String(longitude || '').replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setAddressError('Latitude/Longitude inválidas.');
      return;
    }
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank', 'noopener,noreferrer');
  };

  const resolveByMapsLink = async () => {
    const v = String(link || '').trim();
    if (v.length < 10) {
      setAddressError('Informe um link do Google Maps.');
      return;
    }
    setAddressError('');
    setMapsLoading(true);
    try {
      const res = await api.post('/api/geo/maps/resolve', { link: v });
      const data = res.data as {
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        cep?: string;
        latitude?: string;
        longitude?: string;
      };
      if (data.street) setStreet(data.street);
      if (data.number) setNumber(data.number);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setState(String(data.state).toUpperCase().slice(0, 2));
      if (data.cep) setCep(formatCep(String(data.cep)));
      if (data.latitude) setLatitude(String(data.latitude));
      if (data.longitude) setLongitude(String(data.longitude));
      setCoordSource('MAPS');
      addressSnapshotRef.current = {
        street: data.street || street,
        number: data.number || number,
        neighborhood: data.neighborhood || neighborhood,
        city: data.city || city,
        state: data.state ? String(data.state).toUpperCase().slice(0, 2) : state,
        cep: data.cep ? formatCep(String(data.cep)) : cep,
      };
      setAddressEditedAfterMaps(false);
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar a localização');
    } finally {
      setMapsLoading(false);
    }
  };

  const resolveAddressByCep = async () => {
    const clean = String(cep || '').replace(/\D/g, '');
    if (clean.length !== 8) {
      setAddressError('CEP inválido. Informe 8 dígitos.');
      return;
    }
    setAddressError('');
    setCepLoading(true);
    try {
      const res = await api.post('/api/geo/cep/resolve', { cep: clean });
      const data = res.data as { street?: string; neighborhood?: string; city?: string; state?: string; cep?: string };
      if (data.street) setStreet(data.street);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setState(String(data.state).toUpperCase().slice(0, 2));
      if (data.cep) setCep(formatCep(String(data.cep)));

      if (coordSource !== 'MAPS' && (latitude.trim().length === 0 || longitude.trim().length === 0)) {
        const q = `${data.street || street}, ${number || ''}, ${data.neighborhood || neighborhood}, ${data.city || city} - ${data.state || state}, ${data.cep || clean}`;
        const geo = await api.post('/api/geo/geocode', { query: q }).catch(() => null);
        const lat = geo?.data?.latitude ? String(geo.data.latitude) : '';
        const lon = geo?.data?.longitude ? String(geo.data.longitude) : '';
        if (lat && lon) {
          setLatitude(lat);
          setLongitude(lon);
          setCoordSource('CEP');
        }
      }
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar o CEP');
    } finally {
      setCepLoading(false);
    }
  };

  const searchCepByAddress = async () => {
    const uf = state.trim().toUpperCase();
    const c = city.trim();
    const s = street.trim();
    if (uf.length !== 2 || !UF_LIST.includes(uf)) {
      setAddressError('Informe um estado (UF) válido.');
      return;
    }
    if (c.length < 2 || s.length < 2) {
      setAddressError('Informe rua e cidade para buscar o CEP.');
      return;
    }
    setAddressError('');
    setCepLoading(true);
    try {
      const res = await api.get(
        `/api/geo/cep/search?uf=${encodeURIComponent(uf)}&city=${encodeURIComponent(c)}&street=${encodeURIComponent(s)}`
      );
      const list = Array.isArray(res.data) ? (res.data as string[]) : [];
      setCepCandidates(list);
      if (list.length === 1) {
        setCep(formatCep(list[0]));
      } else if (list.length === 0) {
        setAddressError('CEP não encontrado para este endereço.');
      }
    } catch (err: unknown) {
      setAddressError(getApiErrorMessage(err) || 'Não foi possível buscar o CEP');
    } finally {
      setCepLoading(false);
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
        if (hcaptchaSitekey && captchaToken.trim().length === 0) {
          setError('Confirme o captcha para continuar.');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Senha deve ter no mínimo 8 caracteres.');
          setLoading(false);
          return;
        }
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
          setError('Senha deve conter pelo menos 1 letra e 1 número.');
          setLoading(false);
          return;
        }
        // Register
        await api.post('/api/auth/register', {
          email,
          cpf: cpf.replace(/\D/g, ''),
          password,
          name,
          tenantName,
          tenantSlug: tenantSlug.trim().length > 0 ? tenantSlug.trim() : undefined,
          cnpj: cnpj.replace(/\D/g, ''),
          companyEmail,
          companyWhatsapp: companyWhatsapp.replace(/\D/g, '').length > 0 ? companyWhatsapp : undefined,
          link,
          street,
          number,
          neighborhood,
          city,
          state,
          cep: cep.replace(/\D/g, ''),
          latitude: latitude.length > 0 ? latitude : undefined,
          longitude: longitude.length > 0 ? longitude : undefined,
          captchaToken: captchaToken.length > 0 ? captchaToken : undefined,
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
          {!isLogin && (
            <>
              <div className="text-xs text-gray-700">Campos com * são obrigatórios.</div>
              <fieldset className="border rounded-md p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold text-black">Dados da Empresa</legend>
                <div>
                  {label('Nome da Empresa', true)}
                  <input name="tenantName" type="text" required className={inputClass} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label('Slug (URL)')}
                    <input name="tenantSlug" type="text" className={inputClass} placeholder="minha-empresa" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
                  </div>
                  <div>
                    {label('CNPJ', true)}
                    <input name="cnpj" type="text" required className={inputClass} placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(formatCnpj(e.target.value))} />
                  </div>
                </div>
                <div>
                  {label('E-mail da Empresa', true)}
                  <input name="companyEmail" type="email" required className={inputClass} placeholder="contato@empresa.com.br" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
                </div>
              </fieldset>

              <fieldset className="border rounded-md p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold text-black">Endereço da Empresa</legend>
                <div>
                  {label('Link Google Maps')}
                  <input name="link" type="text" className={inputClass} placeholder="Cole aqui o link do Google Maps" value={link} onChange={(e) => setLink(e.target.value)} />
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={resolveByMapsLink} disabled={mapsLoading || String(link || '').trim().length < 10} className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                      {mapsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Buscar localização
                    </button>
                  </div>
                  {coordSource === 'MAPS' && (
                    <div className="mt-2 text-xs text-gray-700">Coordenadas obtidas a partir do link do Google Maps.</div>
                  )}
                  {addressEditedAfterMaps && (
                    <div className="mt-2 text-xs text-gray-700">
                      Você alterou o endereço após usar o link. As coordenadas podem não corresponder exatamente. Use “Buscar localização” para atualizar.
                    </div>
                  )}
                </div>

                <div>
                  {label('Rua / Logradouro', true)}
                  <input name="street" type="text" required className={inputClass} value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label('Número', true)}
                    <input name="number" type="text" required className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
                  </div>
                  <div>
                    {label('Bairro', true)}
                    <input name="neighborhood" type="text" required className={inputClass} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label('Cidade', true)}
                    <input list="city-options" name="city" type="text" required className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
                    <datalist id="city-options">
                      {cityOptions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    {label('Estado (UF)', true)}
                    <input list="uf-options" name="state" type="text" required className={inputClass} placeholder="SP" value={state} onChange={(e) => setState(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} />
                    <datalist id="uf-options">
                      {UF_LIST.map((uf) => (
                        <option key={uf} value={uf} />
                      ))}
                    </datalist>
                    {stateSuggestions.length > 0 && (
                      <div className="mt-2 text-xs text-gray-700">
                        Estados com esta cidade: {stateSuggestions.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label('CEP', true)}
                    <input name="cep" type="text" required className={inputClass} placeholder="00000-000" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} />
                    {cepCandidates.length > 1 && (
                      <select className={`${inputClass} mt-2`} value={cep.replace(/\\D/g, '')} onChange={(e) => setCep(formatCep(e.target.value))}>
                        <option value="">Selecione um CEP</option>
                        {cepCandidates.map((c) => (
                          <option key={c} value={c}>
                            {formatCep(c)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    {label('WhatsApp / Tel da Empresa')}
                    <input name="companyWhatsapp" type="text" className={inputClass} placeholder="(00) 00000-0000" value={companyWhatsapp} onChange={(e) => setCompanyWhatsapp(formatWhatsapp(e.target.value))} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button type="button" onClick={resolveAddressByCep} disabled={cepLoading || String(cep || '').replace(/\\D/g, '').length !== 8} className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2">
                    {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Busca Endereço por CEP
                  </button>
                  <button type="button" onClick={searchCepByAddress} disabled={cepLoading} className="px-4 py-2 border rounded text-black hover:bg-gray-50 disabled:opacity-50">
                    Buscar CEP (por endereço)
                  </button>
                </div>
              </fieldset>

              <fieldset className="border rounded-md p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold text-black">Localização</legend>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    {label('Latitude')}
                    <input name="latitude" type="text" className={inputClass} value={latitude} onChange={(e) => { setLatitude(e.target.value); setCoordSource('MANUAL'); }} />
                  </div>
                  <div>
                    {label('Longitude')}
                    <input name="longitude" type="text" className={inputClass} value={longitude} onChange={(e) => { setLongitude(e.target.value); setCoordSource('MANUAL'); }} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={openLocation} className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800">
                    Localização informada
                  </button>
                </div>
                {coordSource === 'MAPS' && (
                  <div className="text-xs text-gray-700">Coordenadas obtidas a partir do link do Google Maps.</div>
                )}
                {coordSource === 'CEP' && (
                  <div className="text-xs text-gray-700">Coordenadas obtidas a partir do CEP/endereço.</div>
                )}
                {coordSource === 'MANUAL' && (
                  <div className="text-xs text-gray-700">Coordenadas informadas manualmente.</div>
                )}
              </fieldset>

              <fieldset className="border rounded-md p-4 space-y-3">
                <legend className="px-2 text-sm font-semibold text-black">Dados do Representante</legend>
                <div>
                  {label('Nome do Representante', true)}
                  <input name="name" type="text" required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  {label('CPF do Representante', true)}
                  <input name="cpf" type="text" required className={inputClass} placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
                </div>
                <div>
                  {label('E-mail do Representante (login)', true)}
                  <input name="email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  {label('Senha', true)}
                  <input id="password" name="password" type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {hcaptchaSitekey && (
                  <div className="pt-2">
                    <div id="hcaptcha-container" />
                  </div>
                )}
              </fieldset>
            </>
          )}

          {isLogin && (
            <div className="space-y-3">
              <div>
                {label('Email', true)}
                <input name="email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                {label('Senha', true)}
                <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>
          )}
          {!isLogin && addressError && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{addressError}</div>
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
