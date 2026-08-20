import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useLanguage } from "../../context/LanguageContext";
import { getLanguageTimeZone } from "../../i18n/config";
import { zonedWallTimeToUtcISO, detectLocalTimeZone } from "../../lib/timezone";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../../data/meetingPlatforms";
import { submitLevelTestRequest } from "../../services/levelTestService";
import type { LessonFrequencyId } from "../../lib/community/types";

const FREQUENCIES: LessonFrequencyId[] = ["freq2", "freq3", "freq5"];
const DURATIONS: (25 | 50)[] = [25, 50];
const HOUR_SLOTS = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  name: string;
  contact: string;
  date: string;
  time: string;
  frequency: LessonFrequencyId | "";
  duration: 25 | 50 | 0;
  platform: MeetingPlatformId | "";
  referredTeacher: string;
  studentEnglishName: string;
  studentAge: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  contact: "",
  date: "",
  time: "",
  frequency: "",
  duration: 0,
  platform: "",
  referredTeacher: "",
  studentEnglishName: "",
  studentAge: "",
};

function SelectCard({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-center text-sm font-bold transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-200 text-slate-500 hover:border-brand-300"
      }`}
    >
      {children}
    </button>
  );
}

export function LevelTestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation(["auth", "home"]);
  const { lang } = useLanguage();
  const [form, setFormRaw] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const setForm = (next: FormState) => {
    setTouched(true);
    setFormRaw(next);
  };
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const timeZone = useMemo(() => getLanguageTimeZone(lang) ?? detectLocalTimeZone(), [lang]);

  const isValid =
    form.name.trim() !== "" &&
    form.contact.trim() !== "" &&
    form.date !== "" &&
    form.time !== "" &&
    form.frequency !== "" &&
    form.duration !== 0 &&
    form.platform !== "" &&
    form.studentEnglishName.trim() !== "" &&
    /^\d+$/.test(form.studentAge.trim()) &&
    Number(form.studentAge) >= 3 &&
    Number(form.studentAge) <= 99;

  const handleClose = () => {
    setFormRaw(EMPTY_FORM);
    setTouched(false);
    setSubmitError(null);
    setSubmitted(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    setSubmitError(null);
    const result = await submitLevelTestRequest({
      contactName: form.name,
      contactPhone: form.contact,
      preferredTimeUTC: zonedWallTimeToUtcISO(form.date, form.time, timeZone),
      preferredTimeZone: timeZone,
      lessonFrequency: form.frequency as LessonFrequencyId,
      lessonDurationMin: form.duration as 25 | 50,
      meetingPlatform: form.platform as MeetingPlatformId,
      referredTeacherName: form.referredTeacher || undefined,
      studentEnglishName: form.studentEnglishName,
      studentAge: Number(form.studentAge),
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(
        t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }),
      );
      return;
    }
    setSubmitted(true);
  };

  const errorFor = (condition: boolean) =>
    touched && condition ? (
      <p className="mt-1 text-[11.5px] text-red-600">{t("level_test.validation_required")}</p>
    ) : null;

  const selectionSummary =
    form.frequency && form.duration
      ? t("level_test.selection_summary", {
          frequency: t(`home:pricing.frequency.${form.frequency}`),
          duration: t("level_test.duration_option", { min: form.duration }),
        })
      : null;

  return (
    <Modal open={open} onClose={handleClose} title={t("level_test.title")} maxWidth="max-w-lg">
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-accent-500" size={40} />
          <p className="text-sm text-slate-600">
            {t("level_test.success_title")}
            <br />
            {t("level_test.success_desc")}
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("level_test.confirm")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-sm leading-relaxed text-slate-500">{t("level_test.intro")}</p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.name_label")}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("level_test.name_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {errorFor(form.name.trim() === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.contact_label")}</label>
            <input
              type="tel"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder={t("level_test.contact_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {errorFor(form.contact.trim() === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.date_label")}</label>
            <input
              type="date"
              min={todayISODate()}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {errorFor(form.date === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.time_slot_label")}</label>
            <p className="mb-2 text-[11.5px] text-slate-400">{t("level_test.time_zone_note", { zone: timeZone })}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {HOUR_SLOTS.map((slot) => (
                <SelectCard key={slot} active={form.time === slot} onClick={() => setForm({ ...form, time: slot })}>
                  {slot}
                </SelectCard>
              ))}
            </div>
            {errorFor(form.time === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.frequency_label")}</label>
            <div className="flex gap-2">
              {FREQUENCIES.map((f) => (
                <SelectCard key={f} active={form.frequency === f} onClick={() => setForm({ ...form, frequency: f })}>
                  {t(`home:pricing.frequency.${f}`)}
                </SelectCard>
              ))}
            </div>
            {errorFor(form.frequency === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.duration_label")}</label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <SelectCard key={d} active={form.duration === d} onClick={() => setForm({ ...form, duration: d })}>
                  {t("level_test.duration_option", { min: d })}
                </SelectCard>
              ))}
            </div>
            {errorFor(form.duration === 0)}
          </div>

          {selectionSummary && (
            <p className="rounded-lg bg-accent-50 px-3.5 py-2 text-center text-xs font-bold text-accent-700">
              {selectionSummary}
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.platform_label")}</label>
            <div className="flex gap-2">
              {MEETING_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForm({ ...form, platform: p.id })}
                  className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-center text-xs font-bold transition ${
                    form.platform === p.id ? "text-white" : "border-slate-200 text-slate-500 hover:border-brand-300"
                  }`}
                  style={form.platform === p.id ? { borderColor: p.brandColor, backgroundColor: p.brandColor } : undefined}
                >
                  {p.shortName}
                </button>
              ))}
            </div>
            {errorFor(form.platform === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("level_test.referred_teacher_label")}{" "}
              <span className="font-normal text-slate-400">({t("level_test.optional_badge")})</span>
            </label>
            <p className="mb-1.5 text-[11.5px] text-slate-400">{t("level_test.referred_teacher_note")}</p>
            <input
              type="text"
              value={form.referredTeacher}
              onChange={(e) => setForm({ ...form, referredTeacher: e.target.value })}
              placeholder={t("level_test.referred_teacher_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.student_name_label")}</label>
            <input
              type="text"
              value={form.studentEnglishName}
              onChange={(e) => setForm({ ...form, studentEnglishName: e.target.value })}
              placeholder={t("level_test.student_name_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {errorFor(form.studentEnglishName.trim() === "")}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("level_test.student_age_label")}</label>
            <input
              type="number"
              inputMode="numeric"
              min={3}
              max={99}
              value={form.studentAge}
              onChange={(e) => setForm({ ...form, studentAge: e.target.value })}
              placeholder={t("level_test.student_age_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {touched && !/^\d+$/.test(form.studentAge.trim()) && (
              <p className="mt-1 text-[11.5px] text-red-600">{t("level_test.validation_required")}</p>
            )}
            {touched &&
              /^\d+$/.test(form.studentAge.trim()) &&
              (Number(form.studentAge) < 3 || Number(form.studentAge) > 99) && (
                <p className="mt-1 text-[11.5px] text-red-600">{t("level_test.validation_age")}</p>
              )}
          </div>

          {submitError && <p className="text-[13px] text-red-600">{submitError}</p>}

          <button
            type="submit"
            disabled={submitting || !isValid}
            className="w-full rounded-lg bg-accent-500 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("level_test.submitting") : t("level_test.submit")}
          </button>
        </form>
      )}
    </Modal>
  );
}
