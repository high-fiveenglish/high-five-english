import { useEffect, useState } from "react";
import { Link2, Save } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { DEMO_STUDENT, DEMO_TEACHER } from "../data/classroomMock";
import type { MeetingPlatformId } from "../data/meetingPlatforms";
import {
  getMyClassroom,
  getTeacherDefaultPlatform,
  listMeetingPlatforms,
  listSchedulableLessons,
  setPlatformEnabled,
  updateEnrollmentMeetingPlatform,
  updateLessonMeetingUrl,
  updateTeacherDefaultPlatform,
  type AdminLessonRow,
  type MeetingPlatformRow,
} from "../services/classroomService";

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

function LessonUrlRow({
  lesson,
  onSaved,
}: {
  lesson: AdminLessonRow;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState(lesson.meetingUrl ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!url.trim()) return;
    setSaving(true);
    await updateLessonMeetingUrl(lesson.id, url.trim());
    setSaving(false);
    onSaved();
  };

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
        {lesson.studentName}
      </td>
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

export function AdminMeetingSettingsPage() {
  const [platforms, setPlatforms] = useState<MeetingPlatformRow[]>([]);
  const [enrollmentPlatform, setEnrollmentPlatform] = useState<MeetingPlatformId | null>(null);
  const [teacherDefault, setTeacherDefault] = useState<MeetingPlatformId | null>(null);
  const [lessons, setLessons] = useState<AdminLessonRow[]>([]);

  const load = () => {
    listMeetingPlatforms().then(setPlatforms);
    getMyClassroom(DEMO_STUDENT.id).then((snapshot) => {
      if (snapshot) setEnrollmentPlatform(snapshot.enrollment.meetingPlatform);
    });
    getTeacherDefaultPlatform().then(setTeacherDefault);
    listSchedulableLessons().then(setLessons);
  };

  useEffect(load, []);

  const handleTogglePlatform = async (id: MeetingPlatformId, enabled: boolean) => {
    await setPlatformEnabled(id, enabled);
    load();
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow="관리자" title="화상회의 프로그램 설정" align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          여기서 지정한 값은 학생의 내 강의실과 프로그램 설치 페이지에 그대로 반영됩니다.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <h3 className="text-sm font-bold text-brand-950">프로그램 사용 여부</h3>
            <ul className="mt-4 space-y-3">
              {platforms.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.brandColor }}
                    />
                    {p.name}
                  </span>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => handleTogglePlatform(p.id, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600" />
                    <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
              <h3 className="text-sm font-bold text-brand-950">
                수강생 프로그램 — {DEMO_STUDENT.name}
              </h3>
              <p className="mt-1 text-xs text-slate-400">이 값이 학생의 내 강의실에 표시됩니다.</p>
              {enrollmentPlatform && (
                <div className="mt-3">
                  <PlatformSelect
                    value={enrollmentPlatform}
                    platforms={platforms}
                    onChange={async (id) => {
                      await updateEnrollmentMeetingPlatform(id);
                      load();
                    }}
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
              <h3 className="text-sm font-bold text-brand-950">
                강사 기본 프로그램 — {DEMO_TEACHER.name}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                신규 수강 등록 시 기본값으로 미리 채워지는 값입니다.
              </p>
              {teacherDefault && (
                <div className="mt-3">
                  <PlatformSelect
                    value={teacherDefault}
                    platforms={platforms}
                    onChange={async (id) => {
                      await updateTeacherDefaultPlatform(id);
                      load();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-950">
            <Link2 size={15} /> 수업별 참여 URL 등록
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["학생명", "수업 일시", "참여 URL"].map((h) => (
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
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-400">
                      예정된 수업이 없습니다.
                    </td>
                  </tr>
                )}
                {lessons.map((lesson) => (
                  <LessonUrlRow key={lesson.id} lesson={lesson} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </section>
  );
}
