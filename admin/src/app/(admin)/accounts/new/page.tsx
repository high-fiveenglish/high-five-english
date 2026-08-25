import { notFound } from "next/navigation";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { AccountCreateForm } from "./AccountCreateForm";

export default async function NewAccountPage() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">계정 등록</h1>
      <AccountCreateForm />
    </div>
  );
}
