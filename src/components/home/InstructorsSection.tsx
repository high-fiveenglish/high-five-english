import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { listPublicInstructors, getCachedPublicInstructors, type PublicTeacher } from "../../services/instructorService";
import { flagForNationality } from "../../lib/nationalityFlag";
import { PublicTeacherModal } from "./PublicTeacherModal";

// 실제 활성 강사 계정을 관리자 백엔드에서 그대로 가져오므로(더 이상 별도로 입력해 둔
// 마케팅 프로필이 없음), PricingSection 등과 달리 정적 시드로 즉시 페인트하지 않고
// 그냥 비어 있는 상태에서 시작해 조회가 끝나면 채운다.
//
// 중요: 예전에는 instructors.length === 0일 때 컴포넌트 전체가 null을 반환해서,
// 상단 네비게이션의 "강사소개" 링크가 스크롤할 #instructors 요소 자체가 DOM에 없는
// 상황이 생겼다(백엔드가 잠깐 죽거나 활성 강사가 0명이면, 클릭해도 "아무 반응 없음"
// 처럼 보임 — 에러 없이 조용히 스크롤 대상을 못 찾고 포기하는 구조라 더 헷갈렸다).
// 그래서 <section id="instructors">는 로딩/빈 상태여도 항상 렌더링하고, 안쪽 내용만
// 로딩 스켈레톤/빈 상태 문구/실제 그리드로 갈아끼운다 — 이러면 스크롤 대상이 항상
// 첫 렌더부터 존재해서 네비게이션 클릭이 절대 "무반응"이 되지 않는다.
export function InstructorsSection() {
  const { t } = useTranslation("home");
  // App.tsx가 부팅 시점에 미리 데워둔 캐시가 있으면 그 값으로 바로 시작한다 — 그러면
  // 이 섹션에 도달했을 때(다른 페이지 → 홈 이동 + 스크롤 포함) 스켈레톤이 아예
  // 뜨지 않고 바로 실제 강사 목록이 보인다.
  const [instructors, setInstructors] = useState<PublicTeacher[] | null>(() => getCachedPublicInstructors());
  const [selected, setSelected] = useState<PublicTeacher | null>(null);

  useEffect(() => {
    if (getCachedPublicInstructors()) return;
    listPublicInstructors().then(setInstructors);
  }, []);

  return (
    <section id="instructors" className="bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("instructors.eyebrow")}
          title={t("instructors.title")}
          description={t("instructors.description")}
        />

        {instructors === null ? (
          <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square rounded-2xl bg-slate-100" />
                <div className="mt-3 h-4 w-2/3 rounded bg-slate-100" />
                <div className="mt-1.5 h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : instructors.length === 0 ? (
          <p className="mt-12 text-center text-sm text-slate-400">{t("instructors.empty")}</p>
        ) : (
        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {instructors.map((ins) => {
            const flag = flagForNationality(ins.nationality);
            return (
              <button key={ins.id} onClick={() => setSelected(ins)} className="group text-left">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_10px_30px_rgba(20,44,88,0.12)] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_38px_rgba(20,44,88,0.2)]">
                  {ins.photoUrl ? (
                    <img src={ins.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-5xl font-extrabold text-white/90">{ins.name[0]}</span>
                  )}
                  {flag && (
                    <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-brand-700">
                      {flag}
                    </span>
                  )}
                  {ins.audioUrl && (
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-brand-950/40 py-2.5 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                      <Volume2 size={14} className="text-white" />
                      <span className="text-xs font-semibold text-white">{t("instructors.listen_hover")}</span>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[15px] font-bold text-brand-950">
                  {ins.name}
                  {ins.nickname && <span className="text-xs font-medium text-slate-400"> ({ins.nickname})</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {[ins.grade === "SENIOR" ? t("instructors.grade_senior") : null, ins.tesol ? t("instructors.tesol_badge") : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
            );
          })}
        </div>
        )}
      </Container>

      <PublicTeacherModal instructor={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
