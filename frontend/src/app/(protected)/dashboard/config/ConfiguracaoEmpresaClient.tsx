'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { EmpresaConfigApi } from '@/lib/modules/empresa-config/api';
import type { ConfiguracaoEmpresaDTO, FuncionarioSelectDTO } from '@/lib/modules/empresa-config/types';

function formatFuncionarioRef(id: number | string, nome: string) {
  return `#${id} - ${nome}`;
}

type Modo = 'REPRESENTANTE' | 'ENCARREGADO';

export default function ConfiguracaoEmpresaClient({ modo = 'REPRESENTANTE' }: { modo?: Modo }) {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [savingRole, setSavingRole] = useState<null | 'CEO' | 'ENCARREGADO' | 'GERENTE_RH'>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingDocLayout, setSavingDocLayout] = useState(false);

  const [config, setConfig] = useState<ConfiguracaoEmpresaDTO>({
    representante: null,
    encarregadoSistema: null,
    ceo: null,
    gerenteRh: null,
  });
  const [funcionarios, setFuncionarios] = useState<FuncionarioSelectDTO[]>([]);
  const [docLayout, setDocLayout] = useState<{
    logoDataUrl: string | null;
    cabecalhoHtml: string;
    rodapeHtml: string;
    cabecalhoAlturaMm: string;
    rodapeAlturaMm: string;
  }>({ logoDataUrl: null, cabecalhoHtml: '', rodapeHtml: '', cabecalhoAlturaMm: '18', rodapeAlturaMm: '18' });

  const [modalFuncionario, setModalFuncionario] = useState<null | { target: 'CEO' | 'ENCARREGADO' | 'GERENTE_RH' }>(null);

  const [ceoFuncionarioId, setCeoFuncionarioId] = useState<number>(0);
  const [gerenteRhFuncionarioId, setGerenteRhFuncionarioId] = useState<number>(0);
  const [encarregadoFuncionarioId, setEncarregadoFuncionarioId] = useState<number>(0);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      setActionError(null);

      const [cfg, funcs] = await Promise.all([EmpresaConfigApi.obterConfiguracao(), EmpresaConfigApi.listarFuncionariosSelect()]);

      setConfig(cfg);
      setFuncionarios(funcs);
      const dl = (cfg as any)?.documentosLayout as any;
      setDocLayout({
        logoDataUrl: dl?.logoDataUrl ? String(dl.logoDataUrl) : null,
        cabecalhoHtml: dl?.cabecalhoHtml ? String(dl.cabecalhoHtml) : '',
        rodapeHtml: dl?.rodapeHtml ? String(dl.rodapeHtml) : '',
        cabecalhoAlturaMm: dl?.cabecalhoAlturaMm != null ? String(dl.cabecalhoAlturaMm) : '18',
        rodapeAlturaMm: dl?.rodapeAlturaMm != null ? String(dl.rodapeAlturaMm) : '18',
      });
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar configuração.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    const repId = typeof config.representante?.idFuncionario === 'number' ? config.representante.idFuncionario : 0;
    const ceoId = typeof config.ceo?.idFuncionario === 'number' ? config.ceo.idFuncionario : repId;
    const rhId = typeof config.gerenteRh?.idFuncionario === 'number' ? config.gerenteRh.idFuncionario : repId;
    const encId = typeof config.encarregadoSistema?.idFuncionario === 'number' ? config.encarregadoSistema.idFuncionario : repId;
    setCeoFuncionarioId(ceoId);
    setGerenteRhFuncionarioId(rhId);
    setEncarregadoFuncionarioId(encId);
  }, [config.representante?.idFuncionario, config.ceo?.idFuncionario, config.encarregadoSistema?.idFuncionario, config.gerenteRh?.idFuncionario]);

  async function salvarEncarregado(funcionarioId: number) {
    try {
      setActionError(null);
      setSavingRole('ENCARREGADO');
      await EmpresaConfigApi.definirEncarregado({ idFuncionario: funcionarioId });
      await carregar();
    } catch (e: any) {
      setActionError(e.message || 'Erro ao definir encarregado.');
    } finally {
      setSavingRole(null);
    }
  }

  async function salvarTitular(roleCode: 'CEO' | 'GERENTE_RH', funcionarioId: number) {
    try {
      setActionError(null);
      setSavingRole(roleCode);
      await EmpresaConfigApi.definirTitular({ roleCode, idFuncionario: funcionarioId });
      await carregar();
    } catch (e: any) {
      setActionError(e.message || 'Erro ao definir titular.');
    } finally {
      setSavingRole(null);
    }
  }

  async function criarFuncionarioSimples(payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) {
    const created = await EmpresaConfigApi.criarFuncionarioSimples(payload);
    await carregar();
    return created;
  }

  async function toDataUrl(file: File) {
    const blob = file;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(blob);
    });
  }

  async function salvarDocumentosLayout() {
    try {
      setActionError(null);
      setSavingDocLayout(true);
      await EmpresaConfigApi.atualizarDocumentosLayout({
        logoDataUrl: docLayout.logoDataUrl || null,
        cabecalhoHtml: docLayout.cabecalhoHtml || null,
        rodapeHtml: docLayout.rodapeHtml || null,
        cabecalhoAlturaMm: docLayout.cabecalhoAlturaMm ? Number(docLayout.cabecalhoAlturaMm) : null,
        rodapeAlturaMm: docLayout.rodapeAlturaMm ? Number(docLayout.rodapeAlturaMm) : null,
      });
      await carregar();
    } catch (e: any) {
      setActionError(e.message || 'Erro ao salvar layout de documentos.');
    } finally {
      setSavingDocLayout(false);
    }
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Carregando configuração...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>;
  }

  const rep = config.representante;
  const enc = config.encarregadoSistema;
  const ceo = config.ceo;
  const gerenteRh = config.gerenteRh;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Configuração da Empresa</h1>
        <p className="text-sm text-slate-500">Definição de titulares (CEO, Encarregado do Sistema e RH) e governança da empresa.</p>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {actionError}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Titulares iniciais</h2>
          <div className="text-sm text-slate-500">Defina quem ocupará as funções-chave da empresa.</div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {modo === 'REPRESENTANTE' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">CEO</div>
                <div className="mt-1 text-xs text-slate-500">Visão executiva e tomada de decisão.</div>
                <div className="mt-3 flex gap-2">
                  <select className="input" value={ceoFuncionarioId || ''} onChange={(e) => setCeoFuncionarioId(e.target.value ? Number(e.target.value) : 0)}>
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'CEO' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !ceoFuncionarioId}
                    type="button"
                    onClick={() => salvarTitular('CEO', ceoFuncionarioId)}
                  >
                    {savingRole === 'CEO' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">{ceo?.idFuncionario ? `Atual: ${formatFuncionarioRef(ceo.idFuncionario, ceo.nome)}` : 'Atual: não definido'}</div>
              </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-800">CEO</div>
                  <div className="mt-1 text-xs text-slate-500">Visão executiva e tomada de decisão.</div>
                  <div className="mt-2 text-xs text-slate-600">{ceo?.idFuncionario ? `Atual: ${formatFuncionarioRef(ceo.idFuncionario, ceo.nome)}` : 'Atual: não definido'}</div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">Encarregado do Sistema</div>
                <div className="mt-1 text-xs text-slate-500">Usuários, perfis e permissões.</div>
                <div className="mt-3 flex gap-2">
                  <select
                    className="input"
                    value={encarregadoFuncionarioId || ''}
                    onChange={(e) => setEncarregadoFuncionarioId(e.target.value ? Number(e.target.value) : 0)}
                  >
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'ENCARREGADO' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !encarregadoFuncionarioId}
                    type="button"
                    onClick={() => salvarEncarregado(encarregadoFuncionarioId)}
                  >
                    {savingRole === 'ENCARREGADO' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">{enc?.idFuncionario ? `Atual: ${formatFuncionarioRef(enc.idFuncionario, enc.nome)}` : 'Atual: não definido'}</div>
              </div>

              {modo === 'REPRESENTANTE' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-800">Gerente de RH</div>
                <div className="mt-1 text-xs text-slate-500">Cadastro funcional e gestão de pessoas.</div>
                <div className="mt-3 flex gap-2">
                  <select
                    className="input"
                    value={gerenteRhFuncionarioId || ''}
                    onChange={(e) => setGerenteRhFuncionarioId(e.target.value ? Number(e.target.value) : 0)}
                  >
                    <option value="">Selecionar funcionário</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {formatFuncionarioRef(f.id, f.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button" onClick={() => setModalFuncionario({ target: 'GERENTE_RH' })}>
                    Cadastrar funcionário
                  </button>
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-60"
                    disabled={Boolean(savingRole) || !gerenteRhFuncionarioId}
                    type="button"
                    onClick={() => salvarTitular('GERENTE_RH', gerenteRhFuncionarioId)}
                  >
                    {savingRole === 'GERENTE_RH' ? 'Salvando...' : 'Definir'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  {gerenteRh?.idFuncionario ? `Atual: ${formatFuncionarioRef(gerenteRh.idFuncionario, gerenteRh.nome)}` : 'Atual: não definido'}
                </div>
              </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-800">Gerente de RH</div>
                  <div className="mt-1 text-xs text-slate-500">Cadastro funcional e gestão de pessoas.</div>
                  <div className="mt-2 text-xs text-slate-600">
                    {gerenteRh?.idFuncionario ? `Atual: ${formatFuncionarioRef(gerenteRh.idFuncionario, gerenteRh.nome)}` : 'Atual: não definido'}
                  </div>
                </div>
              )}
            </div>
        </div>

      {modo === 'REPRESENTANTE' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Documentos da empresa</h2>
            <div className="text-sm text-slate-500">Logo, cabeçalho e rodapé.</div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-800">Logo</div>
              <div className="mt-1 text-xs text-slate-500">Usado no cabeçalho de documentos.</div>
              {docLayout.logoDataUrl ? (
                <div className="mt-3 rounded-lg border bg-white p-3">
                  <img src={docLayout.logoDataUrl} alt="Logo" className="max-h-16 w-auto" />
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                      type="button"
                      onClick={() => setDocLayout((p) => ({ ...p, logoDataUrl: null }))}
                      disabled={savingDocLayout}
                    >
                      Remover
                    </button>
                    <label className="rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                      Trocar
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={savingDocLayout}
                        onChange={async (e) => {
                          const f = (e.target.files || [])[0] || null;
                          if (!f) return;
                          try {
                            const dataUrl = await toDataUrl(f);
                            setDocLayout((p) => ({ ...p, logoDataUrl: dataUrl }));
                          } catch (err: any) {
                            setActionError(err?.message || 'Erro ao carregar logo.');
                          } finally {
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="inline-flex rounded-lg border bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                    Enviar logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={savingDocLayout}
                      onChange={async (e) => {
                        const f = (e.target.files || [])[0] || null;
                        if (!f) return;
                        try {
                          const dataUrl = await toDataUrl(f);
                          setDocLayout((p) => ({ ...p, logoDataUrl: dataUrl }));
                        } catch (err: any) {
                          setActionError(err?.message || 'Erro ao carregar logo.');
                        } finally {
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <RichDocLayoutEditor docLayout={docLayout} setDocLayout={setDocLayout} onSave={salvarDocumentosLayout} saving={savingDocLayout} />
          </div>
        </div>
      ) : null}

      {modalFuncionario && (
        <Modal titulo="Cadastrar funcionário (mínimo)" onClose={() => setModalFuncionario(null)}>
          <FuncionarioMinimoForm
            salvando={salvando}
            onCancel={() => setModalFuncionario(null)}
            onSave={async (payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) => {
              try {
                setSalvando(true);
                const created = await criarFuncionarioSimples(payload);
                const newId = Number((created as any)?.id || 0);
                if (modalFuncionario.target === 'CEO') setCeoFuncionarioId(newId);
                if (modalFuncionario.target === 'ENCARREGADO') setEncarregadoFuncionarioId(newId);
                if (modalFuncionario.target === 'GERENTE_RH') setGerenteRhFuncionarioId(newId);
                setModalFuncionario(null);
              } catch (e: any) {
                setActionError(e.message || 'Erro ao cadastrar funcionário.');
              } finally {
                setSalvando(false);
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function RichDocLayoutEditor({
  docLayout,
  setDocLayout,
  onSave,
  saving,
}: {
  docLayout: { logoDataUrl: string | null; cabecalhoHtml: string; rodapeHtml: string; cabecalhoAlturaMm: string; rodapeAlturaMm: string };
  setDocLayout: Dispatch<
    SetStateAction<{ logoDataUrl: string | null; cabecalhoHtml: string; rodapeHtml: string; cabecalhoAlturaMm: string; rodapeAlturaMm: string }>
  >;
  onSave: () => void;
  saving: boolean;
}) {
  const [active, setActive] = useState<'CABECALHO' | 'RODAPE'>('CABECALHO');
  const cabRef = (useState<{ current: HTMLDivElement | null }>({ current: null })[0]);
  const rodRef = (useState<{ current: HTMLDivElement | null }>({ current: null })[0]);

  function currentRef() {
    return active === 'CABECALHO' ? cabRef : rodRef;
  }

  function applySpanStyle(style: Record<string, string>) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range) return;
    const span = document.createElement('span');
    for (const [k, v] of Object.entries(style)) span.style.setProperty(k, v);
    try {
      if (range.collapsed) {
        span.appendChild(document.createTextNode('\u200b'));
        range.insertNode(span);
        sel.removeAllRanges();
        const r2 = document.createRange();
        r2.setStart(span.firstChild as any, 1);
        r2.setEnd(span.firstChild as any, 1);
        sel.addRange(r2);
      } else {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        sel.removeAllRanges();
        const r2 = document.createRange();
        r2.selectNodeContents(span);
        sel.addRange(r2);
      }
    } catch {}
  }

  function insertToken(token: string) {
    const ref = currentRef();
    ref.current?.focus();
    try {
      document.execCommand('insertText', false, token);
    } catch {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.insertNode(document.createTextNode(token));
    }
  }

  function syncFromDom() {
    const cab = cabRef.current ? cabRef.current.innerHTML : docLayout.cabecalhoHtml;
    const rod = rodRef.current ? rodRef.current.innerHTML : docLayout.rodapeHtml;
    setDocLayout((p) => ({ ...p, cabecalhoHtml: cab, rodapeHtml: rod }));
  }

  const toolbarBtn = 'rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-2">
          <button
            className={`${toolbarBtn} ${active === 'CABECALHO' ? 'border-blue-600 text-blue-700' : ''}`}
            type="button"
            onClick={() => setActive('CABECALHO')}
            disabled={saving}
          >
            Cabeçalho
          </button>
          <button
            className={`${toolbarBtn} ${active === 'RODAPE' ? 'border-blue-600 text-blue-700' : ''}`}
            type="button"
            onClick={() => setActive('RODAPE')}
            disabled={saving}
          >
            Rodapé
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm text-slate-600">Altura (mm)</div>
          <input
            className="input w-20 bg-white"
            value={docLayout.cabecalhoAlturaMm}
            onChange={(e) => setDocLayout((p) => ({ ...p, cabecalhoAlturaMm: e.target.value }))}
            disabled={saving}
          />
          <input className="input w-20 bg-white" value={docLayout.rodapeAlturaMm} onChange={(e) => setDocLayout((p) => ({ ...p, rodapeAlturaMm: e.target.value }))} disabled={saving} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('bold'), syncFromDom())} disabled={saving}>
          Negrito
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('italic'), syncFromDom())} disabled={saving}>
          Itálico
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('underline'), syncFromDom())} disabled={saving}>
          Sublinhado
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('strikeThrough'), syncFromDom())} disabled={saving}>
          Tachado
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('justifyLeft'), syncFromDom())} disabled={saving}>
          Alinhar à esquerda
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('justifyCenter'), syncFromDom())} disabled={saving}>
          Centralizar
        </button>
        <button className={toolbarBtn} type="button" onClick={() => (document.execCommand('justifyRight'), syncFromDom())} disabled={saving}>
          Alinhar à direita
        </button>

        <select
          className="input bg-white"
          defaultValue="Arial"
          onChange={(e) => {
            applySpanStyle({ 'font-family': e.target.value });
            syncFromDom();
          }}
          disabled={saving}
        >
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
        </select>

        <select
          className="input bg-white"
          defaultValue="12"
          onChange={(e) => {
            applySpanStyle({ 'font-size': `${e.target.value}px` });
            syncFromDom();
          }}
          disabled={saving}
        >
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="16">16</option>
        </select>

        <input
          type="color"
          className="h-10 w-12 rounded border bg-white px-1"
          defaultValue="#0f172a"
          onChange={(e) => {
            applySpanStyle({ color: e.target.value });
            syncFromDom();
          }}
          disabled={saving}
        />

        <button className={toolbarBtn} type="button" onClick={() => insertToken('{{DATA_HORA}}')} disabled={saving}>
          Inserir data
        </button>
        <button className={toolbarBtn} type="button" onClick={() => insertToken('{{PAGINA}}')} disabled={saving}>
          Inserir pág.
        </button>
        <button className={toolbarBtn} type="button" onClick={() => insertToken('{{TOTAL_PAGINAS}}')} disabled={saving}>
          Inserir total
        </button>
        <button className={toolbarBtn} type="button" onClick={() => insertToken('{{LOGO}}')} disabled={saving}>
          Inserir logo
        </button>
      </div>

      <div className="space-y-3">
        <div className={`${active === 'CABECALHO' ? '' : 'hidden'}`}>
          <div
            ref={(el) => {
              cabRef.current = el;
            }}
            className="min-h-[120px] rounded-lg border bg-white p-3 text-sm"
            contentEditable={!saving}
            suppressContentEditableWarning
            onFocus={() => setActive('CABECALHO')}
            onBlur={() => syncFromDom()}
            dangerouslySetInnerHTML={{ __html: docLayout.cabecalhoHtml || '' }}
          />
        </div>
        <div className={`${active === 'RODAPE' ? '' : 'hidden'}`}>
          <div
            ref={(el) => {
              rodRef.current = el;
            }}
            className="min-h-[120px] rounded-lg border bg-white p-3 text-sm"
            contentEditable={!saving}
            suppressContentEditableWarning
            onFocus={() => setActive('RODAPE')}
            onBlur={() => syncFromDom()}
            dangerouslySetInnerHTML={{ __html: docLayout.rodapeHtml || '' }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          onClick={() => {
            syncFromDom();
            onSave();
          }}
          disabled={saving}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="font-medium text-slate-800">{valor}</div>
    </div>
  );
}

function Modal({ titulo, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white text-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button onClick={onClose} className="text-slate-700" type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FuncionarioMinimoForm({
  onCancel,
  onSave,
  salvando,
}: {
  onCancel: () => void;
  onSave: (payload: { nomeCompleto: string; email?: string | null; cargo?: string | null }) => void;
  salvando: boolean;
}) {
  const [form, setForm] = useState({ nomeCompleto: '', email: '', cargo: '' });

  return (
    <div className="space-y-4">
      <input
        className="input"
        placeholder="Nome completo"
        value={form.nomeCompleto}
        onChange={(e) => setForm((p) => ({ ...p, nomeCompleto: e.target.value }))}
      />
      <input className="input" placeholder="E-mail (opcional)" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
      <input className="input" placeholder="Função / cargo (opcional)" value={form.cargo} onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value }))} />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:text-slate-400" type="button">
          Cancelar
        </button>
        <button
          disabled={salvando}
          onClick={() => onSave({ nomeCompleto: form.nomeCompleto, email: form.email || null, cargo: form.cargo || null })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
