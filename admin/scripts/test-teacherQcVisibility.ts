// 정적 코드 검사 — teacherQcDraft가 학생 쪽(student/* 페이지, public API)의 소스
// 코드 어디에도 등장하지 않는지 확인한다. DB/네트워크를 쓰지 않는다. 새로운 student
// 라우트가 추가될 때도 이 테스트가 깨지면 바로 알 수 있도록, 특정 파일을 하드코딩해
// 나열하는 대신 디렉터리 전체를 스캔한다.
import fs from "node:fs";
import path from "node:path";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const root = path.resolve(__dirname, "..");
const studentDir = path.join(root, "src", "app", "student");
const publicApiDir = path.join(root, "src", "app", "api", "public");

const studentFiles = walk(studentDir);
const publicApiFiles = walk(publicApiDir).filter((f) => !f.includes("assemblyai-webhook")); // 서버-서버 webhook은 "학생 노출 경로"가 아니므로 제외

assert(studentFiles.length > 0, "student 디렉터리에서 파일을 찾음(스캔 대상이 비어있지 않은지 확인)");

for (const file of studentFiles) {
  const content = fs.readFileSync(file, "utf8");
  assert(!content.includes("teacherQcDraft"), `student 경로에 teacherQcDraft 없음: ${path.relative(root, file)}`);
}
for (const file of publicApiFiles) {
  const content = fs.readFileSync(file, "utf8");
  assert(!content.includes("teacherQcDraft"), `public API(webhook 제외)에 teacherQcDraft 없음: ${path.relative(root, file)}`);
}

// ── 서버/API 수준 접근 범위: AudioRecording(전사문·초안·QC)은 강사 본인 수업 화면과 서버-서버 경로에서만 쓰인다 ──
const appDir = path.join(root, "src", "app");
const appFiles = walk(appDir);
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
for (const file of appFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (!/audioRecording|AudioRecording/.test(content)) continue;
  const r = rel(file);
  const allowed = r.startsWith("src/app/teacher/(dashboard)/sessions/[id]/") || r === "src/app/api/public/assemblyai-webhook/route.ts";
  assert(allowed, `audioRecording은 강사 본인 세션 화면/서버 액션과 webhook에서만 사용: ${r}`);
}
for (const file of studentFiles.concat(publicApiFiles)) {
  const content = fs.readFileSync(file, "utf8");
  assert(!/aiDraft|audioRecording|AudioRecording/.test(content), `student/public 경로에 aiDraft·audioRecording 없음: ${rel(file)}`);
}

const sessionDir = path.join(root, "src", "app", "teacher", "(dashboard)", "sessions", "[id]");
const sessionPage = fs.readFileSync(path.join(sessionDir, "page.tsx"), "utf8");
assert(sessionPage.includes("session.teacherId !== teacher.id"), "강사 세션 페이지: 본인 수업이 아니면 notFound(IDOR 방지)");
assert(!/audioRecording:\s*true/.test(sessionPage), "강사 세션 페이지: 전체 행(audioRecording: true)을 클라이언트로 넘기지 않음");
assert(/audioRecording:\s*\{\s*select:/.test(sessionPage), "강사 세션 페이지: 필요한 필드만 select");
const selectStart = sessionPage.indexOf("audioRecording: {");
const selectBlock = sessionPage.slice(selectStart, sessionPage.indexOf("});", selectStart));
for (const forbidden of ["transcript", "providerTranscriptId", "driveFileId", "errorMessage", "transcriptUtterances", "confirmedTeacherSpeaker"]) {
  assert(!selectBlock.includes(forbidden), `강사 세션 페이지: ${forbidden}를 클라이언트로 내보내지 않음`);
}
assert(sessionPage.includes("safeRecordingFailureMessage"), "강사 세션 페이지: 내부 errorMessage 대신 고정 안내 문구만 전달");

const actions = fs.readFileSync(path.join(sessionDir, "recordingActions.ts"), "utf8");
assert(actions.includes("requireTeacher()") && actions.includes("requirePermission(actor"), "publishAIDraft: 서버에서 강사 인증 + 권한 확인");
assert(actions.includes("session.teacherId !== teacher.id"), "publishAIDraft: 본인 수업만 publish(서버 측 소유권 검증)");
assert(!/lessonEvaluation\.upsert/.test(actions), "publishAIDraft: 확인 없는 upsert 덮어쓰기 경로 없음(조건부 쓰기만 사용)");
assert(actions.includes("commitAIDraftPublish"), "publishAIDraft: 트랜잭션 + 조건부 쓰기 규칙(recordingPublish.ts) 사용");

const webhookRoute = fs.readFileSync(path.join(publicApiDir, "assemblyai-webhook", "route.ts"), "utf8");
assert(webhookRoute.includes("handleAssemblyAIWebhook"), "webhook 라우트: 인증·idempotency를 테스트된 recordingWebhook.ts에 위임");
assert(!/console\.(log|error|warn)/.test(webhookRoute), "webhook 라우트: 로그 출력 없음(비밀값·payload 노출 방지)");

// ── Teacher Confirmation: server-side authorization, no AssemblyAI call, no pre-selected answer ─────────────────────────
{
  const confirmAction = actions.slice(actions.indexOf("export async function confirmTeacherSpeakerAction"));
  assert(confirmAction.includes("requireTeacher()") && confirmAction.includes("requirePermission(actor"), "confirmTeacherSpeakerAction: server-side teacher authentication + permission");
  assert(confirmAction.includes("teacherId: teacher.id") && confirmAction.includes('formData.get("teacherSpeaker")'), "confirmTeacherSpeakerAction: the teacher id comes from the session, the label from the form only");
  assert(!/formData\.get\(\s*["'](?:teacherId|teacher_id|userId|actorId)["']/.test(confirmAction), "confirmTeacherSpeakerAction: the teacher id is never taken from the request");
  assert(confirmAction.includes('processingStatus: "NEEDS_SPEAKER_CONFIRMATION"') && confirmAction.includes("updateMany"), "confirmTeacherSpeakerAction: the state change is one conditional update");
  const callsAssemblyAI = /from\s+["'][^"']*assemblyai["']|fetchTranscript\(|submitTranscript\(/i;
  assert(!callsAssemblyAI.test(actions) && !callsAssemblyAI.test(fs.readFileSync(path.join(root, "src", "lib", "speakerConfirmation.ts"), "utf8")), "Teacher Confirmation never imports the AssemblyAI client (no re-transcription)");
  const confirmLib = fs.readFileSync(path.join(root, "src", "lib", "speakerConfirmation.ts"), "utf8");
  assert(confirmLib.includes("found.sessionTeacherId !== input.teacherId"), "speakerConfirmation: ownership is checked against the lesson's teacher");
  assert(confirmLib.includes("SPEAKER_LABEL_PATTERN") && confirmLib.includes("speakerLabelsOf(utterances).includes(label)"), "speakerConfirmation: the label must be a voice of the stored transcript");

  const panel = fs.readFileSync(path.join(sessionDir, "ClassRecordingPanel.tsx"), "utf8");
  assert(!/defaultChecked|checked=/.test(panel), "ClassRecordingPanel: no speaker is pre-selected");
  assert(!/speakerRoles|inferSpeakerRoles|votes|confidence/.test(panel), "ClassRecordingPanel: the inference result is not shown or used as a default");
  assert(panel.includes("Speaker identification required") && panel.includes("Please select which speaker is the teacher."), "ClassRecordingPanel: the required wording is shown");

  // Browser-smoke defect 1: the buttons used "bg-brand-700", a colour the Tailwind theme does not define, so they rendered as white text on a
  // transparent background (invisible on the white card). Every brand-* utility must exist in the theme, and the two buttons use the same
  // solid style as the rest of the teacher area.
  const globalsCss = fs.readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
  const brandClasses = [...new Set(panel.match(/\b(?:bg|text|border)-brand-\d+\b/g) ?? [])];
  for (const cls of brandClasses) {
    assert(globalsCss.includes(`--color-${cls.replace(/^(?:bg|text|border)-/, "")}`), `ClassRecordingPanel: ${cls} is defined in the theme`);
  }
  const solidButton = 'className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"';
  assert(panel.split(solidButton).length - 1 === (panel.match(/type="submit"/g) ?? []).length && panel.includes(solidButton), "ClassRecordingPanel: every submit button (Publish, Confirm) is solid bg-slate-900 + white text, with hover and disabled states");

  // Browser-smoke defect 2: a BOUND server action (.bind(null, sessionId)) used with useActionState never finishes rendering on the server when
  // a native (no-JavaScript) form POST comes back with an error — the response hangs and the CPU spins. The confirmation form therefore sends the
  // lesson id as a plain hidden field; the server still checks that the lesson belongs to the logged-in teacher.
  assert(!/confirmTeacherSpeakerAction\s*\.bind/.test(panel), "ClassRecordingPanel: the confirmation action is not a bound action");
  assert(/useActionState\(confirmTeacherSpeakerAction,/.test(panel) && /<input type="hidden" name="sessionId" value=\{sessionId\}/.test(panel), "ClassRecordingPanel: the lesson id is a hidden form field");
  assert(/export async function confirmTeacherSpeakerAction\(\s*_prevState: ConfirmSpeakerState,\s*formData: FormData,/.test(actions), "confirmTeacherSpeakerAction: (prevState, formData) — no bound arguments");
  assert(confirmAction.includes('Number(formData.get("sessionId"))'), "confirmTeacherSpeakerAction: the lesson id is read from the form");
  assert(confirmAction.includes("!Number.isSafeInteger(id) || id <= 0"), "confirmTeacherSpeakerAction: a malformed lesson id (NaN, 0, negative, fractional) is 'not found' before any query");

  const bg = fs.readFileSync(path.join(root, "netlify", "functions", "process-recording-background.ts"), "utf8");
  assert(bg.includes("fromStatus") && /where: \{ id, processingStatus: fromStatus \}/.test(bg), "background function: the claim is a conditional update on the start state (TRANSCRIBED or TEACHER_SPEAKER_CONFIRMED)");
  const rec = fs.readFileSync(path.join(root, "src", "lib", "recordingProcessing.ts"), "utf8");
  const resumeBranch = rec.slice(rec.indexOf('if (startStatus === "TEACHER_SPEAKER_CONFIRMED")'), rec.indexOf("} else {", rec.indexOf('if (startStatus === "TEACHER_SPEAKER_CONFIRMED")')));
  assert(resumeBranch.length > 100 && !/fetchTranscript|inferSpeakerRoles|inferRoles/.test(resumeBranch), "resume branch: uses the stored utterances and the teacher's label — no AssemblyAI read, no new inference");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
