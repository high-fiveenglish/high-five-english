import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { CheckCircle2 } from "lucide-react";

export function LevelTestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("auth");
  const ageGroups = t("level_test.age_groups", { returnObjects: true }) as string[];
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    ageGroup: ageGroups[1] ?? "",
    time: "",
  });

  const handleClose = () => {
    setSubmitted(false);
    setForm({ name: "", contact: "", ageGroup: ageGroups[1] ?? "", time: "" });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.contact.trim()) return;
    setSubmitted(true);
  };

  return (
    <Modal open={open} onClose={handleClose} title={t("level_test.title")}>
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
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <p className="mb-1 text-sm leading-relaxed text-slate-500">
            {t("level_test.intro")}
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("level_test.name_label")}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("level_test.name_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("level_test.contact_label")}
            </label>
            <input
              type="tel"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder={t("level_test.contact_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("level_test.age_group_label")}
            </label>
            <div className="flex flex-wrap gap-2">
              {ageGroups.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setForm({ ...form, ageGroup: g })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    form.ageGroup === g
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 text-slate-500 hover:border-brand-300"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("level_test.time_label")}
            </label>
            <input
              type="text"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              placeholder={t("level_test.time_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-accent-500 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
          >
            {t("level_test.submit")}
          </button>
        </form>
      )}
    </Modal>
  );
}
