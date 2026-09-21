import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";

export default async function AgenciesPage() {
  const agents = await prisma.agent.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">협력사 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          여기서 수정한 도메인·로고·회사정보·계좌·상담채널은 해당 협력사 마케팅사이트에 바로 반영됩니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Link
            key={a.id}
            href={`/agencies/${a.id}`}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300"
          >
            <div className="flex items-center gap-3">
              {a.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.logoUrl} alt={a.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
                  없음
                </div>
              )}
              <div>
                <p className="font-bold text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-400">{a.code}</p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-slate-500">
              <dt>도메인</dt>
              <dd className="truncate">{a.domain ?? "미설정"}</dd>
              <dt>사업자명</dt>
              <dd className="truncate">{a.bizName ?? "미설정"}</dd>
            </dl>
            {a.code === HIGHFIVE_AGENT_CODE && (
              <span className="w-fit rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                본사(직영)
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
