"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";

// 상담 단계에서 강사 자리를 미리 "가예약"해두는 기능. 본사와 협력사 2곳이 같은 강사
// 풀을 공유해서 쓰다 보니, 상담원이 강사 빈자리를 구글시트로 먼저 확인하고 자리를
// 잡아두는 실제 업무 흐름을 그대로 반영한다 — 등록으로 이어지면(enrollments/actions.ts의
// createEnrollment) CONVERTED로, 상담이 무산되면 cancelReservation으로 CANCELLED로
// 바뀌며 구글시트 자리도 그때그때 자동으로 갱신된다.
export async function createReservation(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "reservations.create");

  const teacherId = Number(formData.get("teacherId"));
  const agentIdRaw = String(formData.get("agentId") ?? "");
  const weekday = Number(formData.get("weekday"));
  const classTime = String(formData.get("classTime") ?? "").trim();
  const durationMin = Number(formData.get("durationMin") ?? 25);
  const prospectName = String(formData.get("prospectName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!teacherId || !classTime || !prospectName || Number.isNaN(weekday)) {
    return { error: "강사·요일·시간·상담자 이름은 필수입니다." };
  }

  const reservation = await prisma.slotReservation.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      teacherId,
      agentId: agentIdRaw ? Number(agentIdRaw) : null,
      weekday,
      classTime,
      durationMin,
      prospectName,
      contactPhone: contactPhone || null,
      note: note || null,
      createdById: actor.id,
    },
  });
  await logAudit({
    actor,
    action: "CREATE",
    targetType: "SlotReservation",
    targetId: reservation.id,
    description: `강사 자리 예약 등록: ${prospectName}`,
  });

  revalidatePath("/reservations");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect("/reservations");
}

export async function cancelReservation(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "reservations.update");

  const existing = await prisma.slotReservation.findUnique({ where: { id } });
  if (!existing || existing.status !== "RESERVED") {
    throw new Error("예약중인 건만 취소할 수 있습니다.");
  }

  await prisma.slotReservation.update({ where: { id }, data: { status: "CANCELLED" } });
  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "SlotReservation",
    targetId: id,
    description: `강사 자리 예약 취소: ${existing.prospectName}`,
  });

  revalidatePath("/reservations");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}
