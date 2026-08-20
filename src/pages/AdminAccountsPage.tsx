import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { ALL_PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey } from "../lib/auth/types";
import { listAccounts, updateAdminPermissions, type AccountRow } from "../services/adminService";
import type { Actor } from "../lib/auth/types";

const ROLE_LABELS: Record<AccountRow["role"], string> = {
  general_manager: "General Manager",
  general_admin: "General Administrator",
  teacher: "Teacher",
  student: "Student",
};

function AdminRow({
  actor,
  account,
  onSaved,
}: {
  actor: Actor;
  account: AccountRow;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set(account.permissions));
  const [saving, setSaving] = useState(false);

  const toggle = (key: PermissionKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await updateAdminPermissions(actor, account.id, [...selected]);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-brand-950">{account.name}</p>
          <p className="text-xs text-slate-400">아이디: {account.id}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <Save size={13} /> {saving ? "저장 중..." : "권한 저장"}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_PERMISSION_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => toggle(key)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            {PERMISSION_LABELS[key]}
          </label>
        ))}
      </div>
    </div>
  );
}

function AdminAccountsContent() {
  const { actor } = useAuth();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);

  const load = () => {
    if (!actor) return;
    listAccounts(actor).then((res) => {
      if (res.ok) setAccounts(res.value);
    });
  };

  useEffect(load, [actor]);

  if (!actor) return null;
  const admins = accounts.filter((a) => a.role === "general_admin");
  const others = accounts.filter((a) => a.role !== "general_admin");

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow="관리자" title="계정 및 권한 관리" align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          General Administrator 계정마다 사용할 수 있는 기능을 여기서 지정합니다. 여기서 부여하지
          않은 기능은 화면에서 숨겨질 뿐 아니라, 해당 계정으로 직접 호출해도 서비스 단계에서
          차단됩니다.
        </p>

        <div className="mt-8 space-y-4">
          {admins.map((a) => (
            <AdminRow key={a.id} actor={actor} account={a} onSaved={load} />
          ))}
        </div>

        <div className="mt-10">
          <h3 className="mb-3 text-sm font-bold text-brand-950">전체 계정 목록</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {["아이디", "이름", "역할"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...admins, ...others].map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">{a.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">{a.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{ROLE_LABELS[a.role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function AdminAccountsPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard allow={["general_manager"]} onOpenLogin={onOpenLogin}>
      <AdminAccountsContent />
    </RouteGuard>
  );
}
