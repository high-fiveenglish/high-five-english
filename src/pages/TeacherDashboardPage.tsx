import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Video } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { LessonStatusBadge } from "../components/classroom/LessonStatusBadge";
import { useAuth } from "../context/AuthContext";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../data/meetingPlatforms";
import { resolveJoinUrl } from "../lib/meeting/resolveJoinUrl";
import {
  getMyMeetingLinks,
  listMyLessons,
  listMyStudents,
  updateMyMeetingLink,
  type MyLessonRow,
  type MyStudentRow,
} from "../services/teacherService";
import type { TeacherMeetingLinks } from "../services/store";
import type { Actor } from "../lib/auth/types";

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

function TeacherDashboardContent() {
  const { actor, userName } = useAuth();
  const { t } = useTranslation("teacher");
  const [links, setLinks] = useState<TeacherMeetingLinks>({});
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [students, setStudents] = useState<MyStudentRow[]>([]);
  const [lessons, setLessons] = useState<MyLessonRow[]>([]);

  const load = () => {
    if (!actor) return;
    getMyMeetingLinks(actor).then((res) => {
      if (res.ok) setLinks(res.value);
      setLinksLoaded(true);
    });
    listMyStudents(actor).then((res) => res.ok && setStudents(res.value));
    listMyLessons(actor).then((res) => res.ok && setLessons(res.value));
  };

  useEffect(load, [actor]);

  if (!actor) return null;

  const upcoming = lessons.filter((l) => l.status === "scheduled").slice(0, 20);

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("greeting", { name: userName })} align="left" />

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {linksLoaded && <MeetingLinksCard actor={actor} links={links} onSaved={load} />}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <h3 className="text-sm font-bold text-brand-950">{t("my_students_title", { count: students.length })}</h3>
            <ul className="mt-4 space-y-2.5">
              {students.map((s) => (
                <li key={s.enrollment.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
                  <span className="font-bold text-brand-950">{s.studentName}</span>
                  <span className="text-xs text-slate-500">
                    {s.courseName} · {t("remaining_lessons", { count: s.enrollment.remainingLessons })}
                  </span>
                </li>
              ))}
              {students.length === 0 && <p className="text-sm text-slate-400">{t("no_students")}</p>}
            </ul>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">{t("upcoming_lessons_title")}</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[640px] border-collapse">
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
                {upcoming.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      {t("no_lessons")}
                    </td>
                  </tr>
                )}
                {upcoming.map((lesson) => {
                  const joinUrl = resolveJoinUrl(lesson, links, lesson.meetingPlatform);
                  return (
                    <tr key={lesson.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">{lesson.scheduledDate}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">{lesson.scheduledTime}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{lesson.studentName}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <LessonStatusBadge status={lesson.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
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
