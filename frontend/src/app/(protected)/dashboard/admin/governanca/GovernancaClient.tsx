'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GovernancaApi } from '@/lib/modules/governanca/api';
import { parsePermissionCode, stringifyPermission } from '@/lib/modules/governanca/permission-map';

type TabKey = 'USUARIOS' | 'PERFIS' | 'PERMISSOES' | 'ABRANGENCIAS' | 'AUDITORIA';

type Usuario = {
  id: number;
  nome: string;
  idFuncionario: number;
  login: string;
  email: string;
  perfis: string[];
  abrangencias: string[];
  ativo: boolean;
  bloqueado: boolean;
  ultimoAcesso?: string;
};

type Perfil = {
  id: number;
  nome: string;
  codigo: string;
  tipo: 'BASE' | 'EMPRESA';
  ativo: boolean;
  permissoes: string[];
};

type Abrangencia = {
  id: number;
  usuarioId: number;
  usuarioNome: string;
  tipo: 'EMPRESA' | 'DIRETORIA' | 'OBRA' | 'UNIDADE';
  idSetorDiretoria?: number | null;
  idObra?: number | null;
  idUnidade?: number | null;
  ativo: boolean;
};

type AuditoriaEvento = {
  id: number;
  dataHora: string;
  entidade: string;
  acao: string;
  usuario: string;
  resumo: string;
};

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function formatUsuarioRef(id: number, nome: string) {
  return `#U${id} - ${nome}`;
}

function usuarioAlertas(u: Usuario) {
  const missingRequired: string[] = [];
  if (!String(u.nome || '').trim()) missingRequired.push('Nome');
  if (!String(u.login || '').trim()) missingRequired.push('Login');
  if (!String(u.email || '').trim()) missingRequired.push('E-mail');
  if (!Number.isFinite(u.idFuncionario) || u.idFuncionario <= 0) missingRequired.push('Funcionário');
  if (!Array.isArray(u.perfis) || u.perfis.length === 0) missingRequired.push('Perfis');

  const missingOptional: string[] = [];
  if (!Array.isArray(u.abrangencias) || u.abrangencias.length === 0) missingOptional.push('Abrangências');

  if (missingRequired.length > 0) return { level: 'RED' as const, title: `Faltando obrigatório: ${missingRequired.join(', ')}` };
  if (missingOptional.length > 0) return { level: 'AMBER' as const, title: `Faltando opcional: ${missingOptional.join(', ')}` };
  return { level: 'GREEN' as const, title: 'Cadastro completo' };
}

function AlertaPill({ level, title }: { level: 'RED' | 'AMBER' | 'GREEN'; title: string }) {
  const color =
    level === 'RED'
      ? 'bg-red-100 text-red-800'
      : level === 'AMBER'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-emerald-100 text-emerald-800';
  const label = level === 'RED' ? 'Obrig.' : level === 'AMBER' ? 'Opc.' : 'OK';
  return (
    <span title={title} className={classNames('inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold', color)}>
      {label}
    </span>
  );
}

function nextId(list: Array<{ id: number }>) {
  return list.reduce((max, it) => Math.max(max, it.id), 0) + 1;
}

function formatNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl bg-white rounded-lg border shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="text-lg font-semibold text-gray-900">{title}</div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded hover:bg-gray-50">
            Fechar
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function GovernancaClient() {
  const [tab, setTab] = useState<TabKey>('USUARIOS');
  const usuarioAtualEhEncarregado = useMemo(() => {
    try {
      return (localStorage.getItem('active_profile') || '') === 'ENCARREGADO_SISTEMA_EMPRESA';
    } catch {
      return false;
    }
  }, []);
  const [solicitouSaida, setSolicitouSaida] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);

  const [perfilSelecionadoId, setPerfilSelecionadoId] = useState<number>(1);

  const [abrangencias, setAbrangencias] = useState<Abrangencia[]>([]);

  const [auditoria, setAuditoria] = useState<AuditoriaEvento[]>(() => [
    { id: 1, dataHora: formatNow(), entidade: 'Usuário', acao: 'CRIAR', usuario: 'Sistema', resumo: 'Usuário inicial criado' },
  ]);

  const [modalUsuarioOpen, setModalUsuarioOpen] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioForm, setUsuarioForm] = useState(() => ({
    idFuncionario: '',
    login: '',
    email: '',
    ativo: true,
    bloqueado: false,
    perfis: [] as string[],
  }));
  const [usuarioFormError, setUsuarioFormError] = useState('');

  const [modalPerfilOpen, setModalPerfilOpen] = useState(false);
  const [perfilEditando, setPerfilEditando] = useState<Perfil | null>(null);
  const [perfilForm, setPerfilForm] = useState(() => ({ nome: '', codigo: '', permissoesText: '', ativo: true }));
  const [perfilFormError, setPerfilFormError] = useState('');

  const [modalAbrangenciaOpen, setModalAbrangenciaOpen] = useState(false);
  const [abrangenciaForm, setAbrangenciaForm] = useState(() => ({
    usuarioId: 1,
    tipo: 'EMPRESA' as Abrangencia['tipo'],
    diretoria: '',
    obra: '',
    unidade: '',
    ativo: true,
  }));
  const [abrangenciaError, setAbrangenciaError] = useState('');
  const allProfileCodes = useMemo(() => Array.from(new Set(perfis.map((p) => p.codigo))).sort(), [perfis]);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'USUARIOS', label: 'Usuários' },
    { key: 'PERFIS', label: 'Perfis' },
    { key: 'PERMISSOES', label: 'Permissões' },
    { key: 'ABRANGENCIAS', label: 'Abrangências' },
    { key: 'AUDITORIA', label: 'Auditoria' },
  ];

  const carregarTudo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [usuariosData, perfisData, abrangenciasData] = await Promise.all([
        GovernancaApi.listarUsuarios(),
        GovernancaApi.listarPerfis(),
        GovernancaApi.listarAbrangencias(),
      ]);

      const mappedPerfis: Perfil[] = perfisData.map((p) => ({
        id: p.id,
        nome: p.nome,
        codigo: p.codigo,
        tipo: p.tipo,
        ativo: p.ativo,
        permissoes: Array.isArray(p.permissoes) ? p.permissoes.map(stringifyPermission) : [],
      }));
      setPerfis(mappedPerfis);

      const mappedUsuarios: Usuario[] = usuariosData.map((u) => ({
        id: u.id,
        nome: u.nome,
        idFuncionario: u.idFuncionario,
        login: u.login,
        email: u.emailLogin,
        perfis: Array.isArray(u.perfis) ? u.perfis : [],
        abrangencias: Array.isArray(u.abrangencias) ? u.abrangencias : [],
        ativo: u.ativo,
        bloqueado: u.bloqueado,
        ultimoAcesso: u.ultimoAcesso ?? undefined,
      }));
      setUsuarios(mappedUsuarios);

      const usersById = new Map(mappedUsuarios.map((u) => [u.id, u.nome]));
      const mappedAbrangencias: Abrangencia[] = (Array.isArray(abrangenciasData) ? abrangenciasData : []).map((a: any) => {
        const id = Number(a.id_usuario_abrangencia);
        const usuarioId = Number(a.id_usuario);
        const tipo = String(a.tipo_abrangencia || 'EMPRESA') as Abrangencia['tipo'];
        return {
          id,
          usuarioId,
          usuarioNome: usersById.get(usuarioId) || String(usuarioId),
          tipo: tipo === 'OBRA' || tipo === 'UNIDADE' || tipo === 'DIRETORIA' || tipo === 'EMPRESA' ? tipo : 'EMPRESA',
          idSetorDiretoria: a.id_setor_diretoria === null || a.id_setor_diretoria === undefined ? null : Number(a.id_setor_diretoria),
          idObra: a.id_obra === null || a.id_obra === undefined ? null : Number(a.id_obra),
          idUnidade: a.id_unidade === null || a.id_unidade === undefined ? null : Number(a.id_unidade),
          ativo: Boolean(a.ativo),
        };
      });
      setAbrangencias(mappedAbrangencias);

      if (mappedPerfis.length > 0 && !mappedPerfis.some((p) => p.id === perfilSelecionadoId)) {
        setPerfilSelecionadoId(mappedPerfis[0].id);
      }
      if (mappedUsuarios.length > 0 && !mappedUsuarios.some((u) => u.id === abrangenciaForm.usuarioId)) {
        setAbrangenciaForm((p) => ({ ...p, usuarioId: mappedUsuarios[0].id }));
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, [abrangenciaForm.usuarioId, perfilSelecionadoId]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const openNovoUsuario = () => {
    setUsuarioEditando(null);
    setUsuarioForm({ idFuncionario: '', login: '', email: '', ativo: true, bloqueado: false, perfis: [] });
    setUsuarioFormError('');
    setModalUsuarioOpen(true);
  };

  const openEditarUsuario = (u: Usuario) => {
    setUsuarioEditando(u);
    setUsuarioForm({
      idFuncionario: String(u.idFuncionario),
      login: u.login,
      email: u.email,
      ativo: u.ativo,
      bloqueado: u.bloqueado,
      perfis: [...u.perfis],
    });
    setUsuarioFormError('');
    setModalUsuarioOpen(true);
  };

  const salvarUsuario = async () => {
    setUsuarioFormError('');
    const idFuncionario = Number(usuarioForm.idFuncionario);
    const login = usuarioForm.login.trim();
    const email = usuarioForm.email.trim();
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) return setUsuarioFormError('idFuncionario inválido.');
    if (login.length < 3) return setUsuarioFormError('Login é obrigatório.');
    if (!email.includes('@')) return setUsuarioFormError('E-mail inválido.');
    if (usuarioForm.perfis.length === 0) return setUsuarioFormError('Selecione ao menos um perfil.');

    try {
      setError(null);

      if (usuarioEditando) {
        await GovernancaApi.atualizarUsuario(usuarioEditando.id, {
          emailLogin: email,
          ativo: usuarioForm.ativo,
          bloqueado: usuarioForm.bloqueado,
        });

        const perfisIds = perfis.filter((p) => usuarioForm.perfis.includes(p.codigo)).map((p) => p.id);
        await GovernancaApi.atualizarPerfisUsuario(usuarioEditando.id, perfisIds);

        setAuditoria((a) => [
          {
            id: nextId(a),
            dataHora: formatNow(),
            entidade: 'Usuário',
            acao: 'EDITAR',
            usuario: 'Encarregado',
            resumo: `Editou usuário ${usuarioEditando.nome}`,
          },
          ...a,
        ]);
      } else {
        const novo = await GovernancaApi.criarUsuario({
          idFuncionario,
          login,
          emailLogin: email,
          ativo: usuarioForm.ativo,
          bloqueado: usuarioForm.bloqueado,
        });

        const perfisIds = perfis.filter((p) => usuarioForm.perfis.includes(p.codigo)).map((p) => p.id);
        await GovernancaApi.atualizarPerfisUsuario(novo.id, perfisIds);

        setAuditoria((a) => [
          { id: nextId(a), dataHora: formatNow(), entidade: 'Usuário', acao: 'CRIAR', usuario: 'Encarregado', resumo: `Criou usuário ${login}` },
          ...a,
        ]);
      }

      setModalUsuarioOpen(false);
      await carregarTudo();
    } catch (e: any) {
      setUsuarioFormError(e?.message || 'Erro ao salvar usuário.');
    }
  };

  const toggleAtivo = async (u: Usuario) => {
    try {
      setError(null);
      await GovernancaApi.atualizarStatusUsuario(u.id, { ativo: !u.ativo, bloqueado: u.bloqueado });
      setAuditoria((a) => [
        {
          id: nextId(a),
          dataHora: formatNow(),
          entidade: 'Usuário',
          acao: 'STATUS',
          usuario: 'Encarregado',
          resumo: `${u.ativo ? 'Inativou' : 'Ativou'} usuário ${u.nome}`,
        },
        ...a,
      ]);
      await carregarTudo();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar status.');
    }
  };

  const toggleBloqueado = async (u: Usuario) => {
    try {
      setError(null);
      await GovernancaApi.atualizarStatusUsuario(u.id, { ativo: u.ativo, bloqueado: !u.bloqueado });
      setAuditoria((a) => [
        {
          id: nextId(a),
          dataHora: formatNow(),
          entidade: 'Usuário',
          acao: 'BLOQUEIO',
          usuario: 'Encarregado',
          resumo: `${u.bloqueado ? 'Desbloqueou' : 'Bloqueou'} usuário ${u.nome}`,
        },
        ...a,
      ]);
      await carregarTudo();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar bloqueio.');
    }
  };

  const resetarAcesso = async (u: Usuario) => {
    try {
      setError(null);
      await GovernancaApi.resetarAcessoUsuario(u.id);
      setAuditoria((a) => [
        { id: nextId(a), dataHora: formatNow(), entidade: 'Usuário', acao: 'RESET', usuario: 'Encarregado', resumo: `Resetou acesso de ${u.nome}` },
        ...a,
      ]);
      alert(`Reset de acesso solicitado para ${u.nome}.`);
    } catch (e: any) {
      setError(e?.message || 'Erro ao solicitar reset.');
    }
  };

  const openNovoPerfil = () => {
    setPerfilEditando(null);
    setPerfilForm({ nome: '', codigo: '', permissoesText: '', ativo: true });
    setPerfilFormError('');
    setModalPerfilOpen(true);
  };

  const openEditarPerfil = (p: Perfil) => {
    setPerfilEditando(p);
    setPerfilForm({ nome: p.nome, codigo: p.codigo, permissoesText: p.permissoes.join('\n'), ativo: p.ativo });
    setPerfilFormError('');
    setModalPerfilOpen(true);
  };

  const duplicarPerfil = async (p: Perfil) => {
    try {
      setError(null);
      const suffix = String(Date.now()).slice(-4);
      const codigo = `${p.codigo}_COPIA_${suffix}`.toUpperCase();
      const permissoes = p.permissoes.map(parsePermissionCode);
      await GovernancaApi.criarPerfil({ nome: `${p.nome} (cópia)`, codigo, permissoes });
      setAuditoria((a) => [
        { id: nextId(a), dataHora: formatNow(), entidade: 'Perfil', acao: 'DUPLICAR', usuario: 'Encarregado', resumo: `Duplicou perfil ${p.nome}` },
        ...a,
      ]);
      await carregarTudo();
    } catch (e: any) {
      setError(e?.message || 'Erro ao duplicar perfil.');
    }
  };

  const salvarPerfil = async () => {
    setPerfilFormError('');
    const nome = perfilForm.nome.trim();
    const codigo = perfilForm.codigo.trim().toUpperCase();
    if (nome.length < 3) return setPerfilFormError('Nome do perfil é obrigatório.');
    if (codigo.length < 3) return setPerfilFormError('Código do perfil é obrigatório.');

    const permissoes = perfilForm.permissoesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parsePermissionCode);

    try {
      setError(null);
      if (perfilEditando) {
        if (perfilEditando.tipo !== 'EMPRESA') return setPerfilFormError('Perfis base não podem ser editados.');
        await GovernancaApi.atualizarPerfil(perfilEditando.id, { nome, codigo, ativo: perfilForm.ativo, permissoes });
        setAuditoria((a) => [
          { id: nextId(a), dataHora: formatNow(), entidade: 'Perfil', acao: 'EDITAR', usuario: 'Encarregado', resumo: `Editou perfil ${nome}` },
          ...a,
        ]);
      } else {
        await GovernancaApi.criarPerfil({ nome, codigo, permissoes });
        setAuditoria((a) => [
          { id: nextId(a), dataHora: formatNow(), entidade: 'Perfil', acao: 'CRIAR', usuario: 'Encarregado', resumo: `Criou perfil ${nome}` },
          ...a,
        ]);
      }
      setModalPerfilOpen(false);
      await carregarTudo();
    } catch (e: any) {
      setPerfilFormError(e?.message || 'Erro ao salvar perfil.');
    }
  };

  const inativarPerfil = async (p: Perfil) => {
    if (p.tipo !== 'EMPRESA') return;
    try {
      setError(null);
      const permissoes = p.permissoes.map(parsePermissionCode);
      await GovernancaApi.atualizarPerfil(p.id, { nome: p.nome, codigo: p.codigo, ativo: !p.ativo, permissoes });
      setAuditoria((a) => [
        { id: nextId(a), dataHora: formatNow(), entidade: 'Perfil', acao: 'STATUS', usuario: 'Encarregado', resumo: `${p.ativo ? 'Inativou' : 'Ativou'} perfil ${p.nome}` },
        ...a,
      ]);
      await carregarTudo();
    } catch (e: any) {
      setError(e?.message || 'Erro ao atualizar perfil.');
    }
  };

  const openNovaAbrangencia = () => {
    setAbrangenciaForm({ usuarioId: usuarios[0]?.id || 1, tipo: 'EMPRESA', diretoria: '', obra: '', unidade: '', ativo: true });
    setAbrangenciaError('');
    setModalAbrangenciaOpen(true);
  };

  const salvarAbrangencia = async () => {
    setAbrangenciaError('');
    const user = usuarios.find((u) => u.id === abrangenciaForm.usuarioId);
    if (!user) return setAbrangenciaError('Usuário inválido.');

    try {
      setError(null);
      if (abrangenciaForm.tipo === 'EMPRESA') {
        await GovernancaApi.criarAbrangencia({ idUsuario: user.id, tipoAbrangencia: 'EMPRESA', ativo: abrangenciaForm.ativo });
      } else if (abrangenciaForm.tipo === 'DIRETORIA') {
        const idSetorDiretoria = Number(abrangenciaForm.diretoria);
        if (!Number.isFinite(idSetorDiretoria) || idSetorDiretoria <= 0) return setAbrangenciaError('Informe o ID da diretoria.');
        await GovernancaApi.criarAbrangencia({ idUsuario: user.id, tipoAbrangencia: 'DIRETORIA', idSetorDiretoria, ativo: abrangenciaForm.ativo });
      } else if (abrangenciaForm.tipo === 'OBRA') {
        const idObra = Number(abrangenciaForm.obra);
        if (!Number.isFinite(idObra) || idObra <= 0) return setAbrangenciaError('Informe o ID da obra.');
        await GovernancaApi.criarAbrangencia({ idUsuario: user.id, tipoAbrangencia: 'OBRA', idObra, ativo: abrangenciaForm.ativo });
      } else {
        const idUnidade = Number(abrangenciaForm.unidade);
        if (!Number.isFinite(idUnidade) || idUnidade <= 0) return setAbrangenciaError('Informe o ID da unidade.');
        await GovernancaApi.criarAbrangencia({ idUsuario: user.id, tipoAbrangencia: 'UNIDADE', idUnidade, ativo: abrangenciaForm.ativo });
      }

      setAuditoria((a) => [
        { id: nextId(a), dataHora: formatNow(), entidade: 'Abrangência', acao: 'CRIAR', usuario: 'Encarregado', resumo: `Criou abrangência para ${user.nome}` },
        ...a,
      ]);
      setModalAbrangenciaOpen(false);
      await carregarTudo();
    } catch (e: any) {
      setAbrangenciaError(e?.message || 'Erro ao salvar abrangência.');
    }
  };

  const removerAbrangencia = async (id: number) => {
    if (!confirm('Inativar esta abrangência?')) return;
    const a = abrangencias.find((x) => x.id === id);
    if (!a) return;
    try {
      setError(null);
      await GovernancaApi.atualizarAbrangencia(id, {
        idUsuario: a.usuarioId,
        tipoAbrangencia: a.tipo,
        idObra: a.tipo === 'OBRA' ? a.idObra ?? null : null,
        idUnidade: a.tipo === 'UNIDADE' ? a.idUnidade ?? null : null,
        ativo: false,
      });
      setAuditoria((au) => [
        { id: nextId(au), dataHora: formatNow(), entidade: 'Abrangência', acao: 'STATUS', usuario: 'Encarregado', resumo: `Inativou abrangência #${id}` },
        ...au,
      ]);
      await carregarTudo();
    } catch (e: any) {
      setError(e?.message || 'Erro ao inativar abrangência.');
    }
  };

  const permissoesPerfilAtual = perfis.find((p) => p.id === perfilSelecionadoId)?.permissoes || [];

  const registrarSolicitacaoSaida = async () => {
    try {
      setError(null);
      await GovernancaApi.solicitarSaidaEncarregado('Solicito substituição da função.');
      setSolicitouSaida(true);
      setAuditoria((a) => [
        { id: nextId(a), dataHora: formatNow(), entidade: 'Encarregado', acao: 'SOLICITAR_SAIDA', usuario: 'Encarregado', resumo: 'Solicitação registrada.' },
        ...a,
      ]);
    } catch (e: any) {
      setError(e?.message || 'Erro ao solicitar saída.');
    }
  };

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Carregando governança...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  return (
    <div className="max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Encarregado do Sistema</h1>
          <p className="text-gray-600 mt-1">Usuários, perfis, permissões e abrangências.</p>
        </div>
        {usuarioAtualEhEncarregado && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={registrarSolicitacaoSaida}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-700"
            >
              Solicitar deixar a função
            </button>
          </div>
        )}
      </div>

      {solicitouSaida && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Solicitação registrada. A função permanece ativa até o Representante da Empresa definir substituição.
        </div>
      )}

      <div className="mt-6 border-b">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={classNames(
                'pb-3 text-sm font-medium',
                tab === t.key ? 'text-blue-700 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'USUARIOS' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600">CRUD de usuários, ativar/inativar, bloquear e resetar acesso.</div>
            <button type="button" onClick={openNovoUsuario} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
              Novo usuário
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Alertas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Login</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Funcionário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Perfis</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Abrangências</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status do usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Último acesso</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      <AlertaPill {...usuarioAlertas(u)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatUsuarioRef(u.id, u.nome)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{u.login}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">#{u.idFuncionario}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{u.perfis.join(', ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{u.abrangencias.length ? u.abrangencias.join(', ') : '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={classNames('px-2 py-1 rounded text-xs font-semibold', u.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700')}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                      {u.bloqueado && <span className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">Bloqueado</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{u.ultimoAcesso || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" onClick={() => openEditarUsuario(u)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                          Editar
                        </button>
                        <button type="button" onClick={() => toggleAtivo(u)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                          {u.ativo ? 'Inativar' : 'Ativar'}
                        </button>
                        <button type="button" onClick={() => toggleBloqueado(u)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                          {u.bloqueado ? 'Desbloquear' : 'Bloquear'}
                        </button>
                        <button type="button" onClick={() => resetarAcesso(u)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                          Resetar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal open={modalUsuarioOpen} title={usuarioEditando ? 'Editar usuário' : 'Novo usuário'} onClose={() => setModalUsuarioOpen(false)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">ID do Funcionário</label>
                <input
                  value={usuarioForm.idFuncionario}
                  onChange={(e) => setUsuarioForm((p) => ({ ...p, idFuncionario: e.target.value }))}
                  disabled={Boolean(usuarioEditando)}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Login</label>
                <input
                  value={usuarioForm.login}
                  onChange={(e) => setUsuarioForm((p) => ({ ...p, login: e.target.value }))}
                  disabled={Boolean(usuarioEditando)}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">E-mail</label>
                <input
                  value={usuarioForm.email}
                  onChange={(e) => setUsuarioForm((p) => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full border rounded px-3 py-2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Perfis</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {allProfileCodes.map((p) => {
                    const checked = usuarioForm.perfis.includes(p);
                    return (
                      <label key={p} className="inline-flex items-center gap-2 border rounded px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setUsuarioForm((prev) => {
                              if (e.target.checked) return { ...prev, perfis: Array.from(new Set([...prev.perfis, p])) };
                              return { ...prev, perfis: prev.perfis.filter((x) => x !== p) };
                            });
                          }}
                        />
                        {p}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={usuarioForm.ativo} onChange={(e) => setUsuarioForm((p) => ({ ...p, ativo: e.target.checked }))} />
                  Ativo
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={usuarioForm.bloqueado} onChange={(e) => setUsuarioForm((p) => ({ ...p, bloqueado: e.target.checked }))} />
                  Bloqueado
                </label>
              </div>
            </div>
            {usuarioFormError && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{usuarioFormError}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalUsuarioOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={salvarUsuario} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
                Salvar
              </button>
            </div>
          </Modal>
        </div>
      )}

      {tab === 'PERFIS' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600">Perfis base e perfis da empresa.</div>
            <button type="button" onClick={openNovoPerfil} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
              Novo perfil da empresa
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nome do perfil</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {perfis.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{p.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.codigo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.tipo}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={classNames('px-2 py-1 rounded text-xs font-semibold', p.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700')}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="inline-flex gap-2">
                        {p.tipo === 'EMPRESA' && (
                          <button type="button" onClick={() => openEditarPerfil(p)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                            Editar
                          </button>
                        )}
                        <button type="button" onClick={() => duplicarPerfil(p)} className="px-3 py-1.5 border rounded hover:bg-gray-50" disabled={p.tipo === 'BASE'}>
                          Duplicar
                        </button>
                        {p.tipo === 'EMPRESA' && (
                          <button type="button" onClick={() => inativarPerfil(p)} className="px-3 py-1.5 border rounded hover:bg-gray-50">
                            {p.ativo ? 'Inativar' : 'Ativar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal open={modalPerfilOpen} title={perfilEditando ? 'Editar perfil' : 'Novo perfil'} onClose={() => setModalPerfilOpen(false)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Nome</label>
                <input value={perfilForm.nome} onChange={(e) => setPerfilForm((p) => ({ ...p, nome: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Código</label>
                <input value={perfilForm.codigo} onChange={(e) => setPerfilForm((p) => ({ ...p, codigo: e.target.value }))} className="mt-1 w-full border rounded px-3 py-2" />
              </div>
              <div className="flex items-center">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-6">
                  <input type="checkbox" checked={perfilForm.ativo} onChange={(e) => setPerfilForm((p) => ({ ...p, ativo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Permissões (1 por linha)</label>
                <textarea
                  value={perfilForm.permissoesText}
                  onChange={(e) => setPerfilForm((p) => ({ ...p, permissoesText: e.target.value }))}
                  className="mt-1 w-full border rounded px-3 py-2 min-h-32"
                  placeholder="admin.backup.view"
                />
              </div>
            </div>
            {perfilFormError && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{perfilFormError}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalPerfilOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={salvarPerfil} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
                Salvar
              </button>
            </div>
          </Modal>
        </div>
      )}

      {tab === 'PERMISSOES' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600">Permissões por perfil.</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Perfil:</span>
              <select
                value={perfilSelecionadoId}
                onChange={(e) => setPerfilSelecionadoId(Number(e.target.value))}
                className="border rounded px-3 py-2 text-sm bg-white"
              >
                {perfis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Permissão</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {permissoesPerfilAtual.map((code) => (
                  <tr key={code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{code}</td>
                  </tr>
                ))}
                {permissoesPerfilAtual.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-gray-600">
                      Nenhuma permissão cadastrada para este perfil.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ABRANGENCIAS' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-gray-600">Abrangência por empresa/obra/unidade.</div>
            <button type="button" onClick={openNovaAbrangencia} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
              Adicionar abrangência
            </button>
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Referência</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {abrangencias.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{a.usuarioNome}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{a.tipo}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {a.tipo === 'EMPRESA'
                        ? 'Empresa inteira'
                        : a.tipo === 'DIRETORIA'
                          ? `Diretoria ${a.idSetorDiretoria}`
                          : a.tipo === 'OBRA'
                            ? `Obra ${a.idObra}`
                            : `Unidade ${a.idUnidade}`}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={classNames('px-2 py-1 rounded text-xs font-semibold', a.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700')}>
                        {a.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button type="button" onClick={() => removerAbrangencia(a.id)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-red-700">
                        Inativar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal open={modalAbrangenciaOpen} title="Adicionar abrangência" onClose={() => setModalAbrangenciaOpen(false)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Usuário</label>
                <select
                  value={abrangenciaForm.usuarioId}
                  onChange={(e) => setAbrangenciaForm((p) => ({ ...p, usuarioId: Number(e.target.value) }))}
                  className="mt-1 w-full border rounded px-3 py-2 bg-white"
                >
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Tipo</label>
                <select
                  value={abrangenciaForm.tipo}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'EMPRESA' || v === 'DIRETORIA' || v === 'OBRA' || v === 'UNIDADE')
                      setAbrangenciaForm((p) => ({ ...p, tipo: v }));
                  }}
                  className="mt-1 w-full border rounded px-3 py-2 bg-white"
                >
                  <option value="EMPRESA">Empresa</option>
                  <option value="DIRETORIA">Diretoria</option>
                  <option value="OBRA">Obra</option>
                  <option value="UNIDADE">Unidade</option>
                </select>
              </div>
              <div className="flex items-center">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 mt-6">
                  <input type="checkbox" checked={abrangenciaForm.ativo} onChange={(e) => setAbrangenciaForm((p) => ({ ...p, ativo: e.target.checked }))} />
                  Ativo
                </label>
              </div>

              {abrangenciaForm.tipo === 'DIRETORIA' && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">ID da Diretoria</label>
                  <input
                    value={abrangenciaForm.diretoria}
                    onChange={(e) => setAbrangenciaForm((p) => ({ ...p, diretoria: e.target.value }))}
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="Ex.: 5"
                  />
                </div>
              )}

              {abrangenciaForm.tipo === 'OBRA' && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">ID da Obra</label>
                  <input
                    value={abrangenciaForm.obra}
                    onChange={(e) => setAbrangenciaForm((p) => ({ ...p, obra: e.target.value }))}
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="Ex.: 101"
                  />
                </div>
              )}

              {abrangenciaForm.tipo === 'UNIDADE' && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">ID da Unidade</label>
                  <input
                    value={abrangenciaForm.unidade}
                    onChange={(e) => setAbrangenciaForm((p) => ({ ...p, unidade: e.target.value }))}
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="Ex.: 12"
                  />
                </div>
              )}
            </div>
            {abrangenciaError && <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{abrangenciaError}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalAbrangenciaOpen(false)} className="px-4 py-2 border rounded hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={salvarAbrangencia} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
                Salvar
              </button>
            </div>
          </Modal>
        </div>
      )}

      {tab === 'AUDITORIA' && (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-gray-600">Auditoria de criação/alteração nas telas de governança (placeholder Sprint 0).</div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Entidade</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Resumo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditoria.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{ev.dataHora}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{ev.entidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{ev.acao}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{ev.usuario}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{ev.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
