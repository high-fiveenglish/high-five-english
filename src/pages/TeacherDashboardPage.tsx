import { useEffect, useState } from "react";
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
      <h3 className="text-sm font-bold text-brand-950">내 화상회의 링크</h3>
      <p className="mt-1 text-xs text-slate-400">
        한 번 등록하면 이 플랫폼을 사용하는 내 담당 학생 전원의 수업에 자동으로 연결됩니다.
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
              placeholder={`${p.shortName} 참여 링크`}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              onClick={() => handleSave(p.id)}
              disabled={savingId === p.id}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Save size={13} /> 저장
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeacherDashboardContent() {
  const { actor, userName } = useAuth();
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
        <SectionHeading eyebrow="강사 페이지" title={`${userName} 강사님 안녕하세요`} align="left" />

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {linksLoaded && <MeetingLinksCard actor={actor} links={links} onSaved={load} />}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <h3 className="text-sm font-bold text-brand-950">담당 학생 ({students.length}명)</h3>
            <ul className="mt-4 space-y-2.5">
              {students.map((s) => (
                <li key={s.enrollment.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
                  <span className="font-bold text-brand-950">{s.studentName}</span>
                  <span className="text-xs text-slate-500">
                    {s.courseName} · 잔여 {s.enrollment.remainingLessons}회
                  </span>
                </li>
              ))}
              {students.length === 0 && <p className="text-sm text-slate-400">담당 학생이 없습니다.</p>}
            </ul>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">예정된 수업</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["날짜", "시간", "학생", "출결상태", "입장"].map((h) => (
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
                      예정된 수업이 없습니다.
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
                            <Video size={13} /> 수업 입장
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">입장 링크 준비 중</span>
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
