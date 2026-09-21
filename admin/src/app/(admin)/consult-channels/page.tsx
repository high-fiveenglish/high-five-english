import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { ChannelRow } from "./ChannelRow";

export default async function ConsultChannelsPage() {
  // 이 화면은 본사(직영) 채널만 다룬다 — 협력사별 상담채널은 "협력사 관리" 화면에서
  // 함께 관리한다(agentId가 null인 행만 여기 보임).
  const channels = await prisma.consultChannel.findMany({
    where: { siteId: DEFAULT_SITE_ID, agentId: null },
    orderBy: { id: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">상담채널 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          마케팅 사이트 "상담문의" 화면에 노출되는 연락처입니다. 셀을 수정하고 저장을 눌러야 반영됩니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">채널</th>
              <th className="px-2 py-3">표시 이름</th>
              <th className="px-2 py-3">아이디/연락처</th>
              <th className="px-2 py-3">URL</th>
              <th className="px-2 py-3 text-center">노출</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <ChannelRow key={c.id} channel={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
