"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

const FIELD_NAMES = [
  "price25KRW",
  "price25CNY",
  "price25VND",
  "price50KRW",
  "price50CNY",
  "price50VND",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function updatePricingCell(rowId: number, field: FieldName, amount: number) {
  await requireAuth();
  if (!FIELD_NAMES.includes(field)) throw new Error("잘못된 필드입니다.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("가격은 0 이상의 숫자여야 합니다.");

  await prisma.pricingRow.update({ where: { id: rowId }, data: { [field]: Math.round(amount) } });
  revalidatePath("/pricing");
}
