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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
