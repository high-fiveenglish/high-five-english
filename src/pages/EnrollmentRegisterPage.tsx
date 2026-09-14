import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, LogIn, MessageCircle, Info } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { SeoHead } from "../components/seo/SeoHead";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { getLanguageCurrency } from "../i18n/config";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../data/meetingPlatforms";
import { PRICING_SEED, getPrice } from "../data/pricing";
import { formatPrice } from "../data/currencies";
import { listActiveConsultChannels } from "../services/consultChannelService";
import {
  getMyPointBalance,
  submitEnrollmentRequest,
  weeklyDaysForFrequency,
} from "../services/enrollmentRequestService";
import type { ConsultChannel, EnrollmentDurationId } from "../lib/community/types";
import type { LessonFrequencyId } from "../lib/community/types";
import {
  CURRICULUM_AGE_GROUPS,
  CURRICULUM_FIELDS_BY_AGE_GROUP,
  curriculumTrackId,
  type CurriculumAgeGroup,
  type CurriculumField,
} from "../data/curriculumTracks";

const DURATIONS: EnrollmentDurationId[] = ["1m", "3m", "6m"];
const FREQUENCIES: LessonFrequencyId[] = ["freq5", "freq3", "freq2"];
const LESSON_LENGTHS: (25 | 50)[] = [25, 50];

// KST wall-clock slots, 06:00 through 23:30 in 30-minute steps — always Korea time
// regardless of who's submitting, per the academy's own scheduling (unlike the level
// test modal, which converts to the visitor's own zone).
const KST_TIME_SLOTS = Array.from({ length: 36 }, (_, i) => {
  const totalMinutes = 6 * 60 + i * 30;
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}:${m}`;
});

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

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

interface FormState {
  platform: MeetingPlatformId | "";
  teamsId: string;
  ageGroup: CurriculumAgeGroup | "";
  field: CurriculumField | "";
  durationId: EnrollmentDurationId | "";
  frequency: LessonFrequencyId | "";
  lessonLength: 25 | 50 | 0;
  useAllPoints: boolean;
  startDate: string;
  startTime: string;
}

const EMPTY_FORM: FormState = {
  platform: "",
  teamsId: "",
  ageGroup: "",
  field: "",
  durationId: "",
  frequency: "",
  lessonLength: 0,
  useAllPoints: false,
  startDate: "",
  startTime: "",
};

export function EnrollmentRegisterPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  const { t } = useTranslation(["enroll", "classroom", "home"]);
  const { actor, role, isRealAccount, studentApiToken } = useAuth();
  // 수강신청은 로그인한 실제 학생 계정만 가능하다 — 레벨테스트 신청과 동일한 정책
  // (신청이 그 학생의 studentId에 바로 연결되어야 관리자 쪽 수강신청 관리에서 연락처
  // 등과 함께 정상적으로 연동되기 때문이다. 데모 계정은 실제 DB 행이 없어 이용할 수 없다).
  const canSubmit = role === "student" && isRealAccount && !!studentApiToken;
  const { lang } = useLanguage();
  const currency = getLanguageCurrency(lang) ?? "KRW";
  const weekdayLabels = t("classroom:weekdays_short", { returnObjects: true }) as string[];

  const [form, setFormRaw] = useState<FormState>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const setForm = (next: FormState) => {
    setTouched(true);
    setFormRaw(next);
  };
  const [pointBalance, setPointBalance] = useState(0);
  const [channels, setChannels] = useState<ConsultChannel[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    getMyPointBalance(actor).then(setPointBalance);
  }, [actor]);

  useEffect(() => {
    listActiveConsultChannels().then((all) =>
      setChannels(all.filter((c) => c.id === "kakao" || c.id === "wechat")),
    );
  }, []);

  const price = useMemo(() => {
    if (!form.durationId || !form.frequency || !form.lessonLength) return undefined;
    return getPrice(PRICING_SEED, form.durationId, form.frequency, form.lessonLength, currency);
  }, [form.durationId, form.frequency, form.lessonLength, currency]);

  const discount = currency === "KRW" && form.useAllPoints ? Math.min(pointBalance, price ?? 0) : 0;

  const isValid =
    form.platform !== "" &&
    (form.platform !== "teams" || form.teamsId.trim() !== "") &&
    form.ageGroup !== "" &&
    form.field !== "" &&
    form.durationId !== "" &&
    form.frequency !== "" &&
    form.lessonLength !== 0 &&
    form.startDate !== "" &&
    form.startTime !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !studentApiToken || form.ageGroup === "" || form.field === "") return;

    setSubmitting(true);
    setSubmitError(null);
    const result = await submitEnrollmentRequest(
      {
        meetingPlatform: form.platform as MeetingPlatformId,
        teamsId: form.platform === "teams" ? form.teamsId : undefined,
        curriculumTrack: curriculumTrackId(form.ageGroup, form.field),
        durationId: form.durationId as EnrollmentDurationId,
        lessonFrequency: form.frequency as LessonFrequencyId,
        lessonDurationMin: form.lessonLength as 25 | 50,
        preferredStartDate: form.startDate,
        preferredStartTimeKST: form.startTime,
        useAllPoints: form.useAllPoints,
        pointBalance,
      },
      studentApiToken,
    );
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
    touched && condition ? <p className="mt-1 text-[11.5px] text-red-600">{t("validation_required")}</p> : null;

  const weekdayValue = form.frequency
    ? weeklyDaysForFrequency(form.frequency)
        .map((d) => weekdayLabels[d])
        .join(", ")
    : null;

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="enroll" path="/enroll" />
      <Container className="max-w-2xl">
        <SectionHeading eyebrow={t("hero.eyebrow")} title={t("hero.title")} description={t("hero.description")} />

        {!canSubmit ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
              <LogIn size={26} />
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{t("login_required_desc")}</p>
            <button
              onClick={onOpenLogin}
              className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("login_cta")}
            </button>
          </div>
        ) : submitted ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <CheckCircle2 className="text-accent-500" size={40} />
            <p className="text-sm text-slate-600">
              {t("success_title")}
              <br />
              {t("success_desc")}
            </p>
            <button
              onClick={() => {
                setFormRaw(EMPTY_FORM);
                setTouched(false);
                setSubmitted(false);
              }}
              className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("confirm")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-8"
          >
            {/* 1. platform */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-brand-950">{t("section_platform.title")}</label>
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
              {form.platform === "teams" && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={form.teamsId}
                    onChange={(e) => setForm({ ...form, teamsId: e.target.value })}
                    placeholder={t("section_platform.teams_id_placeholder")}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  {errorFor(form.teamsId.trim() === "")}
                </div>
              )}
            </div>

            {/* 2. curriculum track: age group, then a field list scoped to that age group */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-brand-950">{t("section_track.title")}</label>
              <p className="mb-1.5 text-xs font-medium text-slate-500">{t("section_track.age_group_label")}</p>
              <div className="flex gap-2">
                {CURRICULUM_AGE_GROUPS.map((g) => (
                  <SelectCard
                    key={g}
                    active={form.ageGroup === g}
                    onClick={() => setForm({ ...form, ageGroup: g, field: "" })}
                  >
                    {t(`section_track.age_groups.${g}`)}
                  </SelectCard>
                ))}
              </div>
              {errorFor(form.ageGroup === "")}

              <p className="mb-1.5 mt-3 text-xs font-medium text-slate-500">{t("section_track.field_label")}</p>
              {form.ageGroup === "" ? (
                <p className="text-[12.5px] text-slate-400">{t("section_track.field_placeholder")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {CURRICULUM_FIELDS_BY_AGE_GROUP[form.ageGroup].map((f) => (
                    <SelectCard key={f} active={form.field === f} onClick={() => setForm({ ...form, field: f })}>
                      {t(`section_track.fields.${f}`)}
                    </SelectCard>
                  ))}
                </div>
              )}
              {errorFor(form.ageGroup !== "" && form.field === "")}
            </div>

            {/* 3. duration / frequency / lesson length */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-brand-950">{t("section_plan.title")}</label>
              <div className="space-y-2.5">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{t("section_plan.duration_label")}</p>
                  <div className="flex gap-2">
                    {DURATIONS.map((d) => (
                      <SelectCard key={d} active={form.durationId === d} onClick={() => setForm({ ...form, durationId: d })}>
                        {t(`home:pricing.durations.${d}.label`)}
                      </SelectCard>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{t("section_plan.frequency_label")}</p>
                  <div className="flex gap-2">
                    {FREQUENCIES.map((f) => (
                      <SelectCard key={f} active={form.frequency === f} onClick={() => setForm({ ...form, frequency: f })}>
                        {t(`home:pricing.frequency.${f}`)}
                      </SelectCard>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{t("section_plan.lesson_length_label")}</p>
                  <div className="flex gap-2">
                    {LESSON_LENGTHS.map((len) => (
                      <SelectCard key={len} active={form.lessonLength === len} onClick={() => setForm({ ...form, lessonLength: len })}>
                        {t("section_plan.lesson_length_option", { min: len })}
                      </SelectCard>
                    ))}
                  </div>
                </div>
              </div>
              {errorFor(form.durationId === "" || form.frequency === "" || form.lessonLength === 0)}
              {form.platform === "zoom" && form.lessonLength === 50 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent-50/60 px-4 py-3">
                  <Info size={14} className="mt-0.5 shrink-0 text-accent-500" />
                  <p className="text-[12.5px] font-medium leading-relaxed text-accent-700">
                    {t("section_plan.zoom_50min_notice")}
                  </p>
                </div>
              )}
            </div>

            {/* 4. weekday (derived, read-only) + manager contact note */}
            {weekdayValue && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold text-brand-950">{t("section_weekday.title")}</p>
                <p className="mt-1 text-sm font-bold text-brand-700">
                  {t("section_weekday.value_label")}: {weekdayValue}
                </p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">{t("section_weekday.custom_note")}</p>
                {channels.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {channels.map((c) => (
                      <span key={c.id} className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                        <MessageCircle size={11} className="text-brand-500" />
                        {t(`section_weekday.contact_${c.id}`, { defaultValue: c.displayName })}: {c.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5. points discount */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-brand-950">{t("section_points.title")}</label>
              <p className="text-sm text-slate-600">
                {t("section_points.balance_label")}:{" "}
                <span className="font-bold text-brand-950">{t("section_points.balance_value", { count: pointBalance })}</span>
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.useAllPoints}
                  onChange={(e) => setForm({ ...form, useAllPoints: e.target.checked })}
                  disabled={pointBalance <= 0}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                />
                {t("section_points.apply_checkbox")}
              </label>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t("section_points.earn_note")}</p>
            </div>

            {/* price preview */}
            {price !== undefined && (
              <div className="rounded-xl border border-accent-100 bg-accent-50/50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t("price_preview.estimated_label")}</span>
                  <span className="font-bold text-brand-950">{formatPrice(price, currency)}</span>
                </div>
                {discount > 0 && (
                  <>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-slate-500">{t("price_preview.discount_label")}</span>
                      <span className="font-bold text-red-500">-{formatPrice(discount, currency)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-accent-100 pt-1.5 text-sm">
                      <span className="font-bold text-slate-600">{t("price_preview.final_label")}</span>
                      <span className="font-extrabold text-accent-600">{formatPrice(price - discount, currency)}</span>
                    </div>
                  </>
                )}
                {currency !== "KRW" && form.useAllPoints && pointBalance > 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">{t("price_preview.krw_only_note")}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">{t("price_preview.disclaimer")}</p>
              </div>
            )}

            {/* 6. start date/time */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-brand-950">{t("section_schedule.title")}</label>
              <p className="mb-2 text-[11.5px] text-slate-400">{t("section_schedule.time_zone_note")}</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{t("section_schedule.start_date_label")}</label>
                  <input
                    type="date"
                    min={todayISODate()}
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  {errorFor(form.startDate === "")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{t("section_schedule.start_time_label")}</label>
                  <select
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="" disabled>
                      --:--
                    </option>
                    {KST_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  {errorFor(form.startTime === "")}
                </div>
              </div>
            </div>

            {submitError && <p className="text-[13px] text-red-600">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting || !isValid}
              className="w-full rounded-lg bg-accent-500 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </form>
        )}
      </Container>
    </section>
  );
}
