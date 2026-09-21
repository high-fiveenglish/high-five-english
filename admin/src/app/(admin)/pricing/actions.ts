"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

const FIELD_NAMES = [
  "price25KRW",
  "price25CNY",
  "price25VND",
  "price50KRW",
  "price50CNY",
  "price50VND",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export async function updatePricingCell(rowId: number, field: FieldName, amount: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "pricing.update");
  if (!FIELD_NAMES.includes(field)) throw new Error("잘못된 필드입니다.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("가격은 0 이상의 숫자여야 합니다.");

  if (actor.role === "AGENT") {
    const row = await prisma.pricingRow.findUnique({ where: { id: rowId }, select: { duration: { select: { agentId: true } } } });
    if (!row || row.duration.agentId !== actor.agentId) {
      throw new Error("해당 가격표에 접근할 권한이 없습니다.");
    }
  }

  await prisma.pricingRow.update({ where: { id: rowId }, data: { [field]: Math.round(amount) } });
  await logAudit({ actor, action: "UPDATE", targetType: "PricingRow", targetId: rowId, description: `${field} = ${amount}` });
  revalidatePath("/pricing");
}

// 협력사 탭을 처음 열었을 때 그 협력사의 가격표 행이 하나도 없으면, 본사(직영) 기준
// 가격표를 그대로 복제해 시작점으로 삼는다 — 협력사는 그 뒤로 이 화면(또는 이후
// 협력사 관리자 페이지)에서 자기 값으로 자유롭게 수정하면 된다. 이미 있으면 아무 것도
// 하지 않는다(멱등).
export async function ensureAgentPricing(agentId: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "pricing.update");
  if (actor.role === "AGENT" && agentId !== actor.agentId) {
    throw new Error("해당 협력사 가격표에 접근할 권한이 없습니다.");
  }

  const existingCount = await prisma.pricingDuration.count({ where: { agentId } });
  if (existingCount > 0) return;

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("존재하지 않는 협력사입니다.");

  const hqDurations = await prisma.pricingDuration.findMany({
    where: { siteId: agent.siteId, agentId: null },
    include: { rows: true },
    orderBy: { order: "asc" },
  });

  for (const d of hqDurations) {
    const created = await prisma.pricingDuration.create({
      data: { siteId: agent.siteId, agentId, code: d.code, hasBadge: d.hasBadge, order: d.order },
    });
    for (const r of d.rows) {
      await prisma.pricingRow.create({
        data: {
          durationId: created.id,
          frequencyId: r.frequencyId,
          price25KRW: r.price25KRW,
          price25CNY: r.price25CNY,
          price25VND: r.price25VND,
          price50KRW: r.price50KRW,
          price50CNY: r.price50CNY,
          price50VND: r.price50VND,
        },
      });
    }
  }
  await logAudit({ actor, action: "CREATE", targetType: "PricingDuration", targetId: agentId, description: `협력사 가격표 본사 기준 초기화` });
  // revalidatePath 불필요/금지 — 이 함수는 pricing/page.tsx의 렌더 도중(서버 액션이
  // 아니라 페이지 컴포넌트 본문에서) 직접 호출되고, 바로 다음 줄에서 같은 요청 안에서
  // pricingDuration을 다시 조회하므로 캐시를 갱신할 필요가 없다. 렌더 중 revalidatePath
  // 호출은 Next.js 16에서 에러가 난다.
}
