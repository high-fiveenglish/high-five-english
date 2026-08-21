import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Music } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import {
  createInstructor,
  updateInstructor,
  type InstructorInput,
} from "../../services/instructorService";
import type { Instructor } from "../../data/instructors";
import { LEVEL_ORDER, LEVEL_LABELS, type CEFRLevel } from "../../data/textbookCatalog";
import type { WeekDay } from "../../lib/scheduling/types";

const WEEKDAYS: WeekDay[] = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_GRADIENTS = [
  "from-brand-500 to-brand-700",
  "from-brand-600 to-brand-900",
  "from-accent-400 to-accent-600",
  "from-brand-400 to-brand-600",
];

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface FormState {
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  bio: string;
  career: string;
  availableHours: string;
  classFeatures: string;
  specialties: string;
  teachingStyle: string;
  published: boolean;
  availableDays: Set<WeekDay>;
  levels: Set<CEFRLevel>;
  photoUrl: string;
  audioSrc: string;
  gradient: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    nameEn: "",
    country: "",
    flag: "",
    bio: "",
    career: "",
    availableHours: "",
    classFeatures: "",
    specialties: "",
    teachingStyle: "",
    published: true,
    availableDays: new Set(),
    levels: new Set(),
    photoUrl: "",
    audioSrc: "",
    gradient: DEFAULT_GRADIENTS[Math.floor(Math.random() * DEFAULT_GRADIENTS.length)],
  };
}

function formFromInstructor(i: Instructor): FormState {
  return {
    name: i.name,
    nameEn: i.nameEn,
    country: i.country,
    flag: i.flag,
    bio: i.bio,
    career: i.career.join("\n"),
    availableHours: i.availableHours,
    classFeatures: i.classFeatures.join("\n"),
    specialties: i.specialties.join("\n"),
    teachingStyle: i.teachingStyle,
    published: i.published,
    availableDays: new Set(i.availableDays),
    levels: new Set(i.levels),
    photoUrl: i.photoUrl ?? "",
    audioSrc: i.audioSrc ?? "",
    gradient: i.gradient,
  };
}

export function AdminInstructorFormModal({
  open,
  instructor,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = creating a new instructor; otherwise editing this one. */
  instructor: Instructor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useAuth();
  const { t } = useTranslation(["admin", "classroom"]);
  const weekdayLabels = t("weekdays_short", { ns: "classroom", returnObjects: true }) as string[];
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(instructor ? formFromInstructor(instructor) : emptyForm());
    setError(null);
  }, [open, instructor]);

  const toggleDay = (day: WeekDay) => {
    setForm((f) => {
      const next = new Set(f.availableDays);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...f, availableDays: next };
    });
  };

  const toggleLevel = (level: CEFRLevel) => {
    setForm((f) => {
      const next = new Set(f.levels);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return { ...f, levels: next };
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setForm((f) => ({ ...f, photoUrl: dataUrl }));
  };

  const handleAudioChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setForm((f) => ({ ...f, audioSrc: dataUrl }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.nameEn.trim() || !form.bio.trim() || !actor) {
      setError(t("instructors.validation_error"));
      return;
    }
    setSubmitting(true);
    setError(null);

    const input: InstructorInput = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim(),
      country: form.country.trim(),
      flag: form.flag.trim(),
      gradient: form.gradient,
      photoUrl: form.photoUrl || undefined,
      audioSrc: form.audioSrc || undefined,
      defaultMeetingPlatform: instructor?.defaultMeetingPlatform,
      bio: form.bio.trim(),
      career: linesToArray(form.career),
      availableDays: [...form.availableDays].sort(),
      availableHours: form.availableHours.trim(),
      classFeatures: linesToArray(form.classFeatures),
      specialties: linesToArray(form.specialties),
      levels: LEVEL_ORDER.filter((l) => form.levels.has(l)),
      teachingStyle: form.teachingStyle.trim(),
      published: form.published,
    };

    const result = instructor
      ? await updateInstructor(actor, instructor.id, input)
      : await createInstructor(actor, input);
    setSubmitting(false);
    if (!result.ok) {
      setError(
        t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }),
      );
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={instructor ? t("instructors.edit_title") : t("instructors.create_title")}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_name")}</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_name_en")}</label>
            <input
              type="text"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_country")}</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_flag")}</label>
            <input
              type="text"
              value={form.flag}
              onChange={(e) => setForm({ ...form, flag: e.target.value })}
              placeholder="🇺🇸"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {/* photo upload */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_photo")}</label>
          <div className="flex items-center gap-3">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-xl font-extrabold text-white ${form.gradient}`}
              >
                {(form.nameEn || form.name || "?")[0]}
              </div>
            )}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-brand-300"
            >
              <Upload size={13} /> {t("instructors.upload_photo")}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </div>
        </div>

        {/* audio upload */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_audio")}</label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:border-brand-300"
            >
              <Music size={13} /> {t("instructors.upload_audio")}
            </button>
            <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioChange} className="hidden" />
            {form.audioSrc && <audio controls src={form.audioSrc} className="h-9 max-w-[220px]" />}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_bio")}</label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_career")}</label>
          <textarea
            value={form.career}
            onChange={(e) => setForm({ ...form, career: e.target.value })}
            rows={3}
            placeholder={t("instructors.multiline_placeholder")}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_class_features")}</label>
            <textarea
              value={form.classFeatures}
              onChange={(e) => setForm({ ...form, classFeatures: e.target.value })}
              rows={3}
              placeholder={t("instructors.multiline_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_specialties")}</label>
            <textarea
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              rows={3}
              placeholder={t("instructors.multiline_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_teaching_style")}</label>
          <input
            type="text"
            value={form.teachingStyle}
            onChange={(e) => setForm({ ...form, teachingStyle: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_available_hours")}</label>
          <input
            type="text"
            value={form.availableHours}
            onChange={(e) => setForm({ ...form, availableHours: e.target.value })}
            placeholder={t("instructors.available_hours_placeholder")}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_available_days")}</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-9 w-9 rounded-lg text-xs font-bold transition ${
                  form.availableDays.has(day)
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 text-slate-500 hover:border-brand-300"
                }`}
              >
                {weekdayLabels[day]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("instructors.field_levels")}</label>
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_ORDER.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => toggleLevel(level)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  form.levels.has(level)
                    ? "bg-brand-600 text-white"
                    : "border border-slate-200 text-slate-500 hover:border-brand-300"
                }`}
              >
                {LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          {t("instructors.field_published")}
        </label>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? t("instructors.saving") : t("instructors.save")}
        </button>
      </form>
    </Modal>
  );
}
