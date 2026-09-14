"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import type { EnrollmentRequestStatus } from "@/generated/prisma/client";

const STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CANCELLED"] as const;

export async function updateEnrollmentRequestStatus(id: number, status: EnrollmentRequestStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollment_requests.update");
  if (!STATUSES.includes(status)) throw new Error("잘못된 상태값입니다.");

  await prisma.enrollmentRequest.update({ where: { id }, data: { status } });
  await logAudit({ actor, action: "UPDATE", targetType: "EnrollmentRequest", targetId: id, description: `status = ${status}` });
  revalidatePath("/enrollment-requests");
}
