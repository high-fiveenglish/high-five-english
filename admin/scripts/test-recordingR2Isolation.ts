// Private recording storage: configuration, the signed URLs (built offline with dummy credentials — nothing is sent anywhere), and static checks that
// the recording code can never touch the PUBLIC teacher-media bucket, never leak a URL / key / credential, and never submit to AssemblyAI from the
// recovery. No database, no network, no real credentials. Run from admin/: npx tsx scripts/test-recordingR2Isolation.ts
import fs from "node:fs";
import path from "node:path";
import { createRecordingStore, getRecordingStore, isRecordingStorageConfigured, readRecordingR2Config } from "../src/lib/recordingR2";
import { isRecordingIntakeAvailable, recordingWebhookUrl } from "../src/lib/recordingIntakeConfig";
import { buildTranscriptRequestBody } from "../src/lib/assemblyai";
import { generateRecordingKey } from "../src/lib/recordingUpload";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const ENDPOINT = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
const GOOD = { R2_RECORDINGS_ENDPOINT: ENDPOINT, R2_RECORDINGS_ACCESS_KEY_ID: "AKIDEXAMPLE0000", R2_RECORDINGS_SECRET_ACCESS_KEY: "dummy-secret-not-real", R2_RECORDINGS_BUCKET_NAME: "hifive-recordings-private" };

// ── configuration ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const cfg = readRecordingR2Config(GOOD);
  assert(cfg?.bucket === "hifive-recordings-private" && cfg.endpoint === ENDPOINT, "config: the four R2_RECORDINGS_* variables are read");
  for (const missing of Object.keys(GOOD)) {
    const env: Record<string, string | undefined> = { ...GOOD };
    delete env[missing];
    assert(readRecordingR2Config(env) === null && !isRecordingStorageConfigured(env), `config: without ${missing} the storage is 'not configured'`);
  }
  assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_BUCKET_NAME: "  " }) === null, "config: a blank value counts as missing");
  assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_ENDPOINT: "http://x.r2.cloudflarestorage.com" }) === null, "config: the endpoint must be https");
  assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_ENDPOINT: `${ENDPOINT}/hifive-recordings-private` }) === null, "config: the endpoint is the account endpoint, without a bucket path");
  assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_ENDPOINT: "not a url" }) === null, "config: a malformed endpoint is refused");
  assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_ENDPOINT: `${ENDPOINT}/` })?.endpoint === ENDPOINT, "config: a trailing slash is tolerated");
  for (const bad of ["UPPER", "a", "has space", "-lead", "trail-", "a/b", "x".repeat(70)]) assert(readRecordingR2Config({ ...GOOD, R2_RECORDINGS_BUCKET_NAME: bad }) === null, `config: bucket name "${bad.slice(0, 12)}" is refused`);
  // ISOLATION: the teacher-media variables are not a substitute for the recording ones
  assert(readRecordingR2Config({ R2_ENDPOINT: ENDPOINT, R2_ACCESS_KEY_ID: "x", R2_SECRET_ACCESS_KEY: "y", R2_BUCKET_NAME: "teacher-media", R2_PUBLIC_URL_BASE: "https://pub.example" }) === null, "isolation: the public teacher-media R2 variables never configure the recording storage");
  assert(getRecordingStore({}) === null, "config: no variables -> no store (and no crash)");
  assert(!isRecordingIntakeAvailable(GOOD), "intake: the bucket alone is not enough (AssemblyAI key, webhook secret and site URL are needed too)");
  const full = { ...GOOD, ASSEMBLYAI_API_KEY: "k", ASSEMBLYAI_WEBHOOK_SECRET: "s", URL: "https://site.example" };
  assert(isRecordingIntakeAvailable(full) && recordingWebhookUrl(full) === "https://site.example/api/public/assemblyai-webhook", "intake: everything present -> available, webhook URL is the site URL + the existing route");
  for (const drop of ["ASSEMBLYAI_API_KEY", "ASSEMBLYAI_WEBHOOK_SECRET", "URL"]) {
    const env: Record<string, string | undefined> = { ...full };
    delete env[drop];
    assert(!isRecordingIntakeAvailable(env), `intake: without ${drop} the upload stays disabled`);
  }
  assert(recordingWebhookUrl({ URL: "http://site.example" }) === null && recordingWebhookUrl({ DEPLOY_URL: "https://deploy.example/" }) === "https://deploy.example/api/public/assemblyai-webhook", "intake: https only; DEPLOY_URL is the fallback like the background trigger");
}

// ── signed URLs, built offline ────────────────────────────────────────────────────────────────────────────────────────
const presignChecks = (async () => {
  const store = createRecordingStore(readRecordingR2Config(GOOD)!);
  const key = generateRecordingKey(10, "m4a");
  const put = new URL(await store.presignUpload(key, "audio/mp4", 600));
  assert(put.protocol === "https:" && put.hostname.endsWith("0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"), "PUT URL: points at the account's R2 endpoint, nowhere else");
  assert(`${put.hostname}${put.pathname}`.includes("hifive-recordings-private") && decodeURIComponent(put.pathname).endsWith(key), "PUT URL: names the recording bucket and exactly the generated key");
  assert(put.searchParams.get("X-Amz-Expires") === "600", "PUT URL: lives 10 minutes");
  assert((put.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";").includes("content-type"), "PUT URL: the Content-Type is part of the signature");
  assert(![...put.searchParams.keys()].some((k) => /checksum/i.test(k)), "PUT URL: no checksum parameters (a browser PUT could not satisfy them on R2)");
  assert(!put.searchParams.has("X-Amz-Security-Token") && !put.toString().includes("dummy-secret-not-real"), "PUT URL: contains no secret");
  const get = new URL(await store.presignDownload(key, 1800));
  assert(get.searchParams.get("X-Amz-Expires") === "1800" && decodeURIComponent(get.pathname).endsWith(key) && get.searchParams.get("X-Amz-SignedHeaders") === "host", "GET URL: reads exactly that key, 30 minutes, signed for host only");
  assert(put.searchParams.get("X-Amz-Signature") !== get.searchParams.get("X-Amz-Signature"), "URLs: the upload URL can not be used to read, nor the read URL to write (different signatures)");
})();

// ── static checks on the source ───────────────────────────────────────────────────────────────────────────────────────
const root = path.resolve(__dirname, "..");
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // comments may name what is forbidden; code may not

const sessionDir = "src/app/teacher/(dashboard)/sessions/[id]";
const recordingCode = [
  "src/lib/recordingR2.ts",
  "src/lib/recordingUpload.ts",
  "src/lib/recordingUploadFlow.ts",
  "src/lib/recordingIntakeConfig.ts",
  "src/lib/recordingRetention.ts",
  `${sessionDir}/recordingUploadActions.ts`,
  `${sessionDir}/RecordingUploader.tsx`,
  "netlify/functions/recover-awaiting-recordings.ts",
  "netlify/functions/sweep-recording-originals.ts",
];
for (const file of recordingCode) {
  const code = strip(read(file));
  assert(!/from\s+["'][^"']*\/r2["']/.test(code), `isolation: ${file} does not import r2.ts (the public bucket client)`);
  assert(!/r2PublicUrl|R2_PUBLIC_URL_BASE|\bR2_BUCKET_NAME\b|\bR2_ENDPOINT\b|\bR2_ACCESS_KEY_ID\b|\bR2_SECRET_ACCESS_KEY\b/.test(code), `isolation: ${file} uses none of the public-bucket names or variables`);
  assert(!/publicUrl|publicRead|ACL\s*:|x-amz-acl/i.test(code), `isolation: ${file} never asks for a public URL or a public ACL`);
  assert(!/console\./.test(code) || file.startsWith("netlify/functions/"), `logging: ${file} does not log`);
}
for (const file of ["netlify/functions/recover-awaiting-recordings.ts", "netlify/functions/sweep-recording-originals.ts"]) {
  const logs = strip(read(file)).match(/console\.log\([^;]*\);/g) ?? [];
  assert(logs.length > 0 && logs.every((l) => /JSON\.stringify\((report|\{ skipped: true, retentionConfigured[^}]*\})\)/.test(l)), `logging: ${file} logs only a report of ids and counts`);
}
{
  const importers = walk(path.join(root, "src")).concat(walk(path.join(root, "netlify"))).filter((f) => /from\s+["'](?:@\/lib\/|\.{1,2}\/)(?:[^"']*\/)?r2["']/.test(fs.readFileSync(f, "utf8")));
  assert(importers.map(rel).join() === "src/app/(admin)/teachers/mediaUploadActions.ts", "isolation: r2.ts (public bucket) is imported by the teacher-media upload and nothing else");
  assert(/^import \{[^}]*\} from "@aws-sdk\/(client-s3|s3-request-presigner)";$/m.test(read("src/lib/recordingR2.ts")) && !/from "\.\/r2"|from "@\/lib\/r2"/.test(read("src/lib/recordingR2.ts")), "isolation: recordingR2.ts depends on the AWS SDK only");
}
{
  // the browser bundle must not pull in server-only code, and the uploader must not know any storage detail
  const uploader = strip(read(`${sessionDir}/RecordingUploader.tsx`));
  assert(uploader.includes('"use client"') || read(`${sessionDir}/RecordingUploader.tsx`).startsWith('"use client"'), "uploader: a client component");
  assert(!/@aws-sdk|recordingR2|node:crypto|recordingUpload"|process\.env|driveFileId|r2:/.test(uploader), "uploader: no SDK, no server module, no environment, no stored reference in the browser code");
  assert(/xhr\.open\("PUT", url\)/.test(uploader) && !/fetch\(/.test(uploader), "uploader: the file goes to the signed URL with a PUT; no other request carries it");
  assert(!/localStorage|sessionStorage|console\.|document\.cookie/.test(uploader), "uploader: the signed URL is not stored or logged");
}
{
  // server actions: authenticate first, ownership in the flow, nothing taken from the request but the lesson id and the file facts
  const actions = strip(read(`${sessionDir}/recordingUploadActions.ts`));
  assert(read(`${sessionDir}/recordingUploadActions.ts`).startsWith('"use server"'), "actions: server actions");
  assert(actions.includes("requireTeacher()") && actions.includes('requirePermission(actor, "own_evaluations.update")'), "actions: server-side teacher authentication + permission");
  assert(/teacherId: teacher\.id/.test(actions) && !/formData|\.get\(\s*["'](?:teacherId|teacher_id|userId|actorId)/.test(actions) && !/i\.teacherId|input\.teacherId/.test(actions), "actions: the teacher id comes from the session, never from the request");
  assert(actions.indexOf("authenticatedTeacher()") < actions.indexOf("buildDeps()"), "actions: authentication happens before anything is wired or read");
  assert(!/\.bind\s*\(/.test(actions), "actions: no bound server action");
  assert(!/revalidatePath\([^)]*i\.sessionId/.test(actions) && /revalidatePath\(`\/teacher\/sessions\/\$\{pageId\}`\)/.test(actions), "actions: only a validated integer is ever put into a revalidated path");
  assert(!/speech_models|speaker_labels|audio_url|api\.assemblyai\.com/.test(actions + strip(read("src/lib/recordingUploadFlow.ts"))), "AssemblyAI: the upload code builds no request body of its own — the existing submitTranscript (Universal-2, speaker_labels) is the only path");
  assert(/submit: \(audioUrl\) => submitTranscript\(audioUrl, \{ webhookUrl, webhookSecret \}\)/.test(actions), "AssemblyAI: the signed read URL goes to the existing submitTranscript together with the webhook secret");
  const flow = strip(read("src/lib/recordingUploadFlow.ts"));
  assert((flow.match(/presignDownload\(/g) ?? []).length === 1 && (flow.match(/deps\.submit\(/g) ?? []).length === 1, "flow: one read URL, one submission, in one place (the request that wins the UPLOADED -> PUBLIC_READY claim)");
  assert(flow.indexOf("claimForSubmit") < flow.indexOf("presignDownload(") && flow.indexOf("presignDownload(") < flow.indexOf("deps.submit("), "flow: claim first, then the read URL, then the submission");
  assert(/session\.teacherId === teacherId/.test(flow) && flow.includes("ownLiveSession(session, input.teacherId)"), "flow: ownership is checked against the lesson's teacher before any storage or state change");
  assert(!/uploadUrl|downloadUrl|presign/.test(strip(read(`${sessionDir}/ClassRecordingPanel.tsx`))), "panel: it never handles a URL");
  // exactly two places may call submitTranscript from the app: its definition and the upload action
  const callers = walk(path.join(root, "src")).concat(walk(path.join(root, "netlify"))).filter((f) => /submitTranscript\(/.test(strip(fs.readFileSync(f, "utf8")))).map(rel).sort();
  assert(callers.join() === `${sessionDir}/recordingUploadActions.ts,src/lib/assemblyai.ts`, `AssemblyAI: submitTranscript is called only by the upload action (found: ${callers.join(" | ")})`);
  for (const f of ["src/lib/recordingRecovery.ts", "netlify/functions/recover-awaiting-recordings.ts", "netlify/functions/recover-transcribed-recordings.ts", "src/lib/recordingWebhook.ts", "src/lib/recordingRetention.ts"]) {
    assert(!/submitTranscript/.test(strip(read(f))), `AssemblyAI: ${f} can not submit a transcription`);
  }
}
{
  // students and the public API never see storage details
  const studentFiles = walk(path.join(root, "src", "app", "student"));
  const publicFiles = walk(path.join(root, "src", "app", "api", "public")).filter((f) => !f.includes("assemblyai-webhook"));
  assert(studentFiles.length > 0 && publicFiles.length > 0, "student API: there are files to scan");
  for (const f of studentFiles.concat(publicFiles)) {
    const code = fs.readFileSync(f, "utf8");
    assert(!/recordingR2|recordingUpload|recordingIntake|recordingRetention|driveFileId|["'`]r2:|presign|recordings\//.test(code), `student/public: no recording storage detail in ${rel(f)}`);
  }
  const studentEval = strip(read("src/lib/studentEvaluation.ts"));
  assert(!/driveFileId|audioRecording|recordingR2/.test(studentEval), "student API: the student evaluation query selects nothing about recordings or storage");
}
{
  // the cost policy is untouched: the shared request builder still pins Universal-2 and speaker labels, with the webhook secret header
  const body = buildTranscriptRequestBody("https://signed.invalid/x", { webhookUrl: "https://site.example/api/public/assemblyai-webhook", webhookSecret: "s" });
  assert(JSON.stringify(body.speech_models) === JSON.stringify(["universal-2"]) && body.speaker_labels === true && body.webhook_auth_header_name === "X-Webhook-Secret", "cost policy: Universal-2 + speaker_labels + the webhook secret header, as before");
}

presignChecks.then(
  () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail > 0) process.exit(1);
  },
  (e) => {
    console.error("ERROR:", String(e?.stack ?? e).slice(0, 600));
    process.exit(1);
  },
);
