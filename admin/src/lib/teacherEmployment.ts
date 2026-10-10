// 정규/비정규 강사 지정 입력 검증 — 유급휴가 자격 판정(Teacher.employmentType = REGULAR)에 쓰이는 값이라 서버에서 엄격히 확인한다.
// 폼에 값이 아예 없으면(옛 폼/다른 경로) "변경 없음"(null)이다 — 값이 없다고 비정규로 내려가지 않는다. 있는데 두 값이 아니면 오류다.
export const EMPLOYMENT_TYPES = ["REGULAR", "NON_REGULAR"] as const;
export type EmploymentTypeValue = (typeof EMPLOYMENT_TYPES)[number];

export type EmploymentTypeInput = { ok: true; value: EmploymentTypeValue | null } | { ok: false; error: string };

export function parseEmploymentTypeInput(raw: FormDataEntryValue | null | undefined): EmploymentTypeInput {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(raw)) return { ok: true, value: raw as EmploymentTypeValue };
  return { ok: false, error: "정규/비정규 강사 값이 올바르지 않습니다." };
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentTypeValue, string> = { REGULAR: "정규 강사", NON_REGULAR: "비정규 강사" };
