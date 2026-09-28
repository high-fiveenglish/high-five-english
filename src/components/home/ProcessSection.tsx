import { useTranslation } from "react-i18next";
import { PhoneCall, ClipboardList, UserCheck, PlayCircle } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { ImageLightbox } from "./ImageLightbox";
import consultScreenshot from "../../assets/homepage/consult-screen.png";
import teacherMatchScreenshot from "../../assets/homepage/teacher-match.png";
import classroomEntryScreenshot from "../../assets/homepage/classroom-entry.png";
import leveltestResultScreenshot from "../../assets/homepage/leveltest-result.png";
import leveltestResultFullScreenshot from "../../assets/homepage/leveltest-result-full.png";

// 각 단계 실제 화면 캡처. shotLabel은 카드 하단 이미지의 접근성 라벨/팝업 제목이고,
// fullScreenshot은 클릭 시 팝업에 보여줄 원본(잘리지 않은 버전) — leveltest만 본문이
// 길어 별도 전체 캡처본을 쓰고, 나머지는 썸네일과 동일하다.
const STEP_KEYS = [
  { key: "consult", icon: PhoneCall, shotLabel: "상담 신청 화면", screenshot: consultScreenshot, fullScreenshot: consultScreenshot },
  {
    key: "leveltest",
    icon: ClipboardList,
    shotLabel: "레벨테스트 결과 화면",
    screenshot: leveltestResultScreenshot,
    fullScreenshot: leveltestResultFullScreenshot,
  },
  { key: "matching", icon: UserCheck, shotLabel: "강사 매칭 화면", screenshot: teacherMatchScreenshot, fullScreenshot: teacherMatchScreenshot },
  { key: "start", icon: PlayCircle, shotLabel: "강의실 화면", screenshot: classroomEntryScreenshot, fullScreenshot: classroomEntryScreenshot },
] as const;

export function ProcessSection({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const { t } = useTranslation("home");

  return (
    <section id="process" className="bg-brand-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("process.eyebrow")}
          title={t("process.title")}
          description={t("process.description")}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_KEYS.map((step, i) => (
            <div key={step.key} className="relative">
              <div className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
                <span className="absolute -top-3.5 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <step.icon size={22} />
                </div>
                <h3 className="mt-4 text-base font-bold text-brand-950">
                  {t(`process.steps.${step.key}.title`)}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {t(`process.steps.${step.key}.desc`)}
                </p>
                {/* 단계별 실제 화면 — 보조 요소로 숫자·제목·설명 아래에 붙는다.
                    클릭하면 팝업으로 크게 볼 수 있음 */}
                <div className="mt-4">
                  <ImageLightbox label={step.shotLabel} fullSrc={step.fullScreenshot}>
                    <div
                      style={{ aspectRatio: "4/3" }}
                      className="flex w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5"
                    >
                      <img
                        src={step.screenshot}
                        alt={step.shotLabel}
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </ImageLightbox>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <button
            onClick={onOpenLevelTest}
            className="rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            {t("process.cta")}
          </button>
        </div>
      </Container>
    </section>
  );
}
