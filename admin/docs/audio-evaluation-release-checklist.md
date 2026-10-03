# Audio Evaluation 운영 투입 전 검증 절차 (PR #7)

이 문서는 **코드를 동결한 상태에서** AI 수업 평가(녹음 → AssemblyAI → 화자 확인 → Claude → 교사 검토 → 학생 공개)를
운영에 안전하게 올리기 위한 절차를 정리한 것이다. **이 문서를 쓴 시점에 운영 DB와 migration은 건드리지 않았고,
아래 절차의 어느 것도 아직 실행하지 않았다.** 각 단계는 사용자가 명시적으로 승인한 뒤에만 진행한다.

> 아래 commit hash·숫자는 작성 시점의 스냅샷이다. 실제 진행 당일에는 `git log`, GitHub PR, Netlify 배포 상태를
> 다시 확인해서 쓴다. 고정값으로 취급하지 않는다.

---

## 0. 현재 상태 스냅샷

| 항목 | 값 (작성 시점) |
|---|---|
| PR | #7 `audio-evaluation-core` → `master` (미병합) |
| 코드 동결 기준 HEAD | `9526e31ceda37b5c78be22930253c378402cdc78` (이 문서를 추가하는 커밋이 그 위에 올라간다) |
| 운영 DB migration | **미적용** (`20261004000000_add_speaker_confirmation`) |
| 운영 DB `audio_recordings` | 0행 (2026-10-02 읽기 전용 조회) — 당일 재확인 |
| 자동 검증 | 전체 fixture 13묶음, TypeScript, build, GitHub CI, Netlify Preview 통과 |
| 실제 브라우저 확인 | **미실시** |
| Production E2E | **미실시** |

### 코드 동결 (이 단계에서 하지 않는 것)
- Speaker Mapping 임계값 변경 / `Okay.` continuation 수정 / 3명 이상 목소리의 자동 제외
- Student Feedback · Teacher QC 독립 상태(`studentDraftStatus`/`qcDraftStatus`) 구현
- 개인정보 자동 삭제 코드
- 기존 migration 수정, 운영 DB 접근

---

## 1. Migration `20261004000000_add_speaker_confirmation`

**파일:** `admin/prisma/migrations/20261004000000_add_speaker_confirmation/migration.sql` (285 bytes)

```sql
-- AlterTable
ALTER TABLE "audio_recordings" ADD COLUMN     "confirmedTeacherSpeaker" TEXT,
ADD COLUMN     "speakerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "speakerConfirmedByTeacherId" INTEGER,
ADD COLUMN     "speakerMappingStatus" TEXT,
ADD COLUMN     "transcriptUtterances" JSONB;
```

| 점검 | 결과 (정적 검증) |
|---|---|
| 내용 | nullable 컬럼 **5개**만 추가. UPDATE / DROP / DELETE / RENAME / NOT NULL / DEFAULT 없음 → 기존 행은 바뀌지 않음 |
| 대상 테이블 | `audio_recordings` 하나만 |
| 현재 `schema.prisma`와 일치 | 이전 schema → 현재 schema의 `prisma migrate diff --script` 재생성 결과가 파일과 바이트 단위로 동일. 이후 `prisma/` 변경 0줄 |
| 기존 migration 수정 | 없음. master 대비 이 PR이 추가한 migration은 `20261001101742_add_audio_recording`, `20261004000000_add_speaker_confirmation` 두 개뿐 |
| sha256 (저장소 blob, LF) | `52e67a6d41de59a49dc0882d9c9a75184bb99bf2ca7877d7482260caa351132a` |

**줄바꿈 주의:** 저장소의 blob은 LF지만 Windows 작업 폴더(`core.autocrlf=true`)에서는 CRLF로 보인다. Prisma의
migration checksum은 파일 내용을 기준으로 하므로, **적용은 LF 파일로 한다**(Linux CI/Netlify 빌드 환경 또는
`core.autocrlf=false` 체크아웃). 적용 전에 위 sha256과 같은지 확인한다. (CRLF 파일의 checksum이 어떻게 처리되는지는
검증하지 않았다 — 확인되지 않은 부분이므로 피하는 쪽으로 한다.)

**검증하지 못한 것:** 누적된 모든 migration이 `schema.prisma`와 같은 결과를 내는지는 shadow DB가 필요해서
확인하지 못했다. 운영 DB를 쓰지 않는 원칙 때문이며, 아래 리허설(Neon 브랜치)에서 확인한다.

---

## 2. 적용 순서와 "코드보다 migration이 먼저"인 이유

### 순서
1. **DB pre-check** (읽기 전용)
2. **migration 적용**
3. **schema 검증**
4. **application 배포**
5. **browser smoke test**
6. **recording E2E**
7. **rollback 준비 확인** (1~6 어느 단계에서든 되돌릴 수 있어야 한다)

### 왜 migration이 먼저인가
새 코드는 `audio_recordings`의 새 컬럼 5개를 **읽고 쓴다**. 컬럼이 없는 DB에 새 코드가 올라가면 Prisma가 존재하지 않는
컬럼을 SELECT하려다 실패한다. 구체적으로 다음 경로가 깨진다.
- background function의 `findRecording` (모든 컬럼을 읽음) → **분석이 시작되지 않음**
- `publishAIDraft`의 `include: audioRecording` (모든 컬럼을 읽음) → **교사가 초안을 publish할 수 없음**
- 교사 세션 페이지의 확인 대기 조회

반대로 migration만 먼저 적용하면 기존 코드는 새 nullable 컬럼을 모르는 채 그대로 동작한다(컬럼 추가는 하위 호환).
그래서 순서는 항상 **migration → 코드 배포**다.

**Netlify 주의 두 가지**
- Netlify가 `master` 자동 배포로 설정되어 있다면(진행 전에 Netlify 설정에서 확인) merge가 곧 운영 배포다. 그 경우 migration 적용은 **merge 전에** 끝나 있어야 한다.
- Deploy Preview는 운영 DB를 **공유**한다. migration 전에 프리뷰의 녹음 관련 화면을 열면 같은 이유로 실패할 수 있다.
  운영 DB를 건드리지 않고 확인하려면 아래 "리허설 환경"을 쓴다.

### 리허설 환경 (권장)
운영 데이터를 건드리지 않도록 **Neon 브랜치(운영 DB의 복사본)** 를 만들어 먼저 같은 순서를 끝까지 돌려 본다.
브라우저 smoke test와 E2E도 이 브랜치를 가리키는 별도 Netlify 컨텍스트(또는 로컬 서버)에서 한다.
운영에는 리허설이 통과한 뒤에 같은 절차를 적용한다.

### 단계별 절차

**1) DB pre-check (읽기 전용, 대상 DB에서)**
```sql
-- 적용된 migration 목록 (마지막 항목이 20261001101742_add_audio_recording 이어야 한다)
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;

-- 새 컬럼이 아직 없어야 한다 (0행)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'audio_recordings'
  AND column_name IN ('speakerMappingStatus','transcriptUtterances','confirmedTeacherSpeaker','speakerConfirmedAt','speakerConfirmedByTeacherId');

-- 영향 범위 기준값
SELECT count(*) FROM audio_recordings;
SELECT processingStatus, count(*) FROM audio_recordings GROUP BY 1;
```
기대: `audio_recordings` 0행(또는 기록해 둔 기준값), 새 컬럼 0개. 하나라도 다르면 **중단하고 보고**한다.
추가로 `npx prisma migrate status`(읽기 전용)로 "아직 적용되지 않은 migration이 이것 하나뿐"인지 확인한다.
접속 문자열(`DATABASE_URL`)은 출력하지 않는다.

**2) migration 적용 (승인 후에만)** — 코드·빌드 환경에서 `npx prisma migrate deploy`. `db push`·`migrate dev` 금지.
적용 직전 sha256을 확인하고, 직전 시점의 Neon 복원 지점(브랜치/스냅샷)을 기록한다.

**3) schema 검증**
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'audio_recordings'
  AND column_name IN ('speakerMappingStatus','transcriptUtterances','confirmedTeacherSpeaker','speakerConfirmedAt','speakerConfirmedByTeacherId')
ORDER BY column_name;   -- 5행, 전부 is_nullable = YES, 타입: text / jsonb / text / timestamp / integer
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations WHERE migration_name = '20261004000000_add_speaker_confirmation';  -- finished=true, rolled_back=false
SELECT count(*) FROM audio_recordings;   -- pre-check 기준값과 같아야 한다
```

**4) application 배포** — 이 PR을 배포(리허설에서는 해당 컨텍스트에 배포). 배포 후 Netlify Functions
(`process-recording-background`, `recover-transcribed-recordings`)가 올라왔는지, 환경변수 4개
(`ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `RECORDING_PROCESSING_SECRET`)가
**SET**인지 값 출력 없이 확인한다.

**5) browser smoke test** — 3장.

**6) recording E2E** — 4장.

**7) rollback 준비**
- 코드: 이전 배포로 되돌리는 방법(Netlify에서 이전 배포 Publish)을 먼저 확인한다. **코드를 먼저 되돌린 뒤에만** 컬럼을 지운다
  (새 코드가 컬럼을 읽기 때문).
- DB: 가장 안전한 되돌리기는 Neon의 시점 복구/브랜치다. 수동으로 되돌릴 경우의 영향 범위는 새 컬럼 5개의 값뿐이다.
  ```sql
  ALTER TABLE "audio_recordings"
    DROP COLUMN "confirmedTeacherSpeaker", DROP COLUMN "speakerConfirmedAt",
    DROP COLUMN "speakerConfirmedByTeacherId", DROP COLUMN "speakerMappingStatus", DROP COLUMN "transcriptUtterances";
  -- 그리고 _prisma_migrations 에서 20261004000000_add_speaker_confirmation 행을 제거(또는 prisma migrate resolve 사용)
  ```
  다른 테이블과 기존 컬럼에는 영향이 없다. 이 SQL도 승인 후에만 실행한다.

---

## 3. Browser smoke test 절차 (승인된 테스트 환경에서만)

**전제:** migration이 적용된 **리허설 DB** + 이 PR이 배포된 서버, 교사 계정 1개(`own_evaluations.update` 권한 포함),
그 교사가 담당하는 수업(ClassSession)이 있고 수업 시작 시각이 지나 있을 것(세션 페이지는 시작 전·취소·보류 수업에서는
녹음 패널을 보여 주지 않는다). 상태별 화면은 **합성 데이터**(실제 학생 발화가 아닌 지어낸 대화)로 만든다.
상태를 만들려면 해당 수업의 `audio_recordings` 행을 리허설 DB에 직접 입력한다(운영 DB에는 입력하지 않는다).

### A. `NEEDS_SPEAKER_CONFIRMATION`
준비: `processingStatus='NEEDS_SPEAKER_CONFIRMATION'`, `transcriptUtterances`에 3개 화자(A/B/C) 합성 발화(JSON 배열),
`errorMessage`에는 짧은 LOW 요약.
확인 항목:
1. "Speaker identification required"와 "Please select which speaker is the teacher."가 보인다.
2. **A, B, C 라디오가 모두** 있다 (턴 수 · 분 · 발췌 2줄).
3. **기본 선택이 없다.** AI가 추천하는 교사 표시가 어디에도 없다.
4. 선택 없이 "Confirm teacher speaker" → **브라우저 기본 검증 메시지**가 뜨고 요청이 나가지 않는다.
5. 하나를 선택하고 제출 → 성공 문구("Thank you. The AI draft is being prepared from the existing transcript.") 그리고 상태가 바뀐다.
6. 제출 직후 **연타** → 버튼이 "Saving..."으로 잠기고, 어떤 경우에도 분석이 한 번만 시작된다(DB에서 `speakerConfirmedAt`,
   `confirmedTeacherSpeaker`가 한 번만 기록).
7. **새로고침** → 확인 폼이 다시 나타나지 않고 상태 라벨이 바뀌어 있다.
8. 오류 표시: 다른 교사 계정으로 같은 수업 주소를 열면 404, 서버 액션을 직접 호출하면 "You can only confirm speakers for your own classes."

### B. `TEACHER_SPEAKER_CONFIRMED`
준비: 위 A에서 선택한 직후의 상태(트리거 유실을 흉내 내려면 background function 호출을 막은 상태).
확인: 확인 폼이 **없다**. 상태 라벨 "Speaker confirmed — preparing AI draft". 분석이 진행되면 기존 transcript가 쓰이고
**AssemblyAI 호출 로그가 새로 생기지 않는다**(AssemblyAI 대시보드/요청 수 증가 없음). 같은 라벨 재요청은 "already confirmed",
다른 라벨은 거절.

### C. `NEEDS_REVIEW`
준비: `processingStatus='NEEDS_REVIEW'`, `aiDraft`·`teacherQcDraft`에 합성 보고서.
확인: AI 초안과 "Publish as Evaluation"이 보이고 **확인 폼이 없다**. Teacher QC는 접힌 영역에 있고 학생 화면 어디에도 없다.

### D. 모바일 폭 (예: 375px, 가능하면 실제 휴대폰도)
- 화자 선택 카드가 가로 스크롤 없이 한 줄씩 쌓인다.
- 발췌(최대 70자)가 줄바꿈되고 카드를 벗어나지 않는다. 긴 단어 하나가 영역을 밀어내지 않는지 확인.
- 버튼이 화면 안에서 눌린다. 오류 메시지가 잘리지 않는다.

**이미 정적으로 확인된 것**(서버 렌더링 HTML 기준): 폼 렌더링, A/B/C 표시, 기본 선택 없음, 추천 문구 없음, 빈 목록 대체 문구.
**브라우저에서만 확인 가능한 것:** 실제 제출 동작, 모바일 레이아웃, 분석 완료 후의 화면 갱신(현재 자동 갱신이 없어
교사가 새로고침해야 초안이 보인다), 선택 전에는 버튼이 활성이고 브라우저 검증에 의존한다는 점.

---

## 4. Production-like E2E 준비 (아직 실행하지 않음)

### 4-1. 필요한 테스트 데이터와 관계
```
Site (code, name)
 ├─ Teacher (siteId, realName, loginId[unique], passwordHash; 권한 own_evaluations.update)   ← 테스트 교사 (실제 교사 계정 사용 금지)
 ├─ Student (siteId, name, loginId[unique], passwordHash, region, birthDate)                  ← 테스트 학생 (나이대·거주지역은 평가 문구·번역에 영향)
 │    └─ Enrollment (siteId, studentId, packageMonths, classMethod, scheduleDays, totalSessions, startDate, endDate, textbookName?)
 │          └─ ClassSession (siteId, enrollmentId, studentId, teacherId, scheduledAt[이미 지난 시각], durationMin, status)
 │                └─ AudioRecording (classSessionId[unique], fileName, providerTranscriptId[unique], processingStatus)
 └─ (평가 공개 후) LessonEvaluation (classSessionId[unique], content, contentTranslated?)
```
- `ClassSession.teacherId`는 NOT NULL이다 — 확인 권한은 이 값으로 판정된다.
- 모든 테스트 레코드는 식별 가능한 이름(예: `E2E-TEST-…`)을 붙이고, 끝난 뒤 **정리 방법**(삭제 순서: LessonEvaluation → AudioRecording →
  ClassSession → Enrollment → Student → Teacher)을 미리 정해 둔다. **운영 DB에서는 승인 없이 만들지도 지우지도 않는다.**
- 녹음: 직원 두 명이 영어 수업을 흉내 낸 3~5분 모의 수업(동의 받은 음성). LOW를 만들려면 다음 중 하나가 필요하다 —
  (a) 학생 역할이 먼저 말하기, (b) 재생 오디오를 섞어 3번째 목소리 만들기.
- **업로드 기능이 아직 없다.** 현재 코드에는 녹음을 올려 AssemblyAI에 webhook 포함으로 제출하는 경로가 없으므로, E2E에서는
  `submitTranscript(audioUrl, { webhookUrl, webhookSecret })`를 호출하는 별도 보조 스크립트가 필요하다(E2E 단계에서 작성, 지금은 만들지 않음).
  이 스크립트는 `providerTranscriptId`를 `audio_recordings`에 기록하고 `processingStatus`를 `TRANSCRIBING`으로 둔다.

### 4-2. 검증 대상 흐름과 단계별 증거
| # | 단계 | 확인할 증거 |
|---|---|---|
| 1 | AssemblyAI transcript | Universal-2 + `speaker_labels`로 제출됨, 완료 webhook 수신(`X-Webhook-Secret` 검증), 중복 webhook 무시 |
| 2 | webhook → `TRANSCRIBED` | 단일 조건부 UPDATE, background 호출(`RECORDING_PROCESSING_SECRET`) |
| 3 | LOW 판정 | `NEEDS_SPEAKER_CONFIRMATION`, `transcriptUtterances`에 `speaker/start/end/text`만 저장(`words` 없음), Claude 호출 0회 |
| 4 | Teacher confirmation | 담당 교사만 가능, 상태 `TEACHER_SPEAKER_CONFIRMED`, 확인자/시각/라벨 기록 |
| 5 | 기존 transcript 재사용 | **AssemblyAI 호출 수 증가 없음**(AssemblyAI 대시보드로 교차 확인), 같은 transcript로 분석 |
| 6 | Claude | `claude-haiku-4-5`, temperature 0.2, 시도 ≤ 4, `ANALYZING` 고착 없음 |
| 7 | Student Feedback · Teacher QC | 두 보고서 모두 검증 통과, 날조 인용 0 |
| 8 | publish | `NEEDS_REVIEW` → 교사가 검토·수정 → publish, 수업이 `COMPLETED`, 기존 평가서 덮어쓰기 보호 |
| 9 | 학생 노출 | 테스트 학생 계정에서 평가서(번역 포함)가 보이고, **Teacher QC·aiDraft 원본은 어디에도 보이지 않음**, 다른 학생은 접근 불가 |

추가로 한 번씩: (a) HIGH 녹음 한 건이 기존처럼 확인 없이 진행되는지, (b) 실패 경로(Claude 키 제거 등)에서 `ANALYSIS_FAILED`와 안내 문구,
(c) 복구 함수(`recover-transcribed-recordings`)가 15분 주기로 실제 실행되는지 Netlify 로그로 확인.

**통과 기준:** 위 9단계 증거가 모두 있고, 운영 DB의 기존 데이터 변화가 0이며(리허설이면 해당 DB 기준), 비밀값이 로그·화면에 노출되지 않는다.

---

## 5. 개인정보 TODO (이번 단계에서는 자동 삭제 코드를 만들지 않음)

현재 구현은 `transcriptUtterances`에 **speaker/start/end/text만** 저장(whitelist)해 최소화했다. 아래 정책은 별도 결정이 필요하다.

| 대상 | 현재 | 결정할 것 |
|---|---|---|
| `transcript` (평문 전체) | 분석 시작 시 저장, 삭제 없음 | 보관 기간, 삭제 시점 |
| `transcriptUtterances` | LOW 경로에서만 저장, 삭제 없음 | 분석 완료/publish 후 `null`로 비울지(재분석 기능이 없다면 불필요) |
| `aiDraft` | 교사 publish 후에도 남음 | 보관 기간 |
| `teacherQcDraft` | 교사 전용, 삭제 없음 | 보관 기간, 접근 범위 |
| 원본 녹음 파일 | 저장소(Drive) 연동 미구현. `deletedAt` 컬럼만 있음 | 삭제 정책과 `deletedAt` 기록 |

적용 위치 후보: publish 트랜잭션(`commitAIDraftPublish`) 또는 별도 예약 정리 함수. 어느 쪽이든 승인 후 별도 PR로 한다.

---

## 6. 남은 위험과 TODO

- migration 운영 적용 승인 미정 / 실제 브라우저 UI 미검증 / Production E2E 미실행
- Student Feedback과 Teacher QC가 결합되어 있음 — QC가 4회 모두 실패하면 통과한 Student Feedback까지 `ANALYSIS_FAILED`
  (독립 상태 저장은 schema 변경이 필요한 향후 과제)
- 실제 녹음 6건 중 3건이 LOW였다 — 교사 확인이 자주 필요할 수 있음
- `Okay.`가 읽기 이어가기 신호로 처리되는 한계, 3명 이상 목소리를 자동 제외하지 않는 한계
- 화자 판정 임계값은 6건 기준이며 오디오로 직접 검증하지 않았다
- 업로드 기능 미구현(E2E는 보조 스크립트 필요)
