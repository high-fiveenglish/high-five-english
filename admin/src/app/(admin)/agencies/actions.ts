"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

export async function updateAgentBranding(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "agencies.update");

  const str = (key: string) => String(formData.get(key) ?? "").trim();
  const domain = str("domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

  if (domain) {
    const conflict = await prisma.agent.findFirst({ where: { domain, NOT: { id } } });
    if (conflict) return { error: `이미 다른 협력사(${conflict.name})가 쓰고 있는 도메인입니다.` };
  }

  await prisma.agent.update({
    where: { id },
    data: {
      domain: domain || null,
      logoUrl: str("logoUrl") || null,
      brandTagline: str("brandTagline") || null,
      bizName: str("bizName") || null,
      bizCeo: str("bizCeo") || null,
      bizRegNo: str("bizRegNo") || null,
      bizAddress: str("bizAddress") || null,
      bizPhone: str("bizPhone") || null,
      bizEmail: str("bizEmail") || null,
      bizMailOrderNo: str("bizMailOrderNo") || null,
      bankName: str("bankName") || null,
      bankAccountNumber: str("bankAccountNumber") || null,
      bankAccountHolder: str("bankAccountHolder") || null,
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "Agent", targetId: id, description: "협력사 브랜딩/회사정보 수정" });

  revalidatePath("/agencies");
  revalidatePath(`/agencies/${id}`);
  return {};
}

// 카카오톡/위챗 상담채널은 ConsultChannel에 agentId로 스코프해서 저장한다 — 아직 그
// 협력사 전용 행이 없으면(처음 설정하는 경우) 새로 만들고, 있으면 값만 갱신한다.
export async function updateAgentConsultChannel(
  agentId: number,
  code: "kakao" | "wechat",
  input: { value: string; url: string },
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "agencies.update");

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("존재하지 않는 협력사입니다.");

  const value = input.value.trim();
  const url = input.url.trim();
  if (url) {
    try {
      new URL(url);
    } catch {
      throw new Error("유효한 URL 형식이 아닙니다.");
    }
  }

  const displayName = code === "kakao" ? "카카오톡 상담" : "위챗 상담";
  const existing = await prisma.consultChannel.findFirst({ where: { siteId: agent.siteId, agentId, code } });
  if (existing) {
    await prisma.consultChannel.update({
      where: { id: existing.id },
      data: { value, url: url || null, displayName },
    });
  } else {
    await prisma.consultChannel.create({
      data: { siteId: agent.siteId, agentId, code, displayName, value, url: url || null, enabled: !!value },
    });
  }
  await logAudit({ actor, action: "UPDATE", targetType: "ConsultChannel", targetId: agentId, description: `협력사 ${code} 상담채널 수정` });

  revalidatePath(`/agencies/${agentId}`);
}
