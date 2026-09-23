import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { CURRENCIES } from "../data/currencies";
import { listPricing, updatePricingPrice } from "../services/pricingService";
import { getPrice } from "../data/pricing";
import type { PricingDuration } from "../data/pricing";
import type { CurrencyCode } from "../data/currencies";

// 셀 하나를 유일하게 가리키는 키 — durationId(1m/3m/6m)는 탭이라 화면엔 하나만 보이지만,
// 드래프트는 durationId까지 포함해 관리해야 다른 탭에서 고친 값이 탭을 옮겨도 안 없어진다.
type CellKey = `${string}|${25 | 50}|${string}|${CurrencyCode}`;
function cellKey(durationId: string, lessonLength: 25 | 50, frequencyId: string, currency: CurrencyCode): CellKey {
  return `${durationId}|${lessonLength}|${frequencyId}|${currency}`;
}

type SaveState = "idle" | "saving" | "success" | "error";

function PriceCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
  );
}

function AdminPricingContent() {
  const { adminApiToken } = useAuth();
  const { t } = useTranslation(["admin", "home"]);
  const [durations, setDurations] = useState<PricingDuration[]>([]);
  const [activeId, setActiveId] = useState("1m");
  // 화면에서 아직 저장 안 한 수정값 — blur/탭 전환으로는 절대 DB에 안 나가고, [저장]을
  // 눌러야만 반영된다. 키가 durationId까지 포함하므로 여러 탭을 오가며 고친 값도 전부
  // 여기 누적된 채로 남는다(탭 전환 시 사라지지 않음).
  const [drafts, setDrafts] = useState<Partial<Record<CellKey, string>>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    listPricing().then(setDurations);
  }, []);

  const dirtyCount = Object.keys(drafts).length;

  // 저장하지 않은 변경사항이 있는 채로 탭을 닫거나 새로고침하면 브라우저 기본 확인창으로
  // 경고한다 — SPA 내부 페이지 이동까지 막지는 않는다(기존 라우팅 동작을 그대로 유지).
  useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyCount]);

  const active = durations.find((d) => d.id === activeId);

  const getDraftValue = (
    durationId: string,
    lessonLength: 25 | 50,
    frequencyId: string,
    currency: CurrencyCode,
    original: number | undefined,
  ): string => {
    const key = cellKey(durationId, lessonLength, frequencyId, currency);
    return drafts[key] ?? String(original ?? "");
  };

  const setDraftValue = (
    durationId: string,
    lessonLength: 25 | 50,
    frequencyId: string,
    currency: CurrencyCode,
    raw: string,
  ) => {
    const key = cellKey(durationId, lessonLength, frequencyId, currency);
    setDrafts((prev) => ({ ...prev, [key]: raw }));
    // 저장 실패/성공 표시는 새 수정이 시작되면 더 이상 유효하지 않으니 지운다.
    if (saveState !== "idle") setSaveState("idle");
  };

  const handleSave = async () => {
    if (dirtyCount === 0 || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);

    // 드래프트 중 실제로 원본과 값이 다른 것만 저장 대상으로 추린다(예: 고쳤다가 다시
    // 원래 숫자로 되돌린 셀은 저장할 필요가 없다).
    const changes: {
      durationId: string;
      lessonLength: 25 | 50;
      frequencyId: string;
      currency: CurrencyCode;
      amount: number;
    }[] = [];
    for (const [key, raw] of Object.entries(drafts)) {
      if (raw === undefined) continue;
      const [durationId, lessonLengthStr, frequencyId, currency] = key.split("|") as [
        string,
        string,
        string,
        CurrencyCode,
      ];
      const lessonLength = Number(lessonLengthStr) as 25 | 50;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0) {
        setSaveState("error");
        setSaveError(`${durationId} / ${frequencyId} 값이 올바르지 않습니다. 0 이상의 숫자를 입력해주세요.`);
        return;
      }
      const original = getPrice(durations, durationId, frequencyId, lessonLength, currency);
      if (amount === original) continue;
      changes.push({ durationId, lessonLength, frequencyId, currency, amount });
    }

    if (changes.length === 0) {
      setDrafts({});
      setSaveState("idle");
      return;
    }

    let latest = durations;
    for (const c of changes) {
      const result = await updatePricingPrice(
        adminApiToken,
        c.durationId,
        c.frequencyId,
        c.lessonLength,
        c.currency,
        c.amount,
      );
      if (!result.ok) {
        setDurations(latest);
        setSaveState("error");
        setSaveError(result.error.message);
        return;
      }
      latest = result.value;
    }

    setDurations(latest);
    setDrafts({});
    setSaveState("success");
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("pricing.admin_title")} align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("pricing.admin_description")}
        </p>

        <div className="mt-6 flex gap-2">
          {durations.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeId === d.id ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
              }`}
            >
              {t(`home:pricing.durations.${d.id}.label`)}
            </button>
          ))}
        </div>

        {active && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("pricing.class_column")}
                  </th>
                  {CURRENCIES.map((c) => (
                    <th
                      key={c.code}
                      className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400"
                    >
                      {c.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([25, 50] as const).map((lessonLength) =>
                  active.rows.map((row) => (
                    <tr
                      key={`${lessonLength}-${row.frequencyId}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {t(`home:pricing.col_${lessonLength}min`)} · {t(`home:pricing.frequency.${row.frequencyId}`)}
                      </td>
                      {CURRENCIES.map((c) => (
                        <td key={c.code} className="px-4 py-2 text-right">
                          <PriceCell
                            value={getDraftValue(
                              active.id,
                              lessonLength,
                              row.frequencyId,
                              c.code,
                              (lessonLength === 25 ? row.price25 : row.price50)[c.code],
                            )}
                            onChange={(raw) => setDraftValue(active.id, lessonLength, row.frequencyId, c.code, raw)}
                          />
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={dirtyCount === 0 || saveState === "saving"}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveState === "saving" ? "저장 중..." : dirtyCount > 0 ? `저장 (${dirtyCount})` : "저장"}
          </button>
          {saveState === "success" && <span className="text-sm font-medium text-emerald-600">저장되었습니다.</span>}
          {saveState === "error" && (
            <span className="text-sm font-medium text-red-600">{saveError ?? "저장에 실패했습니다."}</span>
          )}
          {saveState === "idle" && dirtyCount > 0 && (
            <span className="text-sm text-slate-400">저장하지 않은 변경사항 {dirtyCount}건</span>
          )}
        </div>
      </Container>
    </section>
  );
}

export function AdminPricingPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="pricing"
      onOpenLogin={onOpenLogin}
    >
      <AdminPricingContent />
    </RouteGuard>
  );
}
