'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Save, X } from 'lucide-react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioEnderecoDTO } from '@/lib/modules/funcionarios/types';

function safeInternalPath(v: string | null) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!s.startsWith('/')) return null;
  if (s.startsWith('//')) return null;
  return s;
}

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  if (!d) return '';
  const p1 = d.slice(0, 5);
  const p2 = d.slice(5, 8);
  return p2 ? `${p1}-${p2}` : p1;
}

type FormEndereco = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  observacao: string;
  principal: boolean;
};

const vazio: FormEndereco = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  observacao: '',
  principal: true,
};

export default function EnderecosRhClient() {
  const router = useRouter();
  const params = useParams<{ tipo: string; id: string }>();
  const sp = useSearchParams();

  const tipoPath = String(params?.tipo || '').toLowerCase();
  const idFuncionario = Number(params?.id || 0);
  const returnTo = useMemo(() => safeInternalPath(sp.get('returnTo') || null), [sp]);
  const backHref = returnTo || '/dashboard/rh/cadastros';

  const [nome, setNome] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enderecos, setEnderecos] = useState<FuncionarioEnderecoDTO[]>([]);

  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<FormEndereco>(vazio);

  const carregar = useCallback(async () => {
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) return;
    if (!tipoPath.includes('funcionario')) return;
    try {
      setLoading(true);
      setErro(null);
      const f = await FuncionariosApi.obter(idFuncionario);
      setNome(String((f as any)?.nomeCompleto || ''));
      const list = await FuncionariosApi.listarEnderecos(idFuncionario).catch(() => []);
      setEnderecos(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar endereços');
      setEnderecos([]);
    } finally {
      setLoading(false);
    }
  }, [idFuncionario, tipoPath]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!tipoPath.includes('funcionario')) {
    return (
      <div className="p-6 space-y-4 text-slate-900">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Endereços</h1>
            <div className="text-sm text-slate-600">Disponível apenas para funcionário.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Endereços do funcionário</h1>
            <p className="text-sm text-slate-600">{nome ? nome : `#${idFuncionario}`}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={carregar}
            disabled={loading}
          >
            Recarregar
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 inline-flex items-center gap-2"
            onClick={() => {
              setForm(vazio);
              setModal(true);
            }}
          >
            <Plus size={16} />
            Novo endereço
          </button>
        </div>
      </div>

      {erro ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Lista</div>
          <div className="text-xs text-slate-600">{enderecos.length} endereço(s)</div>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-600">Carregando…</div>
        ) : enderecos.length ? (
          <div className="divide-y">
            {enderecos.map((e) => (
              <div key={e.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {e.logradouro ? e.logradouro : '-'}
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
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Principal</div>
                  ) : (
                    <div className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-700">Secundário</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-600">Nenhum endereço cadastrado.</div>
        )}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white text-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Novo endereço</h2>
              <button onClick={() => (!salvando ? setModal(false) : null)} className="text-slate-700" type="button">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-600 mb-1">CEP</div>
                  <input
                    className="input"
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(ev) => setForm((p) => ({ ...p, cep: ev.target.value }))}
                    onBlur={() => setForm((p) => ({ ...p, cep: formatCep(p.cep) }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">UF</div>
                  <input className="input" placeholder="UF" value={form.uf} onChange={(ev) => setForm((p) => ({ ...p, uf: ev.target.value.toUpperCase() }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-600 mb-1">Logradouro</div>
                  <input className="input" value={form.logradouro} onChange={(ev) => setForm((p) => ({ ...p, logradouro: ev.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">Número</div>
                  <input className="input" value={form.numero} onChange={(ev) => setForm((p) => ({ ...p, numero: ev.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">Complemento</div>
                  <input className="input" value={form.complemento} onChange={(ev) => setForm((p) => ({ ...p, complemento: ev.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">Bairro</div>
                  <input className="input" value={form.bairro} onChange={(ev) => setForm((p) => ({ ...p, bairro: ev.target.value }))} />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">Cidade</div>
                  <input className="input" value={form.cidade} onChange={(ev) => setForm((p) => ({ ...p, cidade: ev.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-slate-600 mb-1">Observação</div>
                  <input className="input" value={form.observacao} onChange={(ev) => setForm((p) => ({ ...p, observacao: ev.target.value }))} />
                </div>
                <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Principal</div>
                    <div className="text-xs text-slate-600">Se marcado, define este como endereço principal do funcionário</div>
                  </div>
                  <input type="checkbox" checked={form.principal} onChange={(ev) => setForm((p) => ({ ...p, principal: ev.target.checked }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                  disabled={salvando}
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60 inline-flex items-center gap-2"
                  disabled={salvando}
                  onClick={async () => {
                    try {
                      setSalvando(true);
                      await FuncionariosApi.criarEndereco(idFuncionario, {
                        cep: form.cep ? form.cep : null,
                        logradouro: form.logradouro ? form.logradouro : null,
                        numero: form.numero ? form.numero : null,
                        complemento: form.complemento ? form.complemento : null,
                        bairro: form.bairro ? form.bairro : null,
                        cidade: form.cidade ? form.cidade : null,
                        uf: form.uf ? form.uf : null,
                        observacao: form.observacao ? form.observacao : null,
                        principal: !!form.principal,
                      } as any);
                      setModal(false);
                      await carregar();
                    } catch (e: any) {
                      setErro(e?.message || 'Erro ao salvar endereço');
                    } finally {
                      setSalvando(false);
                    }
                  }}
                >
                  <Save size={16} />
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

