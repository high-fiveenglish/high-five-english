"use client";

// 레벨테스트 등록/확정 폼 3곳(레벨테스트관리 신규등록·수정, 학생관리→레벨테스트 등록)에서
// 공용으로 쓰는 훅 — 날짜+시간이 모두 채워지면 별도 "찾아보기" 클릭 없이 자동으로 그
// 시각에 가능한 강사만 조회해 select 옵션으로 내려준다.
import { useEffect, useState } from "react";
import { getAvailableTeachersForLevelTestSlot, type AvailableTeacher } from "@/lib/teacherAvailability";

export function useLevelTestAvailableTeachers({
  testDate,
  testTime,
  excludeLevelTestId,
  setTeacherId,
  initialTeacher,
}: {
  testDate: string;
  testTime: string;
  excludeLevelTestId?: number;
  setTeacherId: (updater: (prev: string) => string) => void;
  /** 수정 화면에서 이미 배정돼있던 강사 — 검색 결과가 오기 전까지 select에 미리 보여준다. */
  initialTeacher?: AvailableTeacher | null;
}) {
  const canSearch = Boolean(testDate && testTime);
  const [teachers, setTeachers] = useState<AvailableTeacher[] | null>(initialTeacher ? [initialTeacher] : null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canSearch) {
      setTeachers(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAvailableTeachersForLevelTestSlot(testDate, testTime, excludeLevelTestId)
      .then((result) => {
        if (cancelled) return;
        setTeachers(result);
        setTeacherId((prev) => (result.some((t) => String(t.id) === prev) ? prev : ""));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDate, testTime, excludeLevelTestId, canSearch]);

  return { teachers: teachers ?? [], loading, canSearch };
}
