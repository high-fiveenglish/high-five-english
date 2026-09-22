import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AgentBrandingForm } from "./AgentBrandingForm";
import { AgentConsultChannelField } from "./AgentConsultChannelField";

export default async function EditAgencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);

  const [agent, channels] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId } }),
    prisma.consultChannel.findMany({ where: { agentId, code: { in: ["kakao", "wechat"] } } }),
  ]);
  if (!agent) notFound();

  const kakao = channels.find((c) => c.code === "kakao");
  const wechat = channels.find((c) => c.code === "wechat");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">협력사 관리 — {agent.name}</h1>
      <AgentBrandingForm agent={agent} />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">상담채널 (이 사이트 전용)</h2>
        <p className="-mt-2 text-xs text-slate-500">비워두면 이 사이트에는 표시되지 않습니다(본사 값으로 대체되지 않음).</p>
        <AgentConsultChannelField
          agentId={agent.id}
          code="kakao"
          label="카카오톡"
          defaultValue={kakao?.value ?? ""}
          defaultUrl={kakao?.url ?? ""}
        />
        <AgentConsultChannelField
          agentId={agent.id}
          code="wechat"
          label="위챗"
          defaultValue={wechat?.value ?? ""}
          defaultUrl={wechat?.url ?? ""}
        />
      </div>
    </div>
  );
}
