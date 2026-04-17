"use client";

import { useRouter } from "next/navigation";
import LicitacoesPicker from "../_components/LicitacoesPicker";

export default function AdminLicitacoesAnaliseAtendimentoPage() {
  const router = useRouter();
  return (
    <LicitacoesPicker
      title="Administração → Licitações → Análise de Atendimento"
      subtitle="Validação automática de atendimento (críticos, alertas e pendências)."
      actionLabel="Abrir validação"
      onOpen={(idLicitacao) => router.push(`/dashboard/engenharia/licitacoes/${idLicitacao}?tab=VALIDACAO`)}
    />
  );
}

