# 연기 / 정규 수업 cascade / 학원 휴강 / 보충수업 / 유급휴가 — 구현 사양과 구조

이 문서는 확정된 운영 정책을 코드가 어떻게 구현하는지 한곳에 정리한다. 정책이 바뀌면 이 문서와 `scripts/test-postponementPolicy.ts`, `scripts/test-postponementFlow.integration.ts`를 함께 고친다.

## 1. 개념 구분 (사유 `RescheduleSource`)

| source | 누가/언제 | 학생 연기 횟수 | 2시간 제한 | 급여 |
|---|---|---|---|---|
| `STUDENT_POSTPONEMENT` | 학생이 직접, 또는 관리자가 학생 대신 "학생연기" | -1 (최종 사유가 이것일 때만) | 학생이 **직접**할 때만 | 영향 없음 |
| `ADMIN_POSTPONEMENT` | 관리자 "관리자연기" | 없음 | 없음 | 영향 없음 |
| `TEACHER_HOLD` | 관리자가 강사 홀드 요청 승인 | 없음 | 없음 | 일반 LEAVE(0원) |
| `ACADEMY_CLOSURE` | 학원 휴강 등록 | 없음 | 없음 | 영향 없음 |
| `PAID_LEAVE` | 정규 강사 유급휴가 승인 | 없음 | 없음 | 승인 1건 = 레이트 × 8 |
| `OTHER_UNPAID_LEAVE` | 그 밖의 무급 휴강(예약값) | 없음 | 없음 | 0원 |

실행자(actor)는 `LeaveRequest.executedByRole/executedById`에 따로 남는다. 관리자가 학생 대신 학생연기를 눌러도 `source = STUDENT_POSTPONEMENT`, `executedByRole = ADMIN`이다.
옛 화면 분류와의 호환을 위해 `requestedByRole`은 학생연기이면 `STUDENT`, 강사 홀드이면 `TEACHER`, 그 밖에는 실행자 역할이다.

## 2. 학생 연기 횟수

- 주 2회 = 등록 개월 × 1, 주 3회 = × 2, 주 5회 = × 3. 주 1/4/6/7회는 0회(정책에 값이 없다).
- 등록기간 전체 기준이다(월별 reset 없음). 관리자 가감 `Enrollment.leaveQuotaAdjustment`가 더해져 `effectiveQuota`가 된다.
- 사용 횟수는 카운터가 아니라 `LeaveRequest` 행에서 계산한다(`usedFromLeaveRows`): 승인된 건 중 `quotaImpact` 합(+ `source`가 없는 옛 학생 신청 건). 행을 지우거나 학원 휴강으로 대체해도 이중으로 차감/복구되지 않는다.
- 계산은 `src/lib/leavePolicy.ts` 한 곳이고 학생 화면, 마케팅 API, 관리자 화면이 모두 이것을 쓴다.
- 관리자 가감은 결과가 음수이거나 이미 쓴 횟수보다 작아지면 거부한다. 변경 이력(수강, 학생, 관리자, 이전/이후 값, 사유, 시각)은 `audit_logs`에 남는다.

## 3. 정규 수업 cascade (`src/lib/reschedule.ts`, `src/lib/regularSlot.ts`)

한 트랜잭션, 강사 → 수강 → 학생 advisory lock 아래에서:

1. 연기된 수업을 `LEAVE`로 바꾼다(원래 날짜의 기록 + `generationKey` 묘비 유지 → 수업 생성기를 다시 돌려도 되살아나지 않는다).
2. 정규 수업 시퀀스를 한 칸 뒤로 민다. 날짜 집합 기준으로 이것은 "연기된 날짜를 비우고, 연기된 수업 이후 **첫 번째 비어 있는 유효 정규 슬롯** 하나를 채우는 것"과 같다. 그래서 실제 DB 변경은 필요한 최소(연기 행 1개 + 채워지는 슬롯 1개)로 하고, 나머지 수업 행(평가서, 녹음, 대체 강사 같은 행별 데이터)은 건드리지 않는다. 이 결과가 전체 시퀀스를 실제로 한 칸씩 민 것과 같다는 것은 `test-regularSlot.ts`가 무작위 시나리오 400개로 "한 칸씩 미는 참조 구현"과 비교해 증명한다.
   - 새 수업은 `isSupplement = false`, 같은 강사·시각 규칙(`classTimes` → `classTime`), `relatedSessionId = 연기된 원 수업`, `generationKey = <수강>:<날짜>`.
   - 슬롯에서 건너뛰는 날짜: 이미 그 수강의 정규 수업(어떤 상태든, 삭제 포함)·generationKey가 찬 날짜, 학원 휴강일(KST, 협력사 범위 적용), 강사/학생/레벨테스트의 다른 일정과 겹치는 슬롯.
   - 월/수/금에서 수요일 연기 → `월 금 월 수 금 월`, 금요일이 휴강이면 다음 월요일.
3. 수강 종료일 = 새 슬롯이 종료일보다 뒤면 그 슬롯 날짜(실제 마지막 정규 수업 날짜). 단순 `+1일`이 아니다. 종료일 이내의 빈 슬롯을 채운 경우는 연장하지 않는다.
4. `totalSessions`는 바뀌지 않고, 보충수업은 만들어지지 않는다.

적용 대상: 학생 연기, 관리자 연기, 승인된 강사 홀드, 학원 휴강, 승인된 유급휴가(전부 같은 `rescheduleSession`). 사유/권한/급여/승인은 호출부가 따로 다룬다.

### 관리자연기 대상
평가서가 없는 모든 수업 — 상태 `SCHEDULED/COMPLETED/MAKEUP_NEEDED`, 시간 조건 없음(과거·오늘·미래). `CANCELLED/LEAVE/HOLD`는 대상이 아니다. 평가서(또는 녹음 AI 결과)가 있으면 평가 초기화 후에만 가능하고, 녹음 AI 처리 중이면 초기화도 연기도 불가하다.

### 평가 초기화
`LessonEvaluation`을 지우고 `AudioRecording`의 `aiDraft/teacherQcDraft/errorMessage/analyzedAt/reviewedAt`을 비우고 상태를 `EVALUATION_RESET`으로 둔다. 녹음 원본(R2 키 `driveFileId`), 파일명, 전사, `providerTranscriptId`는 보존한다. 감사 로그에 행위자·사유·삭제된 평가서 글자 수·원본 보존 여부를 남긴다.

## 4. 학원 휴강과 학생 연기 (supersede)

- 학생이 먼저 연기한 날을 이후 학원 휴강으로 지정하면: 이미 한 번 재배치된 수업이라 cascade도 종료일 연장도 다시 하지 않는다. 그 연기는 `finalSource = ACADEMY_CLOSURE`, `quotaImpact = 0`, `supersededByClosureId`로 바뀌고 이력(`source`, 실행자, 대체 수업)은 보존된다 → 학생 횟수 복구.
- 휴강이 먼저면 그 날 수업은 이미 LEAVE이므로 학생이 연기할 수 없고 횟수도 차감되지 않는다.
- 휴강 되돌리기: 휴강으로 재배치된 수업을 되돌리고 대체됐던 학생 연기를 복원(횟수 -1)한다. `supersededByClosureId` 조건으로 한 번만 복원된다.
- 같은 날짜·같은 범위(본사/협력사)의 휴강은 중복 등록할 수 없다.

## 4b. 학생 연기 횟수 표시와 수정(수강내역 화면)

수강내역 목록의 "학생 연기 횟수" 열이 **기본 / 관리자 조정 / 최종 적용 / 사용 / 잔여**를 서로 다른 이름으로 보여 주고, 본사 계정(ADMIN/MANAGER)은 조정값을 수정할 수 있다(협력사는 보기만). 서버가 `adjustLeaveQuota`로 검증한다: 최종 적용이 0 미만이거나 이미 사용한 횟수보다 작아지는 값은 거부, 사유 필수, 수강 단위 락, 감사 로그. 기본값은 정책 그대로 주 1·4·6·7회 = 0회다.

## 4c. 수강 홀드(`holdApply.ts`) — TEACHER_HOLD와 다른 개념

TEACHER_HOLD는 강사가 수업 1건에 신청해 관리자가 승인하는 홀드이고(`approveLeaveRequest` → `rescheduleSession`), 수강 홀드는 수강 건 전체를 멈췄다가 재개하는 것이다. 해제할 때 멈춰 있던 정규 수업은 쉰 일수를 채운 정수 주만큼 통째로 밀리되, 밀린 날짜가 휴강일·승인된 유급휴가일·같은 수강의 찬 날짜·강사/학생/레벨테스트 일정과 겹치면 연기와 같은 "다음 유효 슬롯"으로 한 번 더 밀린다. 평가서/녹음이 붙은 수업은 제자리에서 되살리되 그 시각이 충돌하면 해제 전체를 롤백한다.

## 5. 정규/보충 분리 집계 (`src/lib/lessonCounts.ts`)

정규 20 + 보충 1 = 제공 가능 21 (`totalSessions`는 20). 정규 19 완료 + 보충 1 완료 → 정규 잔여 1, 보충 1, 받은 수업 20. 학생 강의실, 관리자 수강 목록, 마케팅 API(`isSupplement`, `supplementLessons`, `providedLessons`, `availableLessons`), 출석증이 같은 의미를 쓴다.

보충수업 생성 검증(`src/lib/supplement.ts`): 강사 일정 충돌, 학생 본인 일정 충돌, 학원 휴강일, 수강 기간 밖, 같은 수업 중복, 관련 정규 수업(`relatedSessionId`)이 같은 수강인지. 검사와 생성이 한 트랜잭션이다.

## 6. 유급휴가 (`TeacherPaidLeave`, `src/lib/teacherPaidLeave.ts`, `src/lib/paidLeavePolicy.ts`)

- 정규 강사(`Teacher.employmentType = REGULAR`, 기본 `NON_REGULAR`)만. 지정은 기존 강사 수정 화면의 "정규 강사 여부"로 하고(별도 화면 없음), 서버가 값을 검증한다(`teacherEmployment.ts`: 값이 없으면 변경 없음, 두 값이 아니면 오류, 협력사(AGENT)는 지정 불가, 변경은 감사 로그). 기존 강사를 일괄로 정규로 바꾸는 코드는 없다.
- **2026년 이전 유급휴가 이력(구글 시트)은 시스템으로 옮기지 않는다.** 이력 등록·한도 차감 기능은 없고, 기존 승인 기능으로 과거 날짜를 입력하지 않는다(승인은 그 날 수업을 재배치한다). 시스템 한도는 시스템에서 승인된 건만 센다. 달력 기준 상반기(1~6월) 5회 + 하반기(7~12월) 5회, 연간 10회, 승인된 건만 센다.
- `@@unique([teacherId, leaveDate])` — 같은 강사·같은 날은 1건. 그날 학생 수업이 몇 건이든 급여는 승인 1건 = 레이트 × 8 한 번.
- 승인하면 그 강사의 그 날 예정 수업이 자동으로 cascade된다(보충수업은 재배치 없이 휴강 처리). 휴가일 이전 승인이 원칙(휴가일 당일까지 사전). 휴가일이 지난 뒤의 승인/수정은 관리자(ADMIN)만 가능하고 `postApproval = true` + 감사 로그.
- 일반 LEAVE(정전, 인터넷 문제, 지각 등)는 급여 0, 유급휴가 한도 미차감. `teacherStats`는 `LEAVE` 세션을 급여 대상으로 조회하지 않고, 승인된 `TeacherPaidLeave`만 지급한다.

## 7. 동시성과 멱등성

- advisory lock 순서(전역): 강사(7002) → 수강(7001) → 학생(7004). 수업 생성 실행기(`sessionGeneration.ts`)와 같은 네임스페이스라 서로 직렬화된다. 학원 휴강은 날짜 락(7006)을 먼저 잡는다. 여러 건을 처리하는 호출부(휴강, 유급휴가)는 필요한 키를 한꺼번에 먼저 잡는다.
- 잠근 뒤 다시 읽는다(READ COMMITTED에서 앞선 트랜잭션의 결과를 본다).
- 최종 안전장치: `ClassSession.generationKey` unique(같은 슬롯 중복 생성 방지), `LeaveRequest.classSessionId` unique(같은 수업 중복 연기 방지), `LeaveRequest.replacementSessionId` unique, `TeacherPaidLeave (teacherId, leaveDate)` unique, `quotaImpact IN (0, 1)` CHECK.
- 수업 생성 planner(`sessionPlan.ts`)는 **승인된 강사 유급휴가일을 그 강사의 정규 수업 후보에서 제외**하도록 바뀌었고(`skippedPaidLeave`로 기록, 휴강과 같은 날이면 휴강 우선), `PLANNER_VERSION`은 `session-plan/3`으로 올렸다(규칙이 바뀌었으므로 옛 계획 지문과 섞이지 않는다). 계획 입력 로더(`sessionPlanData.ts`)가 승인된(APPROVED) `TeacherPaidLeave`를 읽는다.
- 생성 실행기(`sessionGeneration.ts`)의 코드는 바뀌지 않았다. 실행기는 원래부터 수강 단위 트랜잭션 안에서 **같은 로더로 다시 계획**하므로 새 규칙이 그대로 적용된다.
  - 미리보기 뒤에 유급휴가가 승인되면 계획 지문이 달라져 시작 단계에서 `PLAN_HASH_MISMATCH`로 거부된다(아무것도 쓰지 않음).
  - 지문 검사를 통과한 뒤 강사 락을 잡기 직전에 승인이 커밋되면, 락 안 재계획의 행 서명이 달라져 그 수강은 `STALE`로 기록되고 세션이 생성되지 않는다.
  - 생성이 먼저 끝났다면 유급휴가 승인이 그 날 수업을 찾아 재배치한다(승인은 강사 락을 먼저 잡고 그 다음에 수업 목록을 읽는다).
  - 실행기와 승인은 같은 락 네임스페이스(강사 7002 → 수강 7001)와 순서를 쓴다(`advisoryLock.ts`).
- 승인된 유급휴가일은 그 강사에게 **새 수업이 생기지 않는 날**이다: 연기 대체 슬롯 탐색, 수강 홀드 해제 배치(평가서/녹음이 붙은 제자리 수업은 오류로 롤백), 보충수업 생성이 모두 그 날을 건너뛰거나 거부한다. 승인을 취소(`REJECTED`)하면 그 날이 다시 열린다.
- planner가 아직 하지 않는 일(별도 PR): 휴강·유급휴가로 건너뛴 날짜 때문에 줄어든 회차를 채워 총 회차를 보장하는 것.

## 8. 되돌리기와 호환

- 새 방식 건: 대체 수업을 지우고(아직 SCHEDULED이고 평가/녹음/후속 연기가 없을 때만) 종료일을 되돌린 뒤 `LeaveRequest`를 지운다. 후속 변경이 있으면 되돌리기를 거부한다.
- 옛 방식 건(`source` 없음): 기존처럼 수업 상태와 종료일(−`extendedDays`일)만 되돌린다. 옛 학생 신청 건은 학생 연기 1회로 계산한다.
- 마이그레이션은 추가형이다(전부 nullable/default). 운영의 기존 행은 바뀌지 않는다.
