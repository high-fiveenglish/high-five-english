import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Lesson, DailyEvaluation, SkillRating } from "../../lib/scheduling/types";
import { getEvaluation } from "../../services/classroomService";
import { fetchRealLessonEvaluation, type RealLessonEvaluation } from "../../services/classroomBridgeService";
import { LessonEvaluationContent } from "../classroom/LessonEvaluationContent";
import { useAuth } from "../../context/AuthContext";

function SkillRow({ label, rating }: { label: string; rating: SkillRating }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={12}
              className={i < rating.score ? "fill-accent-400 text-accent-400" : "fill-slate-200 text-slate-200"}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">{rating.comment}</p>
    </div>
  );
}

type RealView =
  | { phase: "loading" }
  | { phase: "ready"; evaluation: RealLessonEvaluation }
  | { phase: "not_found" }
  | { phase: "expired" }
  | { phase: "error" };

// 실제 계정(학생 Bearer 토큰이 있는 로그인)의 평가서 — admin의 read-only API에서 본인 수업의 게시된 평가서를 읽는다.
// 모든 응답(없음/세션 만료/오류/타임아웃)이 화면 상태로 끝나므로 "불러오는 중"이 끝없이 이어지지 않는다.
function RealEvaluationBody({ lesson, token }: { lesson: Lesson; token: string }) {
  const { t } = useTranslation("classroom");
  const [view, setView] = useState<RealView>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [showEnglish, setShowEnglish] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRealLessonEvaluation(token, Number(lesson.id)).then((res) => {
      if (cancelled) return;
      if (res.status === "ok") setView({ phase: "ready", evaluation: res.evaluation });
      else if (res.status === "not_found") setView({ phase: "not_found" });
      else if (res.status === "session_expired") setView({ phase: "expired" });
      else setView({ phase: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [lesson.id, token, attempt]);

  if (view.phase === "loading") {
    return <p className="py-8 text-center text-sm text-slate-400">{t("evaluation_modal.loading")}</p>;
  }
  if (view.phase === "not_found") {
    return <p className="py-8 text-center text-sm text-slate-500">{t("evaluation_modal.not_ready")}</p>;
  }
  if (view.phase === "expired") {
    return <p className="py-8 text-center text-sm text-slate-500">{t("evaluation_modal.session_expired")}</p>;
  }
  if (view.phase === "error") {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">{t("evaluation_modal.error")}</p>
        <button
          onClick={() => {
            setView({ phase: "loading" });
            setAttempt((a) => a + 1);
          }}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
        >
          {t("evaluation_modal.retry")}
        </button>
      </div>
    );
  }

  const ev = view.evaluation;
  const hasTranslation = Boolean(ev.contentTranslated && ev.translatedLangLabel);
  const english = showEnglish || !hasTranslation;
  return (
    <div>
      <p className="text-xs text-slate-400">{ev.date}</p>
      {hasTranslation && (
        <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
          <button
            onClick={() => setShowEnglish(false)}
            className={`rounded-full px-3 py-1 transition ${!english ? "bg-[#232b26] text-white" : "text-slate-500"}`}
          >
            {ev.translatedLangLabel}
          </button>
          <button
            onClick={() => setShowEnglish(true)}
            className={`rounded-full px-3 py-1 transition ${english ? "bg-[#232b26] text-white" : "text-slate-500"}`}
          >
            {t("evaluation_modal.original_english")}
          </button>
        </div>
      )}
      <div className="mt-4">
        <LessonEvaluationContent content={english ? ev.content : ev.contentTranslated!} />
      </div>
    </div>
  );
}

export function EvaluationDetailModal({
  lesson,
  onClose,
}: {
  lesson: Lesson | null;
  onClose: () => void;
}) {
  const { actor, studentApiToken, isRealAccount } = useAuth();
  const { t } = useTranslation("classroom");
  const [evaluation, setEvaluation] = useState<DailyEvaluation | null>(null);
  const realToken = isRealAccount ? studentApiToken : null;

  useEffect(() => {
    if (!lesson || !actor) return;
    // 실제 계정은 mock 저장소가 아니라 admin API로 읽는다(RealEvaluationBody) — mock 조회는 항상 null이라 끝없이 로딩만 됐다.
    if (realToken) return;
    // A lesson recorded through the teacher's quick evaluation entry carries its own
    // progress/comment directly — no need to fetch the older DailyEvaluation record.
    if (lesson.teacherComment) return;
    let cancelled = false;
    getEvaluation(actor, lesson.id).then((res) => {
      if (!cancelled && res.ok) setEvaluation(res.value);
    });
    return () => {
      cancelled = true;
    };
  }, [lesson, actor, realToken]);

  return (
    <Modal open={!!lesson} onClose={onClose} title={t("evaluation_modal.title")} maxWidth="max-w-lg">
      {lesson && realToken && <RealEvaluationBody key={lesson.id} lesson={lesson} token={realToken} />}
      {lesson && !realToken && lesson.teacherComment && (
        <div>
          <p className="text-xs text-slate-400">{lesson.scheduledDate}</p>
          {lesson.progress && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500">{t("evaluation_modal.progress")}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{lesson.progress}</p>
            </div>
          )}
          <div className="mt-4 rounded-xl bg-brand-50/60 p-4">
            <p className="text-xs font-bold text-brand-700">{t("evaluation_modal.teacher_comment")}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-brand-900">{lesson.teacherComment}</p>
          </div>
        </div>
      )}
      {lesson && !realToken && !lesson.teacherComment && !evaluation && (
        <p className="py-8 text-center text-sm text-slate-400">{t("evaluation_modal.loading")}</p>
      )}
      {lesson && !realToken && !lesson.teacherComment && evaluation && (
        <div>
          <p className="text-xs text-slate-400">{lesson?.scheduledDate}</p>
          <p className="mt-4 text-xs font-bold text-slate-500">{t("evaluation_modal.lesson_content")}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{evaluation.lessonSummary}</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-3.5">
              <p className="text-xs font-bold text-emerald-700">{t("evaluation_modal.strengths")}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-800">{evaluation.strengths}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3.5">
              <p className="text-xs font-bold text-amber-700">{t("evaluation_modal.improvements")}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">{evaluation.improvements}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <SkillRow label={t("evaluation_modal.pronunciation")} rating={evaluation.pronunciation} />
            <SkillRow label={t("evaluation_modal.grammar")} rating={evaluation.grammar} />
            <SkillRow label={t("evaluation_modal.vocabulary")} rating={evaluation.vocabulary} />
            <SkillRow label={t("evaluation_modal.speaking")} rating={evaluation.speaking} />
          </div>

          <div className="mt-4 rounded-xl bg-brand-50/60 p-4">
            <p className="text-xs font-bold text-brand-700">{t("evaluation_modal.teacher_comment")}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-brand-900">{evaluation.teacherComment}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
