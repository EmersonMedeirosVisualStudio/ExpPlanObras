'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  IdCard,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioDetalheDTO, FuncionarioEnderecoDTO } from '@/lib/modules/funcionarios/types';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import type { TerceirizadoResumoDTO } from '@/lib/modules/terceirizados/types';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

function safeInternalPath(v: string | null) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return null;
  if (s.startsWith('//')) return null;
  if (s.includes('://')) return null;
  return s;
}

function currentPath() {
  try {
    if (typeof window === 'undefined') return '/dashboard/rh/cadastros';
    const p = window.location.pathname || '/dashboard/rh/cadastros';
    const s = window.location.search || '';
    return `${p}${s}`;
  } catch {
    return '/dashboard/rh/cadastros';
  }
}

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpf(value: string | null) {
  const d = onlyDigits(value || '').slice(0, 11);
  if (!d) return null;
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function formatPhoneBr(value: string | null) {
  const d = onlyDigits(value || '').slice(0, 11);
  if (!d) return null;
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function formatDateBr(value: string | null) {
  const v = String(value || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('pt-BR');
}

function initials(nome: string) {
  const parts = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return (first + last).toUpperCase();
}

function formatEnderecoLinha(e: FuncionarioEnderecoDTO | null) {
  if (!e) return null;
  const partes: string[] = [];
  const l = e.logradouro ? String(e.logradouro) : '';
  const n = e.numero ? String(e.numero) : '';
  const c = e.cidade ? String(e.cidade) : '';
  const uf = e.uf ? String(e.uf) : '';
  if (l) partes.push(l + (n ? `, ${n}` : ''));
  if (c) partes.push(c + (uf ? `/${uf}` : ''));
  return partes.length ? partes.join(' • ') : null;
}

function breadcrumbFromReturnTo(returnTo: string | null, leaf: string) {
  const safe = safeInternalPath(returnTo);
  if (!safe) return `RH → Pessoas → ${leaf}`;
  try {
    const u = new URL(safe, 'https://internal.local');
    const obraNome = u.searchParams.get('obraNome');
    const parts = u.pathname.split('/').filter(Boolean);
    const segs = parts[0] === 'dashboard' ? parts.slice(1) : parts;
    const map: Record<string, string> = {
      engenharia: 'Engenharia',
      obras: 'Obras',
      projetos: 'Projetos',
      fiscalizacao: 'Fiscalização',
      diario: 'Diário',
      medicoes: 'Medições',
      rh: 'RH',
      presencas: 'Presenças',
      painel: 'Painel',
      cadastros: 'Pessoas',
      pessoas: 'Pessoas',
    };
    const labels: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = String(segs[i] || '');
      if (/^\d+$/.test(seg)) {
        const prev = String(segs[i - 1] || '').toLowerCase();
        if (prev === 'obras') {
          labels.push(obraNome ? String(obraNome) : `Obra #${seg}`);
        } else {
          labels.push(`#${seg}`);
        }
        continue;
      }
      const lower = seg.toLowerCase();
      labels.push(map[lower] || (seg.length ? seg[0].toUpperCase() + seg.slice(1) : seg));
    }
    const base = labels.filter(Boolean).join(' → ');
    if (!base) return `RH → Pessoas → ${leaf}`;
    if (base.endsWith('RH → Pessoas') || base.endsWith('Pessoas')) return `${base} → ${leaf}`;
    if (base.endsWith('RH')) return `${base} → Pessoas → ${leaf}`;
    return `${base} → RH → Pessoas → ${leaf}`;
  } catch {
    return `RH → Pessoas → ${leaf}`;
  }
}

type TabKey =
  | 'dados'
  | 'vinculos'
  | 'documentos'
  | 'enderecos'
  | 'presenca'
  | 'ocorrencias'
  | 'epi'
  | 'historico'
  | 'custos'
  | 'conformidade';

function tabLabel(tab: TabKey, tipo: 'FUNCIONARIO' | 'TERCEIRIZADO') {
  if (tab === 'dados') return 'Dados Gerais';
  if (tab === 'vinculos') return 'Vínculo e Obra';
  if (tab === 'documentos') return 'Documentos';
  if (tab === 'enderecos') return tipo === 'FUNCIONARIO' ? 'Endereços' : 'Endereço';
  if (tab === 'presenca') return 'Presença';
  if (tab === 'ocorrencias') return 'Ocorrências';
  if (tab === 'epi') return 'EPI e Treinamentos';
  if (tab === 'historico') return 'Histórico';
  if (tab === 'custos') return 'Custos';
  return 'Conformidade';
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={
        active
          ? 'inline-flex items-center gap-2 border-b-2 border-blue-600 px-2 py-3 text-sm font-semibold text-blue-700'
          : 'inline-flex items-center gap-2 border-b-2 border-transparent px-2 py-3 text-sm text-slate-600 hover:text-slate-900'
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function FichaRhClient() {
  const router = useRouter();
  const params = useParams<{ tipo: string; id: string }>();
  const sp = useSearchParams();

  const tipoPath = String(params?.tipo || '').toLowerCase();
  const isTerceirizado = tipoPath.includes('terceir');
  const tipoPessoa = (isTerceirizado ? 'TERCEIRIZADO' : 'FUNCIONARIO') as 'FUNCIONARIO' | 'TERCEIRIZADO';
  const idNum = Number(params?.id || 0);

  const returnTo = useMemo(() => safeInternalPath(sp.get('returnTo') || null), [sp]);
  const sessionKey = useMemo(() => `rh_pessoas_ficha:returnTo:${tipoPath}:${String(idNum || 0)}`, [tipoPath, idNum]);
  const [backHref, setBackHref] = useState<string>(() => returnTo || '/dashboard/rh/cadastros');

  useEffect(() => {
    try {
      const safe = safeInternalPath(returnTo);
      if (safe) {
        sessionStorage.setItem(sessionKey, safe);
        setBackHref(safe);
        return;
      }
      const stored = safeInternalPath(sessionStorage.getItem(sessionKey));
      if (stored) setBackHref(stored);
    } catch {
      setBackHref(returnTo || '/dashboard/rh/cadastros');
    }
  }, [returnTo, sessionKey]);

  const tab = (String(sp.get('tab') || 'dados').toLowerCase() as TabKey) || 'dados';
  const setTab = useCallback(
    (next: TabKey) => {
      const p = new URLSearchParams(sp.toString());
      p.set('tab', next);
      if (returnTo) p.set('returnTo', returnTo);
      router.replace(`${String(params?.tipo ? `/dashboard/rh/pessoas/${params.tipo}/${params.id}` : '/dashboard/rh/cadastros')}?${p.toString()}`);
    },
    [router, sp, params, returnTo]
  );

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [funcionario, setFuncionario] = useState<FuncionarioDetalheDTO | null>(null);
  const [enderecos, setEnderecos] = useState<FuncionarioEnderecoDTO[]>([]);
  const [terceirizado, setTerceirizado] = useState<TerceirizadoResumoDTO | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoRegistroDTO[]>([]);

  const leafTitle = tipoPessoa === 'FUNCIONARIO' ? 'Ficha do Funcionário' : 'Ficha do Terceirizado';
  const breadcrumb = useMemo(() => breadcrumbFromReturnTo(returnTo, leafTitle), [returnTo, leafTitle]);

  const carregar = useCallback(async () => {
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    try {
      setLoading(true);
      setErro(null);

      if (tipoPessoa === 'FUNCIONARIO') {
        const f = await FuncionariosApi.obter(idNum);
        setFuncionario(f);
        const end = await FuncionariosApi.listarEnderecos(idNum).catch(() => []);
        setEnderecos(Array.isArray(end) ? end : []);
        const docs = await DocumentosApi.listar({ entidadeTipo: 'FUNCIONARIO', entidadeId: idNum, limit: 50 }).catch(() => []);
        setDocumentos(Array.isArray(docs) ? docs : []);
        setTerceirizado(null);
      } else {
        const t = await TerceirizadosApi.obter(idNum);
        setTerceirizado(t);
        const docs = await DocumentosApi.listar({ entidadeTipo: 'TERCEIRIZADO', entidadeId: idNum, limit: 50 }).catch(() => []);
        setDocumentos(Array.isArray(docs) ? docs : []);
        setFuncionario(null);
        setEnderecos([]);
      }
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar ficha');
    } finally {
      setLoading(false);
    }
  }, [idNum, tipoPessoa]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const nome = tipoPessoa === 'FUNCIONARIO' ? String(funcionario?.nomeCompleto || '') : String(terceirizado?.nomeCompleto || '');
  const ativo = tipoPessoa === 'FUNCIONARIO' ? Boolean((funcionario as any)?.ativo) : Boolean((terceirizado as any)?.ativo);
  const cpf = tipoPessoa === 'FUNCIONARIO' ? formatCpf((funcionario as any)?.cpf || null) : formatCpf((terceirizado as any)?.cpf || null);
  const telefone =
    tipoPessoa === 'FUNCIONARIO'
      ? formatPhoneBr((funcionario as any)?.telefonePrincipal || (funcionario as any)?.telefoneWhatsapp || null)
      : formatPhoneBr((terceirizado as any)?.telefoneWhatsapp || null);
  const email = tipoPessoa === 'FUNCIONARIO' ? String((funcionario as any)?.emailPessoal || '') : '';
  const dataNascimento =
    tipoPessoa === 'FUNCIONARIO' ? formatDateBr((funcionario as any)?.dataNascimento || null) : formatDateBr((terceirizado as any)?.dataNascimento || null);
  const enderecoPrincipal = useMemo(() => enderecos.find((e) => Boolean(e.principal)) || null, [enderecos]);
  const enderecoLinha = useMemo(() => formatEnderecoLinha(enderecoPrincipal), [enderecoPrincipal]);

  const tabs: TabKey[] =
    tipoPessoa === 'FUNCIONARIO'
      ? ['dados', 'vinculos', 'documentos', 'presenca', 'ocorrencias', 'epi', 'enderecos', 'historico']
      : ['dados', 'vinculos', 'documentos', 'presenca', 'ocorrencias', 'epi', 'custos', 'historico', 'conformidade'];

  const editHref = useMemo(() => {
    const rt = encodeURIComponent(currentPath());
    return `/dashboard/rh/cadastros?editarFuncionario=${encodeURIComponent(String(idNum))}&returnTo=${rt}`;
  }, [idNum]);
  const canEdit = tipoPessoa === 'FUNCIONARIO';

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
            {tipoPessoa === 'FUNCIONARIO' ? <User size={18} /> : <Building2 size={18} />}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{leafTitle}</h1>
            <p className="text-sm text-slate-600">{breadcrumb}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            onClick={() => (canEdit ? router.push(editHref) : null)}
            disabled={!canEdit || !Number.isFinite(idNum) || idNum <= 0}
          >
            <IdCard size={16} />
            Editar
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <MoreVertical size={16} />
                Mais ações
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/dashboard/rh/pessoas/${tipoPath}/${idNum}/checklist?returnTo=${encodeURIComponent(currentPath())}`)}>
                Checklist
              </DropdownMenuItem>
              {tipoPessoa === 'FUNCIONARIO' ? (
                <DropdownMenuItem onClick={() => router.push(`/dashboard/rh/pessoas/funcionario/${idNum}/enderecos?returnTo=${encodeURIComponent(currentPath())}`)}>
                  Endereços
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={carregar}>Recarregar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
            onClick={() => router.push(backHref)}
            title="Voltar"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xl font-semibold">
              {initials(nome)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-lg font-semibold text-slate-900">{nome ? nome : `#${idNum}`}</div>
                <span className={ativo ? 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800' : 'rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800'}>
                  {ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="text-sm text-slate-600">
                {tipoPessoa === 'FUNCIONARIO' ? (
                  <>
                    {funcionario?.matricula ? `Matrícula: ${funcionario.matricula}` : 'Matrícula: —'}
                    {cpf ? `  •  CPF: ${cpf}` : ''}
                    {funcionario?.cargoContratual ? `  •  Cargo: ${funcionario.cargoContratual}` : ''}
                  </>
                ) : (
                  <>
                    {cpf ? `CPF: ${cpf}` : 'CPF: —'}
                    {terceirizado?.funcao ? `  •  Função: ${terceirizado.funcao}` : ''}
                    {terceirizado?.empresaParceira ? `  •  Empresa: ${terceirizado.empresaParceira}` : ''}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Phone size={14} />
                Telefone
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">{telefone || '—'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Mail size={14} />
                E-mail
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1 truncate max-w-[240px]">{email ? email : '—'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Calendar size={14} />
                Data de Nascimento
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">{dataNascimento || '—'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <MapPin size={14} />
                Endereço
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">{tipoPessoa === 'FUNCIONARIO' ? (enderecoLinha || '—') : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b bg-white px-4">
          <div className="flex items-center gap-4 overflow-x-auto">
            {tabs.map((k) => (
              <TabButton key={k} active={tab === k} label={tabLabel(k, tipoPessoa)} onClick={() => setTab(k)} />
            ))}
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-sm text-slate-600">Carregando…</div>
          ) : tab === 'dados' ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-3">Dados Pessoais</div>
                {tipoPessoa === 'FUNCIONARIO' ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Nome completo</div>
                      <div className="font-medium text-slate-900 text-right">{funcionario?.nomeCompleto || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">CPF</div>
                      <div className="font-medium text-slate-900 text-right">{cpf || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">RG</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.rg || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Nascimento</div>
                      <div className="font-medium text-slate-900 text-right">{dataNascimento || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Estado civil</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.estadoCivil || '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Nome completo</div>
                      <div className="font-medium text-slate-900 text-right">{terceirizado?.nomeCompleto || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">CPF</div>
                      <div className="font-medium text-slate-900 text-right">{cpf || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Função</div>
                      <div className="font-medium text-slate-900 text-right">{terceirizado?.funcao || '—'}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-3">Informações Profissionais</div>
                {tipoPessoa === 'FUNCIONARIO' ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Cargo</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.cargoContratual || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Função</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.funcaoPrincipal || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Tipo de vínculo</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.tipoVinculo || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Admissão</div>
                      <div className="font-medium text-slate-900 text-right">{formatDateBr((funcionario as any)?.dataAdmissao || null) || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Status funcional</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.statusFuncional || '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Empresa</div>
                      <div className="font-medium text-slate-900 text-right">{terceirizado?.empresaParceira || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Contrato</div>
                      <div className="font-medium text-slate-900 text-right">{terceirizado?.contratoNumero || (terceirizado?.contratoId ? `#${terceirizado.contratoId}` : '—')}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Local atual</div>
                      <div className="font-medium text-slate-900 text-right">{terceirizado?.localNome || '—'}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-3">Contato</div>
                {tipoPessoa === 'FUNCIONARIO' ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Telefone</div>
                      <div className="font-medium text-slate-900 text-right">{telefone || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">E-mail</div>
                      <div className="font-medium text-slate-900 text-right">{email || '—'}</div>
                    </div>
                    <div className="mt-4 text-sm font-semibold text-slate-900">Emergência</div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Nome</div>
                      <div className="font-medium text-slate-900 text-right">{(funcionario as any)?.contatoEmergenciaNome || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Telefone</div>
                      <div className="font-medium text-slate-900 text-right">{formatPhoneBr((funcionario as any)?.contatoEmergenciaTelefone || null) || '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">Telefone</div>
                      <div className="font-medium text-slate-900 text-right">{telefone || '—'}</div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-slate-600">E-mail</div>
                      <div className="font-medium text-slate-900 text-right">—</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'vinculos' ? (
            <div className="space-y-4">
              <div className="text-sm text-slate-700">
                {tipoPessoa === 'FUNCIONARIO' ? 'Vínculos e lotações' : 'Vínculo e alocação atual'}
              </div>
              {tipoPessoa === 'FUNCIONARIO' ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Local</th>
                        <th className="px-3 py-2">Início</th>
                        <th className="px-3 py-2">Atual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(funcionario?.lotacoes || []).map((l: any) => (
                        <tr key={l.id} className="border-t">
                          <td className="px-3 py-2">{l.tipoLotacao || '-'}</td>
                          <td className="px-3 py-2">{l.idObra ? `Obra #${l.idObra}` : l.idUnidade ? `Unidade #${l.idUnidade}` : '-'}</td>
                          <td className="px-3 py-2">{formatDateBr(l.dataInicio || null) || '-'}</td>
                          <td className="px-3 py-2">{l.atual ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Atual</span> : '-'}</td>
                        </tr>
                      ))}
                      {!funcionario?.lotacoes?.length ? (
                        <tr className="border-t">
                          <td className="px-3 py-6 text-center text-slate-600" colSpan={4}>
                            Sem lotações registradas.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-slate-600">Local</div>
                    <div className="font-semibold text-slate-900">{terceirizado?.localNome || '—'}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <div className="text-slate-600">Contrato</div>
                    <div className="font-semibold text-slate-900">{terceirizado?.contratoNumero || (terceirizado?.contratoId ? `#${terceirizado.contratoId}` : '—')}</div>
                  </div>
                </div>
              )}
            </div>
          ) : tab === 'documentos' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-700">{documentos.length} documento(s)</div>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                  onClick={() => router.push('/dashboard/documentos')}
                >
                  <FileText size={16} />
                  Abrir módulo de documentos
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">{d.categoriaDocumento}</td>
                        <td className="px-3 py-2">{d.tituloDocumento}</td>
                        <td className="px-3 py-2">{d.statusDocumento}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-blue-700 hover:underline" onClick={() => router.push(`/dashboard/documentos/${d.id}`)}>
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!documentos.length ? (
                      <tr className="border-t">
                        <td className="px-3 py-6 text-center text-slate-600" colSpan={4}>
                          Nenhum documento vinculado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === 'enderecos' ? (
            <div className="space-y-4">
              {tipoPessoa !== 'FUNCIONARIO' ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Endereços disponíveis apenas para funcionário.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-slate-700">{enderecos.length} endereço(s)</div>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                      onClick={() => router.push(`/dashboard/rh/pessoas/funcionario/${idNum}/enderecos?returnTo=${encodeURIComponent(currentPath())}`)}
                    >
                      <MapPin size={16} />
                      Gerenciar endereços
                    </button>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="divide-y">
                      {enderecos.map((e) => (
                        <div key={e.id} className="px-4 py-4 flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              #{e.id} — {e.logradouro ? e.logradouro : '-'}
                              {e.numero ? `, ${e.numero}` : ''}
                              {e.complemento ? ` — ${e.complemento}` : ''}
                            </div>
                            <div className="text-xs text-slate-600">
                              {(e.bairro ? e.bairro : '-') + ' • ' + (e.cidade ? e.cidade : '-') + (e.uf ? `/${e.uf}` : '')}
                              {e.cep ? ` • CEP ${e.cep}` : ''}
                            </div>
                            {e.observacao ? <div className="text-xs text-slate-600 mt-1">{e.observacao}</div> : null}
                          </div>
                          {e.principal ? (
                            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 inline-flex items-center gap-2">
                              <ShieldCheck size={14} />
                              Atual
                            </div>
                          ) : (
                            <div className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-700">—</div>
                          )}
                        </div>
                      ))}
                      {!enderecos.length ? <div className="px-4 py-6 text-sm text-slate-600">Nenhum endereço cadastrado.</div> : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">Em breve.</div>
          )}
        </div>
      </div>
    </div>
  );
}
