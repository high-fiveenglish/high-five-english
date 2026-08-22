"use client";

import { useState, useTransition } from "react";
import { checkTeacherAvailability, type TeacherAvailability } from "./actions";

export function TeacherAvailabilityPicker({
  getDate,
  onPick,
}: {
  getDate: () => string;
  onPick: (teacherId: number, teacherName: string, hour: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<TeacherAvailability[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const date = getDate();
          if (!date) {
            setError("먼저 수업일자를 선택해주세요.");
            setOpen(true);
            setResults(null);
            return;
          }
          setError(null);
          setOpen(true);
          startTransition(async () => {
            const data = await checkTeacherAvailability(date);
            setResults(data);
          });
        }}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        찾아보기
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-900">등록 가능한 강사 · 시간</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-700">
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!error && pending && <p className="text-sm text-slate-400">조회 중...</p>}
              {!error && !pending && results && results.length === 0 && (
                <p className="text-sm text-slate-400">등록된 강사가 없습니다.</p>
              )}
              {!error &&
                !pending &&
                results?.map((t) => (
                  <div key={t.teacherId} className="mb-4">
                    <p className="mb-1.5 text-sm font-semibold text-slate-800">{t.teacherName}</p>
                    {t.hours.length === 0 ? (
                      <p className="text-xs text-slate-400">등록된 근무가능 시간이 없습니다.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {t.hours.map((h) => (
                          <button
                            key={h.hour}
                            type="button"
                            disabled={!h.free}
                            onClick={() => {
                              onPick(t.teacherId, t.teacherName, h.hour);
                              setOpen(false);
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              h.free
                                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                : "border-slate-200 bg-slate-100 text-slate-300"
                            }`}
                          >
                            {h.hour}:00{h.free ? "" : " (마감)"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
