import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { StudentCreateForm } from "./StudentCreateForm";
import { requireBackofficeActor } from "@/lib/backofficeAuth";

// 학생 등록 시점의 협력사 선택은 직영/맘앤맘/시너지 3곳만 노출한다(다른 협력사는
// 실무상 이 화면에서 바로 고를 일이 없어, 목록에 섞이면 오히려 실수를 유발한다).
const REGISTRATION_AGENT_CODES = [HIGHFIVE_AGENT_CODE, "mnmenglish", "synergyenglish"];

export default async function NewStudentPage() {
  const actor = await requireBackofficeActor();
  const agents = await prisma.agent.findMany({
    where: { siteId: DEFAULT_SITE_ID, code: { in: REGISTRATION_AGENT_CODES } },
  });
  // AGENT는 협력사 선택 자체가 의미 없다(서버가 항상 본인 협력사로 강제) — 자기
  // 협력사 하나만 보여준다.
  const sortedAgents =
    actor.role === "AGENT"
      ? agents.filter((a) => a.id === actor.agentId)
      : REGISTRATION_AGENT_CODES.map((code) => agents.find((a) => a.code === code)).filter(
          (a): a is NonNullable<typeof a> => !!a,
        );
  const defaultAgent = actor.role === "AGENT" ? sortedAgents[0] : agents.find((a) => a.code === HIGHFIVE_AGENT_CODE);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">학생 등록</h1>
      <StudentCreateForm
        agents={sortedAgents.map((a) => ({ id: a.id, name: a.name }))}
        defaultAgentId={defaultAgent?.id ?? null}
      />
    </div>
  );
}
