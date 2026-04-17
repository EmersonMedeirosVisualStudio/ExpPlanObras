"use client";

import { useRouter } from "next/navigation";
import LicitacoesPicker from "../_components/LicitacoesPicker";

export default function AdminLicitacoesFasesPage() {
  const router = useRouter();
  return (
    <LicitacoesPicker
      title="Administração → Licitações → Fases e Situação"
      subtitle="Acompanhe mudanças e eventos da licitação (andamento)."
      actionLabel="Abrir andamento"
      onOpen={(idLicitacao) => router.push(`/dashboard/engenharia/licitacoes/${idLicitacao}?tab=ANDAMENTO`)}
    />
  );
}

