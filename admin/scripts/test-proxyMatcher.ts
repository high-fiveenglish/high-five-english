// Which request paths run the authentication proxy (src/proxy.ts)? This pins the matcher with Next's own `unstable_doesMiddlewareMatch`.
//
// Why it matters: the proxy redirects every request without a login cookie to /login. The server-to-server call that starts the analysis
// (assemblyai-webhook / recover-transcribed-recordings -> /.netlify/functions/process-recording-background, recordingTrigger.ts) has no
// cookie, so unless exactly that one path is exempt the call is redirected (405) and no recording is ever analysed. The function itself
// verifies the X-Recording-Processing-Secret header (recordingProcessingAuth.ts, tested in test-recordingProcessing.ts) and answers 401
// otherwise. Every OTHER path — including every other /.netlify/* path — must keep running the proxy.
// Run from the admin directory: npx tsx scripts/test-proxyMatcher.ts
import { AsyncLocalStorage } from "node:async_hooks";

// Next's server sets this global when it starts; its modules refuse to load without it, so a unit test has to provide it first.
(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}`);
  }
}

async function main() {
const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
const { config } = await import("../src/proxy");
const runsProxy = (path: string) => unstable_doesMiddlewareMatch({ config, url: `http://localhost${path}` });

// 1. The one exemption.
check("/.netlify/functions/process-recording-background is NOT run through the proxy", !runsProxy("/.netlify/functions/process-recording-background"));

// 2. Everything close to it stays protected (no prefix / sibling / sub-path / case tricks).
for (const p of [
  "/.netlify/functions/recover-transcribed-recordings",
  "/.netlify/functions/other",
  "/.netlify/functions/",
  "/.netlify/functions",
  "/.netlify/",
  "/.netlify/functions/process-recording-background/extra",
  "/.netlify/functions/process-recording-background-evil",
  "/.netlify/functions/process-recording-backgroun",
  "/.netlify/functions/Process-Recording-Background",
  "/.netlify/functions/process-recording-background.js",
  "/.netlify/internal/process-recording-background",
  "/netlify/functions/process-recording-background",
]) {
  check(`${p} still runs the proxy`, runsProxy(p));
}

// 3. Protected application paths are unchanged.
for (const p of ["/", "/students", "/teachers", "/accounts", "/permissions", "/audit-log", "/enrollments", "/teacher", "/teacher/sessions/1", "/teacher/schedule", "/student", "/student/sessions", "/api/teacher-stats/export"]) {
  check(`${p} still runs the proxy`, runsProxy(p));
}

// 4. Login screens (the proxy runs and lets them through) and the existing exclusions are unchanged.
for (const p of ["/teacher/login", "/student/login"]) check(`${p} still runs the proxy (which allows it)`, runsProxy(p));
for (const p of ["/login", "/api/public/assemblyai-webhook", "/api/public/pricing", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) {
  check(`${p} is still not run through the proxy`, !runsProxy(p));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log("ERROR:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
