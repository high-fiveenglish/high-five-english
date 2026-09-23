"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/weekdays";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";

// 상담 단계에서 강사 자리를 미리 "가예약"해두는 기능. 본사와 협력사 2곳이 같은 강사
// 풀을 공유해서 쓰다 보니, 상담원이 강사 빈자리를 구글시트로 먼저 확인하고 자리를
// 잡아두는 실제 업무 흐름을 그대로 반영한다 — 등록으로 이어지면(enrollments/actions.ts의
// createEnrollment) CONVERTED로, 상담이 무산되면 cancelReservation으로 CANCELLED로
// 바뀌며 구글시트 자리도 그때그때 자동으로 갱신된다.
//
// "주 N회"는 요일마다 이 테이블의 행이 하나씩 생기고(1행 = 1요일), 같은 예약 건에 속한
// 행들을 groupId(UUID)로 묶는다. 이 필드가 생기기 전에 만들어진 기존 행은 groupId가
// null이다 — 그런 "legacy" 행은 항상 id로만 다루고, 새 groupId 기준 로직과 절대 섞지
// 않는다(조회/취소 함수가 매번 명시적으로 분기한다).
export async function createReservation(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "reservations.create");

  const teacherId = Number(formData.get("teacherId"));
  const agentIdRaw = String(formData.get("agentId") ?? "");
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const durationMin = Number(formData.get("durationMin") ?? 25);
  const prospectName = String(formData.get("prospectName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const weekdayValues = formData
    .getAll("weekday")
    .map((v) => Number(v))
    .filter((v) => WEEKDAYS.some((d) => d.value === v));

  if (!teacherId || !classMethod || !prospectName || weekdayValues.length === 0) {
    return { error: "강사·요일·수업 방법·상담자 이름은 필수입니다." };
  }
  if (new Set(weekdayValues).size !== weekdayValues.length) {
    return { error: "같은 요일을 중복 선택할 수 없습니다." };
  }

  // "모두 동일 시간"이면 baseClassTime 하나, "요일마다 다르게"면 dayTime_{요일값}이
  // 선택된 요일 수만큼 채워져 있어야 한다 — EnrollmentCreateForm의 같은 패턴.
  const baseClassTime = String(formData.get("classTime") ?? "").trim();
  const slots: { weekday: number; classTime: string }[] = [];
  for (const weekday of weekdayValues) {
    const perDayTime = String(formData.get(`dayTime_${weekday}`) ?? "").trim();
    const classTime = perDayTime || baseClassTime;
    if (!classTime) {
      return { error: "선택한 모든 요일에 시간을 입력해주세요." };
    }
    slots.push({ weekday, classTime });
  }

  const groupId = randomUUID();
  const agentId = agentIdRaw ? Number(agentIdRaw) : null;

  // 요일 수만큼의 행을 하나의 트랜잭션으로 만든다 — 중간에 하나라도 실패하면 전부
  // 롤백되어, "주 3회 중 1개 행만 저장되는" 상태가 절대 발생하지 않는다.
  const reservations = await prisma.$transaction(
    slots.map((slot) =>
      prisma.slotReservation.create({
        data: {
          siteId: DEFAULT_SITE_ID,
          teacherId,
          agentId,
          weekday: slot.weekday,
          classTime: slot.classTime,
          durationMin,
          classMethod,
          groupId,
          prospectName,
          contactPhone: contactPhone || null,
          note: note || null,
          createdById: actor.id,
        },
      }),
    ),
  );

  await logAudit({
    actor,
    action: "CREATE",
    targetType: "SlotReservation",
    targetId: groupId,
    description: `강사 자리 예약 등록: ${prospectName} (주 ${reservations.length}회)`,
  });

  revalidatePath("/reservations");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect("/reservations");
}

/**
 * 취소 대상 하나를 가리키는 키 — 신규(그룹) 예약은 groupId(UUID 문자열, 숫자로만
 * 구성될 수 없다)를, 레거시(이 필드가 생기기 전) 예약은 순수 숫자 id를 그대로 쓴다.
 * 둘을 값 형태(숫자인지 아닌지)만으로 명확히 구분해 절대 서로 섞이지 않게 한다.
 */
export async function cancelReservation(key: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "reservations.update");

  const isLegacyId = /^\d+$/.test(key);

  const targets = isLegacyId
    ? await prisma.slotReservation.findMany({ where: { id: Number(key), groupId: null } })
    : await prisma.slotReservation.findMany({ where: { groupId: key } });

  const cancellable = targets.filter((r) => r.status === "RESERVED");
  if (cancellable.length === 0) {
    throw new Error("예약중인 건만 취소할 수 있습니다.");
  }

  await prisma.slotReservation.updateMany({
    where: { id: { in: cancellable.map((r) => r.id) } },
    data: { status: "CANCELLED" },
  });

  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "SlotReservation",
    targetId: key,
    description: `강사 자리 예약 취소: ${cancellable[0].prospectName} (${cancellable.length}건)`,
  });

  revalidatePath("/reservations");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}
