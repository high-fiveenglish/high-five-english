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

  await prisma.pricingRow.update({ where: { id: rowId }, data: { [field]: Math.round(amount) } });
  await logAudit({ actor, action: "UPDATE", targetType: "PricingRow", targetId: rowId, description: `${field} = ${amount}` });
  revalidatePath("/pricing");
}
