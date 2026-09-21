import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { ReservationCreateForm } from "./ReservationCreateForm";

const RESERVATION_AGENT_CODES = [HIGHFIVE_AGENT_CODE, "mnmenglish", "synergyenglish"];

export default async function NewReservationPage() {
  const [teachers, agents] = await Promise.all([
    prisma.teacher.findMany({
      where: { siteId: DEFAULT_SITE_ID, accountStatus: "ACTIVE" },
      orderBy: [{ priority: "desc" }, { realName: "asc" }],
      select: { id: true, realName: true },
    }),
    prisma.agent.findMany({ where: { siteId: DEFAULT_SITE_ID, code: { in: RESERVATION_AGENT_CODES } } }),
  ]);
  const sortedAgents = RESERVATION_AGENT_CODES.map((code) => agents.find((a) => a.code === code)).filter(
    (a): a is NonNullable<typeof a> => !!a,
  );
  const defaultAgent = agents.find((a) => a.code === HIGHFIVE_AGENT_CODE);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 자리 예약 등록</h1>
      <ReservationCreateForm
        teachers={teachers.map((t) => ({ id: t.id, name: t.realName }))}
        agents={sortedAgents.map((a) => ({ id: a.id, name: a.name }))}
        defaultAgentId={defaultAgent?.id ?? null}
      />
    </div>
  );
}
