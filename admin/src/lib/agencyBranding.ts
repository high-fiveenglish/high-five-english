import { prisma } from "./prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "./constants";

// 마케팅 사이트(Vite)는 요청마다 자신의 접속 도메인(window.location.hostname)을
// ?domain= 파라미터로 실어 보낸다 — 이 헬퍼가 그 도메인을 Agent.domain과 매칭해
// "지금 어느 협력사 사이트인지"를 서버에서 판별한다. 본사 도메인이거나 매칭되는
// 협력사가 없으면 null(본사 기본값 사용)을 돌려준다. www. 접두어와 포트 번호는
// 무시한다 — 방문자가 www.mnmenglish.com으로 들어와도 동일하게 매칭되어야 한다.
export function normalizeDomain(raw: string | null): string | null {
  if (!raw) return null;
  const noPort = raw.trim().toLowerCase().split(":")[0];
  return noPort.startsWith("www.") ? noPort.slice(4) : noPort;
}

export async function resolveAgentIdFromDomain(rawDomain: string | null): Promise<number | null> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;
  const agent = await prisma.agent.findFirst({
    where: { siteId: DEFAULT_SITE_ID, domain },
    select: { id: true },
  });
  return agent?.id ?? null;
}

// Student.agentId는 직영(highfive) 학생도 실제 highfive Agent 행의 id를 그대로
// 들고 있다(agentId가 null인 건 "협력사 미지정"이라는 별개 의미라 재사용할 수 없다) —
// 반면 콘텐츠 소유권을 나타내는 필드(ReviewPost.agentId 등)는 이 파일의 다른 함수들과
// 마찬가지로 "직영 = null"을 쓴다. 이 헬퍼가 그 둘을 이어준다.
export async function normalizeToOwnershipAgentId(studentAgentId: number | null): Promise<number | null> {
  if (studentAgentId === null) return null;
  const highfive = await prisma.agent.findFirst({
    where: { siteId: DEFAULT_SITE_ID, code: HIGHFIVE_AGENT_CODE },
    select: { id: true },
  });
  return studentAgentId === highfive?.id ? null : studentAgentId;
}
