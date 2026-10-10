# 관리자 접근 통제 (RBAC + 협력사 범위)

관리자 앱의 페이지 · 서버 액션 · 관리자 토큰 API가 **서버에서** 권한과 데이터 범위를 확인하는 방법과, 그것을 CI가 어떻게 고정하는지 설명한다.
사이드 메뉴 숨김(`layout.tsx`)은 편의일 뿐이고, 접근 차단은 아래 검사가 담당한다.

## 역할과 범위 (기존 정책, 이번에 바꾸지 않음)

| 역할 | 권한 | 데이터 범위 |
|---|---|---|
| ADMIN | 항상 전체 허용 | 전체 |
| MANAGER | `prisma/seed.ts`의 `MANAGER` 목록(seed 기준 42개) | 전체(협력사 구분 없음) |
| AGENT(협력사) | `AGENT_PERMISSIONS` 15개 | **자기 협력사(`agentId`) 데이터만**. 본사 직영(`agentId = null`)과 다른 협력사는 볼 수 없음 |
| TEACHER / STUDENT | 각자의 포털(`/teacher`, `/student`) | 본인 소유 데이터만(각 포털이 `where`로 강제) |

권한 목록은 DB(`role_permissions`)가 기준이고 ADMIN이 `/permissions`에서 바꿀 수 있다. 그래서 **권한 키만으로 안전하다고 가정하지 않는다** —
협력사에 키가 잘못 부여돼도 본사 전용 화면은 열리지 않고, 다른 협력사 레코드는 건드릴 수 없다.

## 검사 도구

| 도구 | 위치 | 쓰는 곳 | 실패 시 |
|---|---|---|---|
| `hasPermission` / `requirePermission` | `lib/rbac.ts` | 모든 곳(판정 기준 하나) | `ForbiddenError` |
| `requirePageActor(key, { denyAgent })` | `lib/pageAccess.ts` | 페이지 첫 줄 | 404(`notFound`) |
| `requirePageInScope(actor, kind, id)` | `lib/pageAccess.ts` | id를 받는 상세 페이지 | 404 |
| `requireInScope(prisma, actor, kind, id)` | `lib/agentScope.ts` | 서버 액션 | `ForbiddenError` |
| `requireHeadquarters(actor)` | `lib/agentScope.ts` | 본사 전용 서버 액션 / API | `ForbiddenError`(API는 403) |

- 권한이 없는 사람에게 화면/레코드의 존재를 알리지 않으려고 페이지는 403이 아니라 **404**로 돌려준다(`(admin)/not-found.tsx`).
- `kind`: `student`(학생의 협력사), `enrollment`·`levelTest`·`reservation`·`closure`(레코드 자신의 협력사), `session`·`leaveRequest`(학생의 협력사).
  기존 화면의 스코핑 기준과 똑같이 맞췄다. 본사 계정(AGENT가 아닌 역할)은 항상 통과, AGENT는 레코드가 있고 `agentId`가 자기 협력사일 때만 통과.
- `denyAgent`: 협력사 메뉴(`AGENT_NAV_GROUPS`)에 없는 화면. 협력사는 `teachers.view` 같은 키가 있어도 열 수 없다.

## 페이지별 정책

`scripts/test-rbacCoverage.ts`의 `PAGES` 표가 이 표의 원본이다(새 페이지는 표에 없으면 CI 실패).

| 페이지 | 필요 권한 | 협력사(AGENT) |
|---|---|---|
| `/teachers`, `/teachers/new`, `/teachers/[id]` | `teachers.view` / `create` / `view` | 차단 |
| `/agencies`, `/agencies/[id]` | `agencies.view` | 차단 |
| `/bulletins`(+`new`, `[id]`) | `bulletins.view` / `create` / `view` | 차단 |
| `/home-notices`(+`new`, `[id]`) | `home_notices.view` / `create` / `view` | 차단 |
| `/consult-channels`, `/reviews` | `consult_channels.view`, `reviews.view` | 차단 |
| `/evaluations`(+`[id]`), `/monthly-evaluations`(+상세) | `evaluations.view`, `monthly_evaluations.view` | 차단 |
| `/reservations`(+`new`) | `reservations.view` / `create` | 차단 |
| `/deleted-sessions`, `/overlapping-sessions` | `schedules.view` | 차단 |
| `/schedule/new` | `schedules.create` | 차단 |
| `/students`, `/students/new` | `students.view` / `create` | 자기 협력사 학생만 |
| `/students/[id]` | `students.view` | 소속 검사 |
| `/students/[id]/sessions` | `schedules.view` | 소속 검사(학생) |
| `/students/[id]/enrollment` | `enrollments.create` | 소속 검사(학생) |
| `/students/[id]/level-test` | `level_tests.create` | 소속 검사(학생) |
| `/enrollments`, `/enrollments/new`, `/enrollments/[id]/edit` | `enrollments.view` / `create` / `update` | 자기 협력사 수강만 |
| `/level-tests`, `/level-tests/new` | `level_tests.view` / `create` | 목록·신청 학생 목록은 자기 협력사만 |
| `/level-tests/[id]`, `/level-tests/[id]/result` | `level_tests.view` | 소속 검사(레벨테스트) |
| `/schedule`, `/pricing` | `schedules.view`, `pricing.view` | 자기 협력사 범위(기존) |
| `/leave-requests` | 전체수업휴강 탭 `academy_closures.view`, 그 외 `leave_requests.view` | 전체수업휴강 탭으로 고정(기존) |
| `/settlements`, `/student-holds` | `enrollments.view`(기존) | 자기 협력사 |
| `/teacher-paid-leaves` | `leave_requests.view` (액션은 `leave_requests.update` + 본사 전용) | 차단 |
| `/accounts`, `/permissions`, `/audit-log`, `/session-plan` | ADMIN만(기존) | 차단 |
| `/`, `/my-profile` | 로그인(역할별 화면) | 자기 협력사 통계 / 본인 정보 |

## 서버 액션 · API

`ACTIONS` / `API` 표(`test-rbacCoverage.ts`)에 모든 함수의 권한 키와 추가 검사가 적혀 있다. 이번에 추가한 것:

- **본사 전용(`requireHeadquarters`)**: 강사, 공지, 홈 공지, 상담채널, 후기, 협력사 설정, 일일/월 평가서(관리자), 강사 자리 예약, 수강신청(리드) 상태 변경.
- **협력사 소속 검사(`requireInScope`)**: 수업 상태 변경/삭제/복원/등록, 연기 신청 승인·반려·되돌리기·등록, 학생 수업관리 액션(취소/연기/보충), 레벨테스트 수정·확정·결과·삭제·등록, 수강 삭제, 학생 복원·대리 로그인.
- **`getAvailableTeachersForSlot`**(학생 수업관리)와 **`getAvailableTeachersForLevelTestSlot`**(레벨테스트 폼, 공용 `"use server"`): 로그인만으로/조회 권한만으로 모든 강사의 근무 가능 시간·일정 충돌을 조회할 수 있던 것을 각각 `schedules.create`, `level_tests.create` 또는 `level_tests.update`(일정을 잡는 권한)로 제한. 권한이 없는 계정(협력사)은 레벨테스트 상세 화면은 그대로 열리고 강사 후보 목록만 비어 있다.
- **`createLevelTestCore`**(공용 `"use server"` 함수): 학생 소속 검사 추가(폼의 `studentId`를 바꿔 보내도 남의 학생에게 등록할 수 없음).
- **관리자 토큰 API(`/api/public/*`)**
  - `PATCH /pricing`: **협력사 관리자도 `pricing.update`만 있으면 본사 기본 가격표(`agentId = null`)를 고칠 수 있었다.** 이제 협력사는 403.
  - `DELETE /reviews/[id]`: **관리자 토큰이면 역할과 무관하게 모든 후기를 지울 수 있었다.** 이제 남의 글은 `reviews.delete`(본사)가 있어야 하고, 협력사는 자기가 쓴 글만 지울 수 있다.
  - `POST·PATCH·DELETE /home-notices`, `PATCH /consult-channels/[id]`: 본사 데이터를 고치는 API라 협력사는 403.

## 테스트

| 테스트 | 무엇을 | DB |
|---|---|---|
| `scripts/test-rbacCoverage.ts` | **자동 탐색**한 모든 항목이 정책 표에 있고 표대로 검사하는지, 그 검사가 **데이터 조회/변경보다 먼저** 실행되는지 | 불필요 |
| `scripts/test-rbacAccess.integration.ts` | PostgreSQL에서 **앱 코드를 그대로 호출**: 역할(ADMIN/MANAGER/AGENT A·B)별 페이지 직접 접근, 다른 협력사 id 입력(IDOR), 서버 액션, 공용 서버 액션, 관리자 API, 로그인 없는 요청 | 필요 |

### 커버리지 테스트가 훑는 범위
- `app` 아래 **모든 page.tsx**: (admin)은 `PAGES` 표, 강사/학생 포털은 `requireTeacher()`/`requireStudent()`, 로그인 화면은 `OTHER_PAGES`. 어디에도 속하지 않으면 실패.
- `src` 아래 **`"use server"`가 들어간 모든 파일**(`lib/` 포함): (admin)은 `ACTIONS`, `lib/`는 `LIB_ACTIONS`, 포털은 본인 확인 호출, 로그인 액션은 `LOGIN_ACTIONS`. 파일 맨 앞이 아닌 곳의 인라인 서버 액션은 실패(이 테스트가 볼 수 없으므로).
- `app/api` 아래 **모든 route.ts**: 종류(관리자 토큰 / 관리자 쿠키 / 학생 토큰 / 공개 / 로그인 / 토큰 검증 / 웹훅)를 `API` 표에서 반드시 선언. 공개 라우트는 사유를 적고, 쓰기 호출이 없고 관리자 인증을 쓰지 않는지 확인.
- **순서 검사**: 권한/소속 검사 앞에 `prisma.`/`tx.` 접근이나 요청 인자·인증 호출 외의 `await`가 있으면 실패. 협력사 소속 검사는 첫 데이터 접근보다 앞, 기존 인라인 소속 검사는 첫 변경보다 앞이어야 한다.
- 한계: 소스 텍스트 기반이라 동적으로 만든 호출은 볼 수 없다. 동작은 통합 테스트가 확인한다.

### 통합 테스트
`prisma/seed.ts`의 실제 권한 정책을 읽어 DB에 넣고, 쿠키로 로그인한 상태에서 페이지 함수·서버 액션·라우트 핸들러를 직접 부른다(`next/headers`·`next/cache`만 가짜).
세 단계: ① 기본 권한 그대로(차단 + **정상 접근이 그대로인지**), ② 협력사에 권한 키를 잘못 부여한 상황(본사 전용/소속 검사가 막는지, 자기 협력사 레코드는 계속 처리되는지), ③ 관리자 토큰 API.
- **테스트 DB 가드**: `TEST_DATABASE_URL`이 localhost의 이름에 `test`가 든 DB이고 `?schema=`가 없을 때만 실행. 그 밖이면 TRUNCATE 전에 종료한다(운영 DB 보호).
- **외부 연동 격리**: 시작할 때 `GOOGLE_*`, `R2_*`, `ANTHROPIC_*`, `ASSEMBLYAI_*`, `RECORDING_*`, `KAKAO_*`, `AWS_*` 등 환경변수를 지우고(셸에 운영 키가 있어도 앱은 연동을 "건너뜀"으로 처리), localhost 밖으로 나가는 TCP 연결은 모두 차단·기록한다. 테스트는 끝에서 기록이 비어 있는지 확인한다.
- 수정 전 코드에 이 테스트를 돌리면 132건이 실패한다(= 실제로 열려 있던 구멍을 잡는다).

## 새 화면을 만들 때

1. 페이지 첫 줄에 `await requirePageActor("<권한 키>"[, { denyAgent: true }])`. id를 받으면 `requirePageInScope`.
2. 서버 액션은 `requirePermission` 바로 아래에 `requireHeadquarters(actor)`(본사 전용) 또는 `await requireInScope(prisma, actor, "<kind>", id)`(대상이 협력사 소속인 경우).
3. `test-rbacCoverage.ts`의 표에 정책을 적는다(표에 없으면 CI가 실패한다).
