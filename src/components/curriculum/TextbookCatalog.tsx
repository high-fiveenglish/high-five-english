import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TEXTBOOK_CATALOG,
  CATALOG_CATEGORIES,
  LEVEL_ORDER,
  LEVEL_COLORS,
  AGE_GROUPS,
  FOLDERS,
  type CEFRLevel,
  type AgeGroup,
  type Folder,
} from "../../data/textbookCatalog";

const selectClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function TextbookCatalog() {
  const { t } = useTranslation(["curriculum", "textbooks"]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<Folder | "">("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState<CEFRLevel | "">("");
  const [age, setAge] = useState<AgeGroup | "">("");

  const tableHeaders = t("catalog.tableHeaders", { returnObjects: true }) as string[];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEXTBOOK_CATALOG.filter((b) => {
      if (q) {
        const categoryLabel = t(`textbooks:categories.${b.category}`);
        const noteText = t(`textbooks:notes.${b.name}`, { defaultValue: "" });
        const haystack = `${b.name} ${b.category} ${categoryLabel} ${b.levelText} ${noteText} ${b.ages.join(" ")} ${b.folder}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (folder && b.folder !== folder) return false;
      if (category && b.category !== category) return false;
      if (level && !b.levelKeys.includes(level)) return false;
      if (age && !b.ages.includes(age)) return false;
      return true;
    });
  }, [query, folder, category, level, age, t]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("catalog.searchPlaceholder")}
            className={`${selectClass} w-full pl-9`}
          />
        </div>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value as Folder | "")}
          className={selectClass}
        >
          <option value="">{t("catalog.allFolders")}</option>
          {FOLDERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectClass}
        >
          <option value="">{t("catalog.allCategories")}</option>
          {CATALOG_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`textbooks:categories.${c}`)}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as CEFRLevel | "")}
          className={selectClass}
        >
          <option value="">{t("catalog.allLevels")}</option>
          {LEVEL_ORDER.map((l) => (
            <option key={l} value={l}>
              {t(`textbooks:level_labels.${l}`)}
            </option>
          ))}
        </select>
        <select
          value={age}
          onChange={(e) => setAge(e.target.value as AgeGroup | "")}
          className={selectClass}
        >
          <option value="">{t("catalog.allAges")}</option>
          {AGE_GROUPS.map((a) => (
            <option key={a} value={a}>
              {t(`textbooks:age_groups.${a}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-mono text-xs text-slate-400">
          {t("catalog.countLabel", { filtered: filtered.length, total: TEXTBOOK_CATALOG.length })}
        </span>
        <span className="hidden text-slate-200 sm:inline">|</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {LEVEL_ORDER.map((l) => (
            <span key={l} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: LEVEL_COLORS[l] }}
              />
              {t(`textbooks:level_labels.${l}`)} {t(`textbooks:level_descriptions.${l}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {tableHeaders.map((h) => (
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {t("catalog.emptyState")}
                </td>
              </tr>
            )}
            {filtered.map((b) => (
              <tr key={b.name} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/40">
                <td className="px-4 py-3 text-sm font-bold text-brand-950">
                  {b.name}
                  {b.unverified && (
                    <span className="ml-1 font-mono text-[11px] font-normal text-slate-400">(?)</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {b.folder}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {t(`textbooks:categories.${b.category}`)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[12px] font-bold text-slate-600">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: LEVEL_COLORS[b.chipLevel] }}
                    />
                    {b.levelText}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                  {b.ages.map((a) => t(`textbooks:age_groups.${a}`)).join(", ")}
                </td>
                <td className="max-w-[260px] px-4 py-3 text-[12.5px] leading-relaxed text-slate-500">
                  {t(`textbooks:notes.${b.name}`, { defaultValue: "" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
        {t("catalog.footnote")}
      </p>
    </div>
  );
}
