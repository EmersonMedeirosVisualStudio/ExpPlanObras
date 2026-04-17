"use client";

import { useRouter } from "next/navigation";
import LicitacoesPicker from "../_components/LicitacoesPicker";

export default function AdminLicitacoesExigenciasPage() {
  const router = useRouter();
  return (
    <LicitacoesPicker
      title="Administração → Licitações → Exigências (Checklist)"
      subtitle="Checklist inteligente por licitação (documentos, acervo e itens obrigatórios)."
      actionLabel="Abrir checklist"
      onOpen={(idLicitacao) => router.push(`/dashboard/engenharia/licitacoes/${idLicitacao}?tab=CHECKLIST`)}
    />
  );
}

