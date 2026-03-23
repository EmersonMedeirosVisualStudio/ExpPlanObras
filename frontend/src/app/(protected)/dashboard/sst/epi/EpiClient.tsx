'use client';

import { useEffect, useMemo, useState } from 'react';
import { EpiApi } from '@/lib/modules/epi/api';
import type { EpiCatalogoDTO, EpiFichaDetalheDTO, EpiFichaResumoDTO, TipoLocal } from '@/lib/modules/epi/types';

export default function EpiClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogo, setCatalogo] = useState<EpiCatalogoDTO[]>([]);
  const [fichas, setFichas] = useState<EpiFichaResumoDTO[]>([]);
  const [selectedFichaId, setSelectedFichaId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EpiFichaDetalheDTO | null>(null);

  const selectedResumo = useMemo(() => fichas.find((f) => f.id === selectedFichaId) || null, [fichas, selectedFichaId]);

  async function carregarTudo() {
    try {
      setLoading(true);
      setError(null);
      const [cat, fs] = await Promise.all([EpiApi.listarCatalogo(''), EpiApi.listarFichas({})]);
      setCatalogo(Array.isArray(cat) ? cat : []);
      setFichas(Array.isArray(fs) ? fs : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar EPI.');
    } finally {
      setLoading(false);
    }
  }

  async function abrirFicha(id: number) {
    try {
      setError(null);
      const d = await EpiApi.obterFicha(id);
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar ficha.');
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    if (selectedFichaId) abrirFicha(selectedFichaId);
  }, [selectedFichaId]);

  async function criarEpi() {
    const nomeEpi = prompt('Nome do EPI:') || '';
    if (!nomeEpi.trim()) return;
    const categoriaEpi = prompt('Categoria do EPI (ex.: CAPACETE, LUVA, BOTINA):') || '';
    if (!categoriaEpi.trim()) return;
    const caNumero = (prompt('CA número (opcional):') || '').trim();
    const caValidade = (prompt('CA validade (YYYY-MM-DD) (opcional):') || '').trim();

    try {
      setError(null);
      await EpiApi.criarCatalogo({ nomeEpi: nomeEpi.trim(), categoriaEpi: categoriaEpi.trim(), caNumero: caNumero || null, caValidade: caValidade || null });
      const cat = await EpiApi.listarCatalogo('');
      setCatalogo(Array.isArray(cat) ? cat : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar EPI.');
    }
  }

  async function novaFicha() {
    const tipoLocal = (prompt('Tipo local: OBRA ou UNIDADE') || 'OBRA').toUpperCase() as TipoLocal;
    const idRef = Number(prompt(`ID da ${tipoLocal === 'OBRA' ? 'obra' : 'unidade'}:`) || '');
    if (!Number.isFinite(idRef)) return;

    try {
      setError(null);
      const trabalhadores = await EpiApi.listarTrabalhadores(tipoLocal, tipoLocal === 'OBRA' ? idRef : undefined, tipoLocal === 'UNIDADE' ? idRef : undefined);
      const escolhido = Array.isArray(trabalhadores) ? trabalhadores[0] : null;
      if (!escolhido) throw new Error('Nenhum trabalhador disponível');

      const payload: any = {
        tipoDestinatario: escolhido.tipoDestinatario,
        tipoLocal,
        dataEmissao: new Date().toISOString().slice(0, 10),
        idObra: tipoLocal === 'OBRA' ? idRef : null,
        idUnidade: tipoLocal === 'UNIDADE' ? idRef : null,
        entregaOrientada: true,
        assinaturaDestinatarioObrigatoria: true,
      };
      if (escolhido.tipoDestinatario === 'FUNCIONARIO') payload.idFuncionario = escolhido.id;
      else payload.idTerceirizadoTrabalhador = escolhido.id;

      const res = await EpiApi.criarFicha(payload);
      const fs = await EpiApi.listarFichas({});
      setFichas(Array.isArray(fs) ? fs : []);
      setSelectedFichaId(res.id);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar ficha.');
    }
  }

  async function entregar() {
    if (!selectedFichaId) return;
    const idEpi = Number(prompt('ID do EPI (catálogo):') || '');
    if (!Number.isFinite(idEpi)) return;
    const dataEntrega = (prompt('Data entrega (YYYY-MM-DD):') || '').trim();
    if (!dataEntrega) return;
    const quantidadeEntregue = Number(prompt('Quantidade entregue (padrão 1):') || '1');
    const tamanho = (prompt('Tamanho (se aplicável):') || '').trim();
    const excecaoCaVencido = (prompt('Exceção CA vencido? (S/N)') || 'N').trim().toUpperCase() === 'S';
    const motivoMovimentacao = excecaoCaVencido ? (prompt('Motivo da exceção:') || '').trim() : '';

    try {
      setError(null);
      await EpiApi.entregarItem(selectedFichaId, {
        idEpi,
        dataEntrega,
        quantidadeEntregue,
        tamanho: tamanho || null,
        excecaoCaVencido,
        motivoMovimentacao: motivoMovimentacao || null,
      });
      await abrirFicha(selectedFichaId);
    } catch (e: any) {
      setError(e?.message || 'Erro ao registrar entrega.');
    }
  }

  async function devolver() {
    const idItem = Number(prompt('ID do item da ficha:') || '');
    if (!Number.isFinite(idItem)) return;
    const dataDevolucao = (prompt('Data devolução (YYYY-MM-DD):') || '').trim();
    if (!dataDevolucao) return;
    const condicaoDevolucao = (prompt('Condição (BOA/USADO/DANIFICADO/INSERVIVEL) (opcional):') || '').trim();
    const higienizado = (prompt('Higienizado? (S/N)') || 'N').trim().toUpperCase() === 'S';

    try {
      setError(null);
      await EpiApi.registrarDevolucao(idItem, { dataDevolucao, condicaoDevolucao: condicaoDevolucao || null, higienizado });
      if (selectedFichaId) await abrirFicha(selectedFichaId);
    } catch (e: any) {
      setError(e?.message || 'Erro ao registrar devolução.');
    }
  }

  async function inspecionar() {
    const idItem = Number(prompt('ID do item da ficha:') || '');
    if (!Number.isFinite(idItem)) return;
    const dataInspecao = (prompt('Data inspeção (YYYY-MM-DD):') || '').trim();
    if (!dataInspecao) return;
    const resultado = (prompt('Resultado (APROVADO/REPROVADO):') || '').trim().toUpperCase() as any;

    try {
      setError(null);
      await EpiApi.inspecionar(idItem, { dataInspecao, resultado });
    } catch (e: any) {
      setError(e?.message || 'Erro ao registrar inspeção.');
    }
  }

  async function assinarFicha() {
    if (!detail) return;
    const tipoAssinatura = (prompt('Tipo assinatura (ASSINATURA_TELA/PIN/QR_CODE):') || 'ASSINATURA_TELA').trim().toUpperCase();
    const pin = tipoAssinatura === 'PIN' ? (prompt('PIN:') || '').trim() : '';
    if (tipoAssinatura === 'PIN' && !pin) return;

    try {
      setError(null);
      await EpiApi.assinarFicha(detail.id, { tipoAssinatura, pin: pin || undefined });
      await abrirFicha(detail.id);
      const fs = await EpiApi.listarFichas({});
      setFichas(Array.isArray(fs) ? fs : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao assinar ficha.');
    }
  }

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando EPI...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Ficha de EPI</h1>
          <p className="text-sm text-slate-600">Entrega/devolução, inspeção e assinatura do destinatário.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={criarEpi} className="rounded-lg border px-4 py-2 text-sm" type="button">
            Novo EPI
          </button>
          <button onClick={novaFicha} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
            Nova ficha
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-3 text-lg font-semibold">Fichas</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Destinatário</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {fichas.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-t cursor-pointer ${selectedFichaId === f.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedFichaId(f.id)}
                  >
                    <td className="px-3 py-2">{f.dataEmissao}</td>
                    <td className="px-3 py-2">{f.destinatarioNome || `${f.tipoDestinatario} ${f.idFuncionario || f.idTerceirizadoTrabalhador || ''}`}</td>
                    <td className="px-3 py-2">{f.statusFicha}</td>
                  </tr>
                ))}
                {fichas.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma ficha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Detalhe</h2>
            {detail && (
              <div className="flex gap-2 flex-wrap">
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={entregar}>
                  Entregar item
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={devolver}>
                  Registrar devolução
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={inspecionar}>
                  Registrar inspeção
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={assinarFicha} disabled={Boolean(detail.idAssinaturaDestinatario)}>
                  Assinar ficha
                </button>
              </div>
            )}
          </div>

          {!selectedResumo || !detail ? (
            <div className="text-sm text-slate-500">Selecione uma ficha.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div>
                  <span className="text-slate-500">Status:</span> {detail.statusFicha}
                </div>
                <div className="mt-1 text-slate-600">
                  {detail.tipoLocal} {detail.idObra || detail.idUnidade || ''} • {detail.tipoDestinatario}
                </div>
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">EPI</th>
                      <th className="px-3 py-2">Entrega</th>
                      <th className="px-3 py-2">Prev. troca</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.itens.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{i.nomeEpi}</div>
                          <div className="text-xs text-slate-500">
                            {i.categoriaEpi}
                            {i.caNumero ? ` • CA ${i.caNumero}` : ''}
                            {i.caValidade ? ` • Val ${i.caValidade}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{i.dataEntrega}</div>
                          <div className="text-xs text-slate-500">
                            Qtde {i.quantidadeEntregue}
                            {i.tamanho ? ` • Tam ${i.tamanho}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2">{i.dataPrevistaTroca || '-'}</td>
                        <td className="px-3 py-2">{i.statusItem}</td>
                      </tr>
                    ))}
                    {detail.itens.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          Nenhum item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Catálogo</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Categoria</th>
                <th className="px-3 py-2">CA</th>
                <th className="px-3 py-2">Validade</th>
                <th className="px-3 py-2">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {catalogo.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2">{e.nomeEpi}</td>
                  <td className="px-3 py-2">{e.categoriaEpi}</td>
                  <td className="px-3 py-2">{e.caNumero || '-'}</td>
                  <td className="px-3 py-2">{e.caValidade || '-'}</td>
                  <td className="px-3 py-2">{e.ativo ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
              {catalogo.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Nenhum EPI cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
