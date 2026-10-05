import { notFound } from "next/navigation";
import { parseRouteId } from "@/lib/routeId";
import { HomeNoticeForm } from "../HomeNoticeForm";
import { createHomeNotice } from "../actions";

export default async function NewHomeNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { agentId } = await searchParams;
  const agentIdValue = agentId ? parseRouteId(agentId) : null;
  if (agentId && agentIdValue === null) notFound();
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">홈페이지 공지 작성</h1>
      <HomeNoticeForm action={createHomeNotice} agentId={agentIdValue} submitLabel="등록" />
    </div>
  );
}
