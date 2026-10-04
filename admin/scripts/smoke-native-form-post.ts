// MANUAL server-level regression (not part of CI, not matched by the test-*.ts convention): replays NATIVE (no-JavaScript) form POSTs against a
// running admin server and checks that every error path answers quickly. It reproduces the defect found by the rehearsal browser smoke test:
// a bound server action (.bind(null, sessionId)) behind useActionState never finished rendering on the server after a native POST that returned
// an error — no response, CPU at 100%. Both forms in ClassRecordingPanel (Confirm speaker, Publish) now take the lesson id from a hidden field.
//
// Usage (against a LOCAL server on a REHEARSAL database with synthetic E2E-TEST rows only — it refuses any other host):
//   BASE=http://127.0.0.1:3201 ADMIN_SESSION_SECRET=... OWNER_TEACHER_ID=102 OTHER_TEACHER_ID=103 \
//   CONFIRM_SESSION_ID=<lesson whose recording is NEEDS_SPEAKER_CONFIRMATION> PUBLISH_SESSION_ID=<lesson whose recording is NEEDS_REVIEW> \
//   npx tsx scripts/smoke-native-form-post.ts
// It never submits a VALID speaker label or a VALID publish, so it changes nothing: every request below must be rejected.
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "";
const SECRET = process.env.ADMIN_SESSION_SECRET ?? "";
const OWNER = Number(process.env.OWNER_TEACHER_ID);
const OTHER = Number(process.env.OTHER_TEACHER_ID);
const CONFIRM_SESSION = Number(process.env.CONFIRM_SESSION_ID);
const PUBLISH_SESSION = Number(process.env.PUBLISH_SESSION_ID);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 20000);

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw new Error("BASE must be a local server (http://127.0.0.1:PORT or http://localhost:PORT)");
if (!SECRET || ![OWNER, OTHER, CONFIRM_SESSION, PUBLISH_SESSION].every(Number.isInteger)) throw new Error("ADMIN_SESSION_SECRET, OWNER_TEACHER_ID, OTHER_TEACHER_ID, CONFIRM_SESSION_ID and PUBLISH_SESSION_ID are required");

const cookieFor = (teacherId: number) => `teacher_session=${teacherId}.${createHmac("sha256", SECRET).update(`teacher:${teacherId}`).digest("hex")}`;

type Hidden = [string, string][];
async function harvest(teacherId: number, sessionId: number, formMarker: string): Promise<Hidden> {
  const html = await (await fetch(`${BASE}/teacher/sessions/${sessionId}`, { headers: { cookie: cookieFor(teacherId) } })).text();
  const form = html.split("<form").slice(1).find((f) => f.includes(formMarker));
  if (!form) throw new Error(`form with "${formMarker}" not found on lesson ${sessionId} (is the recording in the right state?)`);
  return [...form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [m[1], (m[2] ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')] as [string, string]);
}

interface Outcome {
  status: number;
  ms: number;
  text: string;
}
async function nativePost(teacherId: number, urlSessionId: number, hidden: Hidden, fields: Record<string, string>): Promise<Outcome> {
  const fd = new FormData();
  for (const [n, v] of hidden) fd.append(n, v);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/teacher/sessions/${urlSessionId}`, {
    method: "POST",
    body: fd,
    headers: { cookie: cookieFor(teacherId), origin: BASE },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, ms: Date.now() - t0, text: await res.text() };
}
const withSessionId = (hidden: Hidden, value: string): Hidden => hidden.map(([n, v]) => [n, n === "sessionId" ? value : v]);

let failures = 0;
async function check(name: string, run: () => Promise<Outcome>, expectText: string) {
  try {
    const r = await run();
    const ok = r.text.includes(expectText) && r.status < 500;
    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} -> ${r.status} in ${r.ms} ms${ok ? "" : ` (expected "${expectText}")`}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name} -> ${(e as Error).name} (no response within ${TIMEOUT_MS} ms: the server hangs)`);
  }
}

const MALFORMED_IDS = ["", "0", "-1", "abc", "1e3", "2.5", "999999999", "9007199254740993", "NaN", "Infinity"];

async function main() {
  const NOT_YOURS = "only confirm speakers for your own classes";
  const confirmForm = await harvest(OWNER, CONFIRM_SESSION, 'name="teacherSpeaker"');
  console.log(`\n== Confirm speaker form (lesson ${CONFIRM_SESSION})`);
  for (const label of ["Z", "A' OR '1'='1", "", "A".repeat(200), "가\u0000나"]) {
    await check(`owner, invalid label ${JSON.stringify(label.slice(0, 12))}`, () => nativePost(OWNER, CONFIRM_SESSION, confirmForm, { teacherSpeaker: label }), "select one of the speakers listed");
  }
  for (const id of MALFORMED_IDS) await check(`owner, sessionId=${JSON.stringify(id)}`, () => nativePost(OWNER, CONFIRM_SESSION, withSessionId(confirmForm, id), { teacherSpeaker: "A" }), NOT_YOURS);
  await check("other teacher, valid label", () => nativePost(OTHER, CONFIRM_SESSION, confirmForm, { teacherSpeaker: "A", teacherId: String(OWNER) }), NOT_YOURS);

  const publishForm = await harvest(OWNER, PUBLISH_SESSION, 'name="confirmOverwrite"');
  console.log(`\n== Publish form (lesson ${PUBLISH_SESSION})`);
  await check("owner, empty content", () => nativePost(OWNER, PUBLISH_SESSION, publishForm, { content: "   " }), "Draft content is empty");
  await check("owner, content too long", () => nativePost(OWNER, PUBLISH_SESSION, publishForm, { content: "x".repeat(20001) }), "too long");
  for (const id of MALFORMED_IDS) await check(`owner, sessionId=${JSON.stringify(id)}`, () => nativePost(OWNER, PUBLISH_SESSION, withSessionId(publishForm, id), { content: "synthetic text" }), "only publish drafts for your own classes");
  await check("other teacher, valid content", () => nativePost(OTHER, PUBLISH_SESSION, publishForm, { content: "synthetic text" }), "only publish drafts for your own classes");

  console.log(failures === 0 ? "\nAll native-POST error paths answered quickly." : `\n${failures} check(s) failed.`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
});
