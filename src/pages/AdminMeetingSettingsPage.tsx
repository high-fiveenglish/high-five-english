import { useEffect, useState } from "react";
import { Link2, Save } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import { listMeetingPlatforms, type MeetingPlatformRow } from "../services/classroomService";
import {
  listEnrollments,
  listSchedulableLessons,
  listTeacherMeetingLinks,
  setPlatformEnabled,
  updateEnrollmentMeetingPlatform,
  updateLessonMeetingUrl,
  updateTeacherMeetingLinkAsAdmin,
  type AdminLessonRow,
  type EnrollmentRow,
  type TeacherLinksRow,
} from "../services/adminService";
import type { Actor } from "../lib/auth/types";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

function PlatformSelect({
  value,
  platforms,
  onChange,
}: {
  value: MeetingPlatformId;
  platforms: MeetingPlatformRow[];
  onChange: (id: MeetingPlatformId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MeetingPlatformId)}
      className={selectClass}
    >
      {platforms.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function TeacherLinkRow({
  actor,
  row,
  platforms,
  onSaved,
}: {
  actor: Actor;
  row: TeacherLinksRow;
  platforms: MeetingPlatformRow[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Partial<Record<MeetingPlatformId, string>>>(row.links);
  const [savingId, setSavingId] = useState<MeetingPlatformId | null>(null);

  const handleSave = async (platformId: MeetingPlatformId) => {
    setSavingId(platformId);
    await updateTeacherMeetingLinkAsAdmin(actor, row.teacherId, platformId, values[platformId] ?? "");
    setSavingId(null);
    onSaved();
  };

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <p className="text-sm font-bold text-brand-950">{row.teacherName}</p>
      <div className="mt-3 space-y-2">
        {platforms.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{p.shortName}</span>
            <input
              type="url"
              value={values[p.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
              placeholder="등록된 링크 없음"
              className={`${selectClass} w-full`}
            />
            <button
              onClick={() => handleSave(p.id)}
              disabled={savingId === p.id}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              <Save size={13} /> 저장
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LessonUrlRow({
  actor,
  lesson,
  onSaved,
}: {
  actor: Actor;
  lesson: AdminLessonRow;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(lesson.meetingUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!url.trim()) return;
    setSaving(true);
    await updateLessonMeetingUrl(actor, lesson.id, url.trim());
    setSaving(false);
    onSaved();
  };

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">{lesson.studentName}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">{lesson.teacherName}</td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
        {lesson.scheduledDate} {lesson.scheduledTime}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://zoom.us/j/..."
            className={`${selectClass} w-full min-w-[220px]`}
          />
          <button
            onClick={handleSave}
            disabled={saving || !url.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Save size={13} /> 저장
          </button>
        </div>
      </td>
    </tr>
  );
}

function AdminMeetingSettingsContent() {
  const { actor } = useAuth();
  const [platforms, setPlatforms] = useState<MeetingPlatformRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [teacherLinks, setTeacherLinks] = useState<TeacherLinksRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [lessons, setLessons] = useState<AdminLessonRow[]>([]);

  const load = () => {
    if (!actor) return;
    listMeetingPlatforms().then(setPlatforms);
    listEnrollments(actor).then((res) => {
      if (res.ok) setEnrollments(res.value);
    });
    listTeacherMeetingLinks(actor).then((res) => {
      if (res.ok) setTeacherLinks(res.value);
    });
  };

  useEffect(load, [actor]);

  useEffect(() => {
    if (!actor) return;
    listSchedulableLessons(actor, selectedStudentId ? { studentId: selectedStudentId } : undefined).then((res) => {
      if (res.ok) setLessons(res.value);
    });
  }, [actor, selectedStudentId]);

  if (!actor) return null;

  const handleTogglePlatform = async (id: MeetingPlatformId, enabled: boolean) => {
    await setPlatformEnabled(actor, id, enabled);
    load();
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow="관리자" title="화상회의 프로그램 설정" align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          여기서 지정한 값은 학생의 내 강의실과 프로그램 설치 페이지에 그대로 반영됩니다. 강사가
          등록한 고정 링크가 기본으로 쓰이고, 수업별로 등록한 URL이 있으면 그 링크가 우선합니다.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <h3 className="text-sm font-bold text-brand-950">프로그램 사용 여부</h3>
            <ul className="mt-4 space-y-3">
              {platforms.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.brandColor }} />
                    {p.name}
                  </span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => handleTogglePlatform(p.id, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <h3 className="text-sm font-bold text-brand-950">수강생 프로그램</h3>
            <p className="mt-1 text-xs text-slate-400">이 값이 해당 학생의 내 강의실에 표시됩니다.</p>
            <div className="mt-3 space-y-2">
              {enrollments.map((e) => (
                <div key={e.enrollmentId} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">
                    {e.studentName} <span className="text-xs text-slate-400">({e.teacherName})</span>
                  </span>
                  <PlatformSelect
                    value={e.meetingPlatform}
                    platforms={platforms}
                    onChange={async (id) => {
                      await updateEnrollmentMeetingPlatform(actor, e.enrollmentId, id);
                      load();
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="mb-3 text-sm font-bold text-brand-950">강사별 화상회의 링크 현황</h3>
          <p className="mb-3 text-xs text-slate-400">
            강사가 강사 페이지에서 직접 등록할 수 있는 값과 동일합니다 — 여기서도 대신 수정할 수 있습니다.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {teacherLinks.map((row) => (
              <TeacherLinkRow key={row.teacherId} actor={actor} row={row} platforms={platforms} onSaved={load} />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-brand-950">
              <Link2 size={15} /> 수업별 참여 URL 등록 (예외 등록)
            </h3>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className={selectClass}
            >
              <option value="">전체 학생</option>
              {enrollments.map((e) => (
                <option key={e.studentId} value={e.studentId}>
                  {e.studentName}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["학생명", "강사", "수업 일시", "참여 URL"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessons.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                      예정된 수업이 없습니다.
                    </td>
                  </tr>
                )}
                {lessons.map((lesson) => (
                  <LessonUrlRow key={lesson.id} actor={actor} lesson={lesson} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function AdminMeetingSettingsPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="meetingLinks"
      onOpenLogin={onOpenLogin}
    >
      <AdminMeetingSettingsContent />
    </RouteGuard>
  );
}
