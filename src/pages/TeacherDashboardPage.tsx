import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronLeft, ChevronRight, Megaphone, Save, Video } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { LessonStatusBadge } from "../components/classroom/LessonStatusBadge";
import { TeacherHoldModal } from "../components/modals/TeacherHoldModal";
import { TeacherEvaluationEntryModal } from "../components/modals/TeacherEvaluationEntryModal";
import { useAuth } from "../context/AuthContext";
import { DEMO_TEXTBOOK } from "../data/classroomMock";
import { MEETING_PLATFORMS, getMeetingPlatform, type MeetingPlatformId } from "../data/meetingPlatforms";
import { resolveJoinUrl } from "../lib/meeting/resolveJoinUrl";
import { addDays, addMonths, dayOfWeek, firstOfMonth, toEpochDay, todayIso } from "../lib/scheduling/dateUtils";
import {
  getAcademyClosures,
  getMyMeetingLinks,
  listMyLessons,
  updateMyMeetingLink,
  type MyLessonRow,
} from "../services/teacherService";
import { listNoticesForTeacher } from "../services/noticeService";
import type { TeacherMeetingLinks } from "../services/store";
import type { Actor } from "../lib/auth/types";
import type { ClosureDate } from "../lib/scheduling/types";
import type { Notice } from "../lib/community/types";

function MeetingLinksCard({ actor, links, onSaved }: { actor: Actor; links: TeacherMeetingLinks; onSaved: () => void }) {
  const { t } = useTranslation("teacher");
  const [values, setValues] = useState<TeacherMeetingLinks>(links);
  const [savingId, setSavingId] = useState<MeetingPlatformId | null>(null);

  const handleSave = async (platformId: MeetingPlatformId) => {
    setSavingId(platformId);
    await updateMyMeetingLink(actor, platformId, values[platformId] ?? "");
    setSavingId(null);
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <h3 className="text-sm font-bold text-brand-950">{t("meeting_links_title")}</h3>
      <p className="mt-1 text-xs text-slate-400">
        {t("meeting_links_desc")}
      </p>
      <div className="mt-4 space-y-3">
        {MEETING_PLATFORMS.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span
              className="flex h-8 w-16 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
              style={{ backgroundColor: p.brandColor }}
            >
              {p.shortName}
            </span>
            <input
              type="url"
              value={values[p.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
              placeholder={t("link_placeholder", { platform: p.shortName })}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              onClick={() => handleSave(p.id)}
              disabled={savingId === p.id}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Save size={13} /> {t("save")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletinRow({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <span className="text-[15px] font-bold text-brand-950">{notice.title}</span>
          <span className="ml-3 font-mono text-xs text-slate-400">{notice.createdAt.slice(0, 10)}</span>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition ${open ? "rotate-180 text-brand-600" : ""}`}
        />
      </button>
      {open && (
        <div className="whitespace-pre-line px-5 pb-5 text-[14px] leading-relaxed text-slate-500">
          {notice.content}
        </div>
      )}
    </div>
  );
}

function TeacherBulletinBoard({ actor }: { actor: Actor }) {
  const { t } = useTranslation("teacher");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listNoticesForTeacher(actor).then((res) => {
      if (res.ok) setNotices(res.value);
      setLoading(false);
    });
  }, [actor]);

  return (
    <div className="mt-5 space-y-3">
      {loading && <p className="text-sm text-slate-400">{t("bulletin.loading")}</p>}
      {!loading && notices.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <Megaphone size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">{t("bulletin.empty")}</p>
        </div>
      )}
      {notices.map((n) => (
        <BulletinRow key={n.id} notice={n} />
      ))}
    </div>
  );
}

function TeacherDashboardContent() {
  const { actor, userName } = useAuth();
  const { t } = useTranslation("teacher");
  const weekdayLabels = t("weekdays_short", { ns: "classroom", returnObjects: true }) as string[];
  const [links, setLinks] = useState<TeacherMeetingLinks>({});
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [lessons, setLessons] = useState<MyLessonRow[]>([]);
  const [closures, setClosures] = useState<ClosureDate[]>([]);
  const [activeTab, setActiveTab] = useState<"schedule" | "bulletin">("schedule");

  const today = todayIso();
  const [calendarMonth, setCalendarMonth] = useState(() => firstOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [holdModalLesson, setHoldModalLesson] = useState<MyLessonRow | null>(null);
  const [evalModalLesson, setEvalModalLesson] = useState<MyLessonRow | null>(null);

  const load = () => {
    if (!actor) return;
    getMyMeetingLinks(actor).then((res) => {
      if (res.ok) setLinks(res.value);
      setLinksLoaded(true);
    });
    listMyLessons(actor).then((res) => res.ok && setLessons(res.value));
    getAcademyClosures(actor).then((res) => res.ok && setClosures(res.value));
  };

  useEffect(load, [actor]);

  const closureByDate = useMemo(() => {
    const map = new Map<string, ClosureDate>();
    for (const c of closures) map.set(c.date, c);
    return map;
  }, [closures]);

  const lessonsByDate = useMemo(() => {
    const map = new Map<string, MyLessonRow[]>();
    for (const l of lessons) map.set(l.scheduledDate, [...(map.get(l.scheduledDate) ?? []), l]);
    return map;
  }, [lessons]);

  // For each lesson, the most recent earlier lesson (same enrollment) that has a
  // recorded textbook progress — this is the "직전 진도" a teacher needs to know where
  // to pick up from, regardless of whether the selected date is in the past or future.
  const prevProgressByLessonId = useMemo(() => {
    const byEnrollment = new Map<string, MyLessonRow[]>();
    for (const l of lessons) byEnrollment.set(l.enrollmentId, [...(byEnrollment.get(l.enrollmentId) ?? []), l]);

    const map = new Map<string, string | null>();
    for (const enrollmentLessons of byEnrollment.values()) {
      const sorted = [...enrollmentLessons].sort(
        (a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime),
      );
      let lastProgress: string | null = null;
      for (const l of sorted) {
        map.set(l.id, lastProgress);
        if (l.progress) lastProgress = l.progress;
      }
    }
    return map;
  }, [lessons]);

  const calendarCells = useMemo(() => {
    const startWeekday = dayOfWeek(calendarMonth);
    const daysInMonth = toEpochDay(addMonths(calendarMonth, 1)) - toEpochDay(calendarMonth);
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const monthPrefix = calendarMonth.slice(0, 7);
    return Array.from({ length: totalCells }, (_, i) => {
      const date = addDays(calendarMonth, i - startWeekday);
      return { date, inMonth: date.startsWith(monthPrefix) };
    });
  }, [calendarMonth]);

  const formatMonthLabel = (value: string) => {
    const [y, m] = value.split("-");
    return t("calendar.month_label", { year: y, month: m });
  };

  if (!actor) return null;

  const selectedLessons = (lessonsByDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("greeting", { name: userName })} align="left" />

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === "schedule" ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:text-brand-700"
            }`}
          >
            {t("tabs.schedule")}
          </button>
          <button
            onClick={() => setActiveTab("bulletin")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              activeTab === "bulletin" ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:text-brand-700"
            }`}
          >
            {t("tabs.bulletin_board")}
          </button>
        </div>

        {activeTab === "bulletin" && <TeacherBulletinBoard actor={actor} />}

        {activeTab === "schedule" && (
        <>
        <div className="mt-8">
          {linksLoaded && <MeetingLinksCard actor={actor} links={links} onSaved={load} />}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-950">{t("calendar.title")}</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCalendarMonth((m) => addMonths(m, -1))}
                aria-label={t("calendar.prev_month")}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-brand-950">{formatMonthLabel(calendarMonth)}</span>
              <button
                onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                aria-label={t("calendar.next_month")}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-brand-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1">
            {weekdayLabels.map((w) => (
              <div key={w} className="pb-1 text-center text-[11px] font-bold text-slate-400">
                {w}
              </div>
            ))}
            {calendarCells.map(({ date, inMonth }) => {
              const isClosure = closureByDate.has(date);
              const isSelected = date === selectedDate;
              const isToday = date === today;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`flex h-14 flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-xs transition ${
                    !inMonth ? "text-slate-300" : "text-slate-600"
                  } ${isSelected ? "bg-brand-600 text-white" : "hover:bg-brand-50"} ${
                    isToday && !isSelected ? "font-bold text-brand-600" : ""
                  }`}
                >
                  <span>{Number(date.slice(8, 10))}</span>
                  <span className="flex h-2 items-center gap-0.5">
                    {isClosure && (
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-orange-400"}`} />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> {t("calendar.closure_legend")}
          </p>
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">{t("selected_date_title", { date: selectedDate })}</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {Object.values(t("table_headers", { returnObjects: true }) as Record<string, string>).map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedLessons.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                      {t("no_lessons_selected")}
                    </td>
                  </tr>
                )}
                {selectedLessons.map((lesson) => {
                  const joinUrl = resolveJoinUrl(lesson, links, lesson.meetingPlatform);
                  const platform = getMeetingPlatform(lesson.meetingPlatform);
                  const canHold = lesson.status === "scheduled";
                  const prevProgress =
                    prevProgressByLessonId.get(lesson.id) ?? `${DEMO_TEXTBOOK.title} · ${DEMO_TEXTBOOK.currentUnit} ${t("progress_start")}`;
                  return (
                    <tr key={lesson.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                        {lesson.scheduledTime} <span className="text-slate-400">({t("minutes", { count: lesson.lessonDurationMin })})</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
                        {lesson.studentName} <span className="font-normal text-slate-400">({lesson.studentEnglishName})</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{lesson.route}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{prevProgress}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{lesson.progress ?? t("progress_pending")}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-14 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                            style={{ backgroundColor: platform.brandColor }}
                          >
                            {platform.shortName}
                          </span>
                          {joinUrl ? (
                            <a
                              href={joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
                            >
                              <Video size={13} /> {t("enter_class")}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">{t("link_pending")}</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => setEvalModalLesson(lesson)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            lesson.evaluationStatus === "completed"
                              ? "border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700"
                              : "bg-brand-600 text-white hover:bg-brand-700"
                          }`}
                        >
                          {t(`evaluation_status.${lesson.evaluationStatus}`)}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <LessonStatusBadge status={lesson.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {canHold ? (
                          <button
                            onClick={() => setHoldModalLesson(lesson)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            {t("hold_button")}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">{t("hold_unavailable")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
        )}
      </Container>

      <TeacherHoldModal
        lesson={holdModalLesson}
        onClose={() => setHoldModalLesson(null)}
        onHeld={load}
      />
      <TeacherEvaluationEntryModal
        lesson={evalModalLesson}
        onClose={() => setEvalModalLesson(null)}
        onSubmitted={load}
      />
    </section>
  );
}

export function TeacherDashboardPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard allow={["teacher"]} onOpenLogin={onOpenLogin}>
      <TeacherDashboardContent />
    </RouteGuard>
  );
}
