import { HomeNoticeForm } from "../HomeNoticeForm";
import { createHomeNotice } from "../actions";

export default async function NewHomeNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { agentId } = await searchParams;
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">홈페이지 공지 작성</h1>
      <HomeNoticeForm action={createHomeNotice} agentId={agentId ? Number(agentId) : null} submitLabel="등록" />
    </div>
  );
}
