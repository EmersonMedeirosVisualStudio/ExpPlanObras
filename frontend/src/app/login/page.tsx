
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { PERMISSIONS, PROFILE_CODES, type Permission, type ProfileCode } from '@/lib/auth/permissions';

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

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  const encoded = encodeURIComponent(value);
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encoded}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function permissionsForProfile(profile: ProfileCode): Permission[] {
  if (profile === PROFILE_CODES.CEO) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_CEO_VIEW,
      PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW,
      PERMISSIONS.DASHBOARD_DIRETOR_VIEW,
      PERMISSIONS.DASHBOARD_GERENTE_VIEW,
      PERMISSIONS.DASHBOARD_RH_VIEW,
      PERMISSIONS.SST_PAINEL_VIEW,
      PERMISSIONS.SST_PAINEL_EXECUTIVO_VIEW,
      PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW,
      PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW,
      PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW,
      PERMISSIONS.DASHBOARD_USUARIO_PERSONALIZAR,
      PERMISSIONS.DASHBOARD_EXPORTAR,
      PERMISSIONS.EXPORT_CSV,
      PERMISSIONS.WORKFLOWS_VIEW,
      PERMISSIONS.WORKFLOWS_EXECUTAR,
      PERMISSIONS.WORKFLOWS_ASSINAR,
      PERMISSIONS.WORKFLOWS_MODELOS_VIEW,
      PERMISSIONS.WORKFLOWS_AUDITORIA,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.DOCUMENTOS_ASSINAR,
      PERMISSIONS.DOCUMENTOS_VERIFICAR,
      PERMISSIONS.DOCUMENTOS_MODELOS_VIEW,
      PERMISSIONS.DOCUMENTOS_AUDITORIA,
      PERMISSIONS.APROVACOES_VIEW,
      PERMISSIONS.APROVACOES_DECIDIR,
      PERMISSIONS.APROVACOES_ASSINAR,
      PERMISSIONS.APROVACOES_MODELOS_VIEW,
      PERMISSIONS.APROVACOES_AUDITORIA,
      PERMISSIONS.OBRAS_VIEW,
      PERMISSIONS.MAPA_OBRAS_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_VIEW,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.RH_HORAS_EXTRAS_VIEW,
      PERMISSIONS.SST_EPI_VIEW,
      PERMISSIONS.SST_CHECKLISTS_VIEW,
      PERMISSIONS.SST_NC_VIEW,
      PERMISSIONS.SST_TREINAMENTOS_VIEW,
      PERMISSIONS.SST_ACIDENTES_VIEW,
      PERMISSIONS.ORGANOGRAMA_VIEW,
      PERMISSIONS.CONFIG_EMPRESA_VIEW,
      PERMISSIONS.REPRESENTANTE_VIEW,
      PERMISSIONS.ENCARREGADO_SISTEMA_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.REPRESENTANTE_EMPRESA) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.OBRAS_VIEW,
      PERMISSIONS.MAPA_OBRAS_VIEW,
      PERMISSIONS.DASHBOARD_RH_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_VIEW,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.CONFIG_EMPRESA_VIEW,
      PERMISSIONS.CONFIG_EMPRESA_EDIT,
      PERMISSIONS.REPRESENTANTE_VIEW,
      PERMISSIONS.REPRESENTANTE_EDIT,
      PERMISSIONS.ENCARREGADO_SISTEMA_VIEW,
      PERMISSIONS.ENCARREGADO_SISTEMA_EDIT,
    ];
  }
  if (profile === PROFILE_CODES.ENCARREGADO_SISTEMA_EMPRESA) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.GOVERNANCA_VIEW,
      PERMISSIONS.GOVERNANCA_USUARIOS_CRUD,
      PERMISSIONS.GOVERNANCA_PERFIS_CRUD,
      PERMISSIONS.GOVERNANCA_ABRANGENCIA_CRUD,
      PERMISSIONS.BACKUP_VIEW,
      PERMISSIONS.BACKUP_EDIT,
      PERMISSIONS.BACKUP_RESTORE_REQUEST,
      PERMISSIONS.AUTOMACOES_VIEW,
      PERMISSIONS.AUTOMACOES_CRUD,
      PERMISSIONS.APROVACOES_MODELOS_VIEW,
      PERMISSIONS.APROVACOES_MODELOS_CRUD,
      PERMISSIONS.WORKFLOWS_MODELOS_VIEW,
      PERMISSIONS.WORKFLOWS_MODELOS_CRUD,
      PERMISSIONS.WORKFLOWS_DESIGNER_VIEW,
      PERMISSIONS.WORKFLOWS_DESIGNER_CRUD,
      PERMISSIONS.PWA_CONFIGURAR,
      PERMISSIONS.PUSH_NOTIFICACOES_ADMIN,
      PERMISSIONS.SYNC_OFFLINE_AUDITORIA_VIEW,
      PERMISSIONS.SYNC_OFFLINE_REPROCESSAR,
      PERMISSIONS.NOTIFICACOES_VIEW,
      PERMISSIONS.NOTIFICACOES_EMAIL_FILA_VIEW,
      PERMISSIONS.NOTIFICACOES_TEMPLATES_ADMIN,
    ];
  }
  if (profile === PROFILE_CODES.DIRETOR) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW,
      PERMISSIONS.DASHBOARD_DIRETOR_VIEW,
      PERMISSIONS.DASHBOARD_USUARIO_PERSONALIZAR,
      PERMISSIONS.WORKFLOWS_VIEW,
      PERMISSIONS.WORKFLOWS_EXECUTAR,
      PERMISSIONS.WORKFLOWS_ASSINAR,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.DOCUMENTOS_ASSINAR,
      PERMISSIONS.DOCUMENTOS_VERIFICAR,
      PERMISSIONS.APROVACOES_VIEW,
      PERMISSIONS.APROVACOES_DECIDIR,
      PERMISSIONS.APROVACOES_ASSINAR,
      PERMISSIONS.OBRAS_VIEW,
      PERMISSIONS.MAPA_OBRAS_VIEW,
      PERMISSIONS.ORGANOGRAMA_VIEW,
      PERMISSIONS.SST_PAINEL_VIEW,
      PERMISSIONS.SST_PAINEL_EXECUTIVO_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.DIRETOR_ADMINISTRATIVO) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_DIRETOR_VIEW,
      PERMISSIONS.DASHBOARD_RH_VIEW,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.DOCUMENTOS_CRUD,
      PERMISSIONS.DOCUMENTOS_ASSINAR,
      PERMISSIONS.DOCUMENTOS_VERIFICAR,
      PERMISSIONS.RH_FUNCIONARIOS_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_CRUD,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.RH_PRESENCAS_CRUD,
      PERMISSIONS.RH_HORAS_EXTRAS_VIEW,
      PERMISSIONS.RH_HORAS_EXTRAS_CRUD,
      PERMISSIONS.ORGANOGRAMA_VIEW,
      PERMISSIONS.RELATORIOS_AGENDADOS_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.DIRETOR_FINANCEIRO) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_DIRETOR_VIEW,
      PERMISSIONS.DASHBOARD_EXECUTIVO_VIEW,
      PERMISSIONS.DASHBOARD_EXPORTAR,
      PERMISSIONS.EXPORT_CSV,
      PERMISSIONS.APROVACOES_VIEW,
      PERMISSIONS.APROVACOES_DECIDIR,
      PERMISSIONS.RELATORIOS_AGENDADOS_VIEW,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.DOCUMENTOS_VERIFICAR,
      PERMISSIONS.OBRAS_VIEW,
      PERMISSIONS.MAPA_OBRAS_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.ENGENHEIRO) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW,
      PERMISSIONS.OBRAS_VIEW,
      PERMISSIONS.MAPA_OBRAS_VIEW,
      PERMISSIONS.WORKFLOWS_VIEW,
      PERMISSIONS.WORKFLOWS_EXECUTAR,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.DOCUMENTOS_CRUD,
      PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW,
      PERMISSIONS.PORTAL_GESTOR_VIEW,
      PERMISSIONS.PORTAL_GESTOR_OPERAR,
    ];
  }
  if (profile === PROFILE_CODES.MESTRE_OBRA) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PORTAL_GESTOR_VIEW,
      PERMISSIONS.PORTAL_GESTOR_OPERAR,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.RH_PRESENCAS_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.ENCARREGADO_OBRA) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PORTAL_GESTOR_VIEW,
      PERMISSIONS.PORTAL_GESTOR_OPERAR,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.RH_PRESENCAS_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.APONTADOR) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.RH_PRESENCAS_CRUD,
      PERMISSIONS.PORTAL_GESTOR_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.ALMOXARIFE) {
    return [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW, PERMISSIONS.DOCUMENTOS_VIEW];
  }
  if (profile === PROFILE_CODES.FISCAL_OBRA) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.DASHBOARD_FISCALIZACAO_VIEW,
      PERMISSIONS.FISCALIZACAO_DIARIO_VIEW,
      PERMISSIONS.FISCALIZACAO_CALENDARIO_VIEW,
      PERMISSIONS.FISCALIZACAO_MEDICOES_VIEW,
      PERMISSIONS.DOCUMENTOS_VIEW,
      PERMISSIONS.SST_NC_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.TST) {
    return permissionsForProfile(PROFILE_CODES.SST_TECNICO);
  }
  if (profile === PROFILE_CODES.GERENTE_RH) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_ENDOSSAR,
      PERMISSIONS.RH_HORAS_EXTRAS_VIEW,
      PERMISSIONS.RH_HORAS_EXTRAS_PROCESSAR,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.RH_PRESENCAS_RECEBER,
      PERMISSIONS.RH_ASSINATURAS_EXECUTAR,
      PERMISSIONS.SST_PAINEL_VIEW,
      PERMISSIONS.SST_EPI_VIEW,
      PERMISSIONS.SST_CHECKLISTS_VIEW,
      PERMISSIONS.SST_NC_VIEW,
      PERMISSIONS.ORGANOGRAMA_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.ADMIN_RH) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_VIEW,
      PERMISSIONS.RH_FUNCIONARIOS_CRUD,
      PERMISSIONS.RH_FUNCIONARIOS_ENDOSSAR,
      PERMISSIONS.RH_HORAS_EXTRAS_VIEW,
      PERMISSIONS.RH_HORAS_EXTRAS_CRUD,
      PERMISSIONS.RH_HORAS_EXTRAS_PROCESSAR,
      PERMISSIONS.RH_PRESENCAS_VIEW,
      PERMISSIONS.RH_PRESENCAS_CRUD,
      PERMISSIONS.RH_PRESENCAS_FECHAR,
      PERMISSIONS.RH_PRESENCAS_ENVIAR,
      PERMISSIONS.RH_PRESENCAS_RECEBER,
      PERMISSIONS.RH_ASSINATURAS_EXECUTAR,
      PERMISSIONS.SST_PAINEL_VIEW,
      PERMISSIONS.SST_EPI_VIEW,
      PERMISSIONS.SST_CHECKLISTS_VIEW,
      PERMISSIONS.SST_NC_VIEW,
      PERMISSIONS.ORGANOGRAMA_VIEW,
    ];
  }
  if (profile === PROFILE_CODES.SST_TECNICO) {
    return [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.SST_PAINEL_VIEW,
      PERMISSIONS.SST_EPI_VIEW,
      PERMISSIONS.SST_EPI_CRUD,
      PERMISSIONS.SST_EPI_ENTREGA,
      PERMISSIONS.SST_EPI_DEVOLUCAO,
      PERMISSIONS.SST_EPI_INSPECAO,
      PERMISSIONS.SST_EPI_ASSINAR,
      PERMISSIONS.SST_TECNICOS_VIEW,
      PERMISSIONS.SST_TECNICOS_CRUD,
      PERMISSIONS.SST_CHECKLISTS_VIEW,
      PERMISSIONS.SST_CHECKLISTS_CRUD,
      PERMISSIONS.SST_CHECKLISTS_EXECUTAR,
      PERMISSIONS.SST_CHECKLISTS_FINALIZAR,
      PERMISSIONS.SST_CHECKLISTS_ASSINAR,
      PERMISSIONS.SST_NC_VIEW,
      PERMISSIONS.SST_NC_CRUD,
      PERMISSIONS.SST_NC_TRATAR,
      PERMISSIONS.SST_NC_VALIDAR,
      PERMISSIONS.SST_NC_ENCERRAR,
      PERMISSIONS.SST_TREINAMENTOS_VIEW,
      PERMISSIONS.SST_TREINAMENTOS_CRUD,
      PERMISSIONS.SST_TREINAMENTOS_EXECUTAR,
      PERMISSIONS.SST_TREINAMENTOS_ASSINAR,
      PERMISSIONS.SST_TREINAMENTOS_FINALIZAR,
      PERMISSIONS.SST_TREINAMENTOS_CERTIFICAR,
      PERMISSIONS.SST_ACIDENTES_VIEW,
      PERMISSIONS.SST_ACIDENTES_CRUD,
      PERMISSIONS.SST_ACIDENTES_INVESTIGAR,
      PERMISSIONS.SST_ACIDENTES_VALIDAR,
      PERMISSIONS.SST_ACIDENTES_ENCERRAR,
      PERMISSIONS.SST_ACIDENTES_CAT,
    ];
  }
  return [PERMISSIONS.DASHBOARD_VIEW];
}

function setAuthSession(input: {
  token: string;
  user: unknown;
  subscriptionAlert?: string | null;
  tenantId?: number;
}) {
  localStorage.setItem('token', input.token);
  localStorage.setItem('user', JSON.stringify(input.user));
  if (typeof input.subscriptionAlert === 'string' && input.subscriptionAlert.trim().length > 0) {
    localStorage.setItem('subscription_alert', input.subscriptionAlert);
  } else {
    localStorage.removeItem('subscription_alert');
  }

  const userObj = (typeof input.user === 'object' && input.user !== null ? (input.user as Record<string, unknown>) : {}) as Record<string, unknown>;
  const tenantsRaw = userObj['tenants'];
  const firstTenant = Array.isArray(tenantsRaw) && tenantsRaw.length > 0 ? (tenantsRaw[0] as Record<string, unknown>) : null;
  const tenantRole = typeof (firstTenant && firstTenant['role']) === 'string' ? String(firstTenant && firstTenant['role']).toUpperCase() : '';
  const userEmail = String(userObj['email'] || '').toLowerCase();
  const backendProfiles = Array.isArray(userObj['perfis']) ? (userObj['perfis'] as unknown[]).map((v) => String(v).trim().toUpperCase()).filter(Boolean) : [];
  const backendPermissions = Array.isArray(userObj['permissoes']) ? (userObj['permissoes'] as unknown[]).map((v) => String(v).trim()).filter(Boolean) : [];
  const backendScope = typeof userObj['abrangencia'] === 'object' && userObj['abrangencia'] !== null ? (userObj['abrangencia'] as Record<string, unknown>) : null;

  const byTenantRole: Record<string, ProfileCode[]> = {
    ADMIN: [PROFILE_CODES.REPRESENTANTE_EMPRESA],
    REPRESENTANTE: [PROFILE_CODES.REPRESENTANTE_EMPRESA],
    CEO: [PROFILE_CODES.CEO],
    DIRETOR: [PROFILE_CODES.DIRETOR],
    DIRETOR_ADMINISTRATIVO: [PROFILE_CODES.DIRETOR_ADMINISTRATIVO],
    DIRETOR_FINANCEIRO: [PROFILE_CODES.DIRETOR_FINANCEIRO],
    ENCARREGADO_SISTEMA: [PROFILE_CODES.ENCARREGADO_SISTEMA_EMPRESA],
    ENCARREGADO_SISTEMA_EMPRESA: [PROFILE_CODES.ENCARREGADO_SISTEMA_EMPRESA],
    GERENTE_RH: [PROFILE_CODES.GERENTE_RH],
    ADMIN_RH: [PROFILE_CODES.ADMIN_RH],
    SST_TECNICO: [PROFILE_CODES.SST_TECNICO],
    TST: [PROFILE_CODES.TST],
    ENGENHEIRO: [PROFILE_CODES.ENGENHEIRO],
    MESTRE_OBRA: [PROFILE_CODES.MESTRE_OBRA],
    ENCARREGADO_OBRA: [PROFILE_CODES.ENCARREGADO_OBRA],
    APONTADOR: [PROFILE_CODES.APONTADOR],
    ALMOXARIFE: [PROFILE_CODES.ALMOXARIFE],
    FISCAL_OBRA: [PROFILE_CODES.FISCAL_OBRA],
  };

  const byEmail =
    userEmail.includes('representante')
      ? [PROFILE_CODES.REPRESENTANTE_EMPRESA]
      : userEmail.includes('ceo')
        ? [PROFILE_CODES.CEO]
        : userEmail.includes('encarregado')
          ? [PROFILE_CODES.ENCARREGADO_SISTEMA_EMPRESA]
          : userEmail.includes('sst')
            ? [PROFILE_CODES.SST_TECNICO]
            : userEmail.includes('tst')
              ? [PROFILE_CODES.TST]
              : userEmail.includes('adminrh')
                ? [PROFILE_CODES.ADMIN_RH]
                : userEmail.includes('rh')
                  ? [PROFILE_CODES.GERENTE_RH]
                  : userEmail.includes('almox')
                    ? [PROFILE_CODES.ALMOXARIFE]
                    : userEmail.includes('fiscal')
                      ? [PROFILE_CODES.FISCAL_OBRA]
                      : userEmail.includes('apont')
                        ? [PROFILE_CODES.APONTADOR]
                        : userEmail.includes('mestre')
                          ? [PROFILE_CODES.MESTRE_OBRA]
                          : userEmail.includes('eng')
                            ? [PROFILE_CODES.ENGENHEIRO]
                            : null;

  const profilesRaw = backendProfiles.length > 0 ? backendProfiles : byTenantRole[tenantRole] ?? byEmail ?? [PROFILE_CODES.DIRETOR];
  const profiles = profilesRaw as ProfileCode[];

  const stored = localStorage.getItem('active_profile') as ProfileCode | null;
  const activeProfile = stored && profiles.includes(stored) ? stored : profiles[0];
  localStorage.setItem('available_profiles', JSON.stringify(profiles));
  localStorage.setItem('active_profile', activeProfile);

  const tenantId =
    typeof input.tenantId === 'number'
      ? input.tenantId
      : firstTenant && typeof firstTenant['tenantId'] !== 'undefined'
        ? Number(firstTenant['tenantId'])
        : 0;

  const parsedAbrangencia = {
    empresa: backendScope && typeof backendScope['empresa'] === 'boolean' ? Boolean(backendScope['empresa']) : true,
    diretorias: backendScope && Array.isArray(backendScope['diretorias']) ? (backendScope['diretorias'] as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0) : [],
    obras: backendScope && Array.isArray(backendScope['obras']) ? (backendScope['obras'] as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0) : [],
    unidades: backendScope && Array.isArray(backendScope['unidades']) ? (backendScope['unidades'] as unknown[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0) : [],
  };

  const fallbackPermissions = Array.from(new Set(profiles.flatMap((p) => permissionsForProfile(p))));
  const permissionsBase =
    backendPermissions.length > 0 ? Array.from(new Set([...backendPermissions, ...fallbackPermissions])) : fallbackPermissions;
  const forceWildcard = profiles.includes(PROFILE_CODES.REPRESENTANTE_EMPRESA);
  const permissions = forceWildcard && !permissionsBase.includes('*') ? [...permissionsBase, '*'] : permissionsBase;
  const abrangencia = forceWildcard ? { empresa: true, diretorias: [], obras: [], unidades: [] } : parsedAbrangencia;

  const expUser = {
    id: Number(userObj['id'] || 0),
    tenantId,
    idFuncionario: typeof userObj['idFuncionario'] === 'number' ? Number(userObj['idFuncionario']) : null,
    nome: String(userObj['name'] || ''),
    email: String(userObj['email'] || ''),
    perfis: profiles,
    permissoes: permissions,
    abrangencia,
  };

  setCookie('exp_user', JSON.stringify(expUser), 7 * 24 * 60 * 60);
  setCookie('exp_token', input.token, 7 * 24 * 60 * 60);
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
  const [confirmPassword, setConfirmPassword] = useState('');
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
          const { token, user, subscriptionAlert } = response.data;

          if (token) {
            setAuthSession({ token, user, subscriptionAlert });
            if (user.isSystemAdmin) {
              router.push('/admin/tenants');
            } else {
              router.push('/dashboard');
            }
          } else if (user.tenants && user.tenants.length > 0) {
            try {
              localStorage.setItem('pending_user', JSON.stringify(user));
            } catch {
            }
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
    setConfirmPassword('');
  }, [isLogin]);

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
        const { token, user, subscriptionAlert } = response.data;

        if (token) {
            // User has only one tenant, logged in directly
            setAuthSession({ token, user, subscriptionAlert });
            if (user.isSystemAdmin) {
                router.push('/admin/tenants');
            } else {
                router.push('/dashboard');
            }
        } else if (user.tenants && user.tenants.length > 0) {
            // Multiple tenants, show selection
            try {
              localStorage.setItem('pending_user', JSON.stringify(user));
            } catch {
            }
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
        if (password !== confirmPassword) {
          setError('As senhas não conferem.');
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
        const { token, user, subscriptionAlert } = response.data;
        
        // New users always have 1 tenant initially
        if (token) {
            setAuthSession({ token, user, subscriptionAlert });
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
        const sessionUser = response.data?.user ?? null;
        let pending: unknown = null;
        if (!sessionUser) {
          try {
            const raw = localStorage.getItem('pending_user');
            pending = raw ? JSON.parse(raw) : null;
          } catch {
          }
        }
        if (!sessionUser && !pending) {
          pending = { id: userId, email, name };
        }
        setAuthSession({ token: response.data.token, user: sessionUser || pending, subscriptionAlert: response.data.subscriptionAlert, tenantId });
        try {
          localStorage.removeItem('pending_user');
        } catch {
        }
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
                <div>
                  {label('Confirmar Senha', true)}
                  <input name="confirmPassword" type="password" required className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
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
              <div className="text-right">
                <Link href="/esqueci-senha" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Esqueci minha senha
                </Link>
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
