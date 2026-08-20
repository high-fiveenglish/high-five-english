import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { listLevelTestRequests } from "../services/levelTestService";
import { getMeetingPlatform } from "../data/meetingPlatforms";
import { formatInTimeZone } from "../lib/timezone";
import type { LevelTestRequest } from "../lib/community/types";

function formatDateTime(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

function AdminLevelTestContent() {
  const { actor } = useAuth();
  const { t } = useTranslation(["admin", "home"]);
  const [rows, setRows] = useState<LevelTestRequest[]>([]);

  useEffect(() => {
    if (!actor) return;
    listLevelTestRequests(actor).then((res) => {
      if (res.ok) setRows(res.value);
    });
  }, [actor]);

  const headers = t("level_test.table_headers", { returnObjects: true }) as Record<string, string>;

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-6xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("level_test.admin_title")} align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("level_test.admin_description")}
        </p>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {Object.values(headers).map((h, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {t("level_test.no_rows")}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {r.contactName}
                    <span className="block text-[11px] text-slate-400">{r.contactPhone}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
                    {r.studentEnglishName}
                    <span className="ml-1.5 font-normal text-slate-400">
                      ({t("level_test.age_value", { age: r.studentAge })})
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-600">
                    <span className="font-semibold text-brand-700">
                      {formatInTimeZone(r.preferredTimeUTC, r.preferredTimeZone)}
                    </span>
                    <span className="block text-slate-400">({r.preferredTimeZone})</span>
                    <span className="block text-slate-400">
                      {t("level_test.kst_label")}: {formatInTimeZone(r.preferredTimeUTC, "Asia/Seoul")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-600">
                    {t(`home:pricing.frequency.${r.lessonFrequency}`)} · {r.lessonDurationMin}
                    {t("level_test.min_suffix")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {getMeetingPlatform(r.meetingPlatform).shortName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    {r.referredTeacherName || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                      {t(`level_test.status_labels.${r.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}

export function AdminLevelTestPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="levelTest"
      onOpenLogin={onOpenLogin}
    >
      <AdminLevelTestContent />
    </RouteGuard>
  );
}
