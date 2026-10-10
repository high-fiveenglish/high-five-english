# 녹음 처리 경로의 환경 격리 (PR #18)

Deploy Preview(또는 개발 환경)가 **운영** 사이트의 녹음 처리 함수(`process-recording-background`)나 AssemblyAI 웹훅 주소를 가리키지 않도록,
그리고 운영 처리 함수가 **다른 환경에서 온 요청**을 거절할 수 있도록 하는 장치의 설계·운영 문서입니다.
코드는 `src/lib/recordingTarget.ts`(규칙), `recordingTrigger.ts`(호출), `recordingProcessing.ts`(수신), `recordingIntakeConfig.ts`(웹훅 주소)에 있습니다.

> 이 문서는 코드와 로컬 테스트로 확인한 사실만 "확인"으로 적습니다. Netlify의 실제 변수 값·Scope, 운영 로그는 이 작업에서 **조회하지 않았으므로 미확인**입니다.

## 1. 한 줄 요약

| 단계 | 호출하는 쪽(트리거) | 받는 쪽(처리 함수) |
|---|---|---|
| `RECORDING_TARGET_GUARD` 미설정 / `observe` (기본) | 예전과 같은 주소로 호출. 규칙상 거부였을 상황은 **사유 코드만 로그** | 환경 헤더 누락·불일치도 통과. **사유 코드만 로그** |
| `enforce` | 규칙을 통과한 주소로만 호출, 아니면 **호출하지 않음** | 환경 헤더 누락·불일치 → **403**, 이 배포의 `APP_ENV` 없음 → **503** |

기본값이 observe 이므로 이 PR을 배포하는 것만으로 운영 동작은 바뀌지 않습니다(환경변수를 아무것도 바꾸지 않은 경우).

## 2. 환경변수

| 변수 | 값 | 역할 | 어디에 필요한가 |
|---|---|---|---|
| `APP_ENV` | `production` \| `preview` \| `development` | 이 배포가 어느 환경인지 스스로 밝히는 값. 규칙의 유일한 기준 | **Functions 런타임 Scope 포함** 필수(아래 3) |
| `RECORDING_SITE_URL` | https origin (경로·쿼리·사용자 정보 없음) | 비운영 배포가 호출할 자기 자신의 주소. 운영은 없으면 `URL` 사용 | 비운영 배포에서 녹음 기능을 쓸 때만 |
| `PRODUCTION_SITE_ORIGIN` | 쉼표로 구분한 https origin 목록 | 운영의 별칭(예: www 없는 주소, 사용자 정의 도메인). 비운영이 가리킬 수 없는 주소 집합에 더해짐 | 운영 도메인이 `URL` 하나가 아닐 때 |
| `RECORDING_TARGET_GUARD` | `observe`(기본) \| `enforce` | 단계적 도입 스위치 | 호출하는 쪽·받는 쪽 모두 |
| `RECORDING_PROCESSING_SECRET` | 비밀값 | 기존 서버-서버 인증 | 기존 그대로. **환경(Context)마다 서로 다른 값 권장**(4) |
| `URL`, `SITE_NAME` | Netlify가 자동 제공 | `URL`=사이트의 메인(운영) 주소, `SITE_NAME`=사이트 이름 | 자동. 함수 런타임에서 읽을 수 있는 것은 `URL`·`SITE_NAME`·`SITE_ID` 뿐이고 `DEPLOY_URL`·`CONTEXT`는 없음 |

운영 origin 집합 = `URL`의 origin + `https://<SITE_NAME>.netlify.app` + `PRODUCTION_SITE_ORIGIN` 항목.
`SITE_NAME`은 Netlify 기본 도메인의 앞부분과 같은 값이며(Netlify 문서·사이트 메타데이터로 확인), DNS 라벨 형식이 아니면 별칭으로 쓰지 않고 `site_name_invalid`만 로그합니다.

호스트 비교는 정규화 후 합니다: 소문자, 기본 포트(443) 생략, 끝 슬래시 제거, **호스트 끝의 `.`(FQDN 표기) 제거**.
`https://prod.example.com.` 은 `https://prod.example.com` 과 같은 origin 입니다. 호스트 이름과 포트만 다듬으므로 다른 호스트(`prod.example.com.evil.com`, `xprod.example.com`)나 다른 포트는 다른 origin 으로 남습니다(테스트로 확인).

## 3. 환경변수 Scope 점검 (enforce 전 필수)

Netlify 환경변수는 **배포 시점의 스냅샷**입니다. 값을 바꾸거나 추가하면 **다시 배포해야** 반영되고, 이전 배포를 다시 게시(publish)하면 그 배포의 스냅샷이 되돌아옵니다.
또한 변수의 Scope에 **Functions**가 포함되어 있어야 함수 런타임(`process-recording-background`, `recover-*` 예약 함수, Next.js 서버 코드)에서 읽힙니다. 빌드 전용 Scope 로만 두면 런타임에서는 비어 있습니다.

enforce 로 가기 전에 아래를 Netlify 콘솔에서 사람이 확인해야 합니다(이 PR 작업에서는 확인하지 않았습니다 — 미확인).

1. `APP_ENV` — **Context별로 값을 따로 설정**: Production = `production`, Deploy Preview = `preview`(Branch deploy를 쓰면 그것도 `preview`).
   **`All contexts`로 `production` 하나만 두거나, Deploy Preview에도 `production`이 적용되면 이 장치는 무력화됩니다**(2의 신뢰 기준이 거짓이 되므로).
2. 위 변수들의 Scope에 **Functions** 포함.
3. `RECORDING_PROCESSING_SECRET` 은 Production 과 Deploy Preview 에서 **서로 다른 값**.
4. 값 변경 후 **재배포**(Production은 새 배포, Preview는 새 커밋/재빌드).
5. 정말 Preview가 `preview`를 보고 있는지는, 변수 값 자체가 아니라 observe 단계 로그의 `reason`(아래 8)이 의도대로 나오는지로 확인합니다.

## 4. 보안 모델의 한계 (리뷰 F1·F2)

- `x-recording-source-env` 헤더는 **인증이 아니라 일관성 검사**입니다. 비밀값(`x-recording-processing-secret`)을 아는 호출자는 이 헤더도 마음대로 쓸 수 있습니다(`production`이라고 적으면 통과 — 테스트로 문서화).
  이 헤더가 잡는 것은 "설정 실수로 Preview가 운영 처리 함수를 부르는 경우"입니다.
- 실제 방어선은 두 가지입니다: **(1) 수신 쪽(운영 처리 함수)이 `enforce`로 헤더를 요구**하고, **(2) 환경마다 서로 다른 비밀값**을 쓰는 것. 비밀값이 다르면 헤더를 속여도 401 입니다(테스트로 확인).
- `APP_ENV`는 배포가 스스로 말하는 **유일한 신뢰 기준**입니다. Preview 배포에 `APP_ENV=production`이 적용되면(변수 Scope를 `all`/`production`으로 둔 경우 등) 호출 쪽 규칙도, 보내는 헤더도 모두 "운영"이 되어 이 장치가 막지 못합니다. 코드로 보완할 수 없는 부분이며 3의 점검표로 관리합니다.
- 실제 Netlify Context 설정은 이 작업에서 읽거나 바꾸지 않았습니다.

## 5. `RECORDING_TARGET_GUARD` 허용 값 (리뷰 F6)

| 입력 | 동작 | 로그 |
|---|---|---|
| 미설정, `""`, 공백 | observe (기본값) | 없음 |
| `observe`, `enforce` (대소문자·앞뒤 공백 무시) | 해당 모드 | 없음 |
| 그 밖의 값 (예: `enforced`, `true`, `1`) | **observe 로 동작** | `recording-target-config` / `guard_mode_invalid` (값은 남기지 않음) |

오타가 있어도 운영 트리거는 막히지 않고(fail-open), 조용히 꺼진 채로 남지도 않습니다(로그로 드러남). 반대로 "오타면 막는다(fail-closed)"는 오타 한 글자로 운영 녹음 처리가 전부 멈출 수 있어 택하지 않았습니다.
**이 fail-open 정책이 맞는지는 오너 결정 사항입니다.** 정책을 바꾸려면 `readGuardModeDetailed` 한 곳과 해당 테스트(4번 블록)만 수정하면 됩니다.

## 6. 리다이렉트 (리뷰 F5)

`fetch`는 기본으로 리다이렉트를 따라가며, `x-recording-processing-secret` 같은 사용자 정의 헤더는 다른 origin 으로도 그대로 다시 보냅니다(Node 24 undici에서 로컬 loopback으로 확인: 307은 POST·본문·헤더 유지, 301은 GET 으로 바뀌지만 헤더 유지, `authorization`만 제거).
그래서 트리거는 `redirect: "manual"` 로 호출하고, **3xx 응답은 성공이 아니라 실패**로 처리합니다(레코드는 `TRANSCRIBED`에 남아 재시도 대상이 됨). 로그는 `recording-trigger-redirect` / `redirect_not_followed` 한 줄뿐이며 목적지 주소는 남기지 않습니다.
기존 계약(2xx → true, 비 2xx·네트워크 오류·5초 타임아웃 → false)은 그대로입니다.

## 7. 운영 절차 (리뷰 F3)

### 7-1. 단계

1. **배포 (observe)**: 이 PR을 병합·배포해도 동작은 같습니다. 환경변수는 아직 건드리지 않아도 됩니다.
2. **변수 준비**: 3의 점검표대로 `APP_ENV`(Context별), Scope(Functions), 환경별 다른 `RECORDING_PROCESSING_SECRET`을 준비하고 **재배포**.
3. **관찰 (observe)**: 운영 함수 로그에서 아래 두 종류가 **모두 0건**인지 확인합니다. 하루 이상 실제 녹음/복구 주기를 거친 뒤 판단합니다.
   - `recording-target-observe` (호출 쪽: 거부했을 사유) / `recording-target-config` (설정 오류)
   - 수신 쪽 `recording-target-observe` 의 `header_missing`, `header_mismatch`, `app_env_not_configured`
   함수 인스턴스마다 같은 사유는 한 번만 남으므로(F8) "건수 0"은 "해당 사유 없음"으로 읽고, 건수가 많다고 빈도가 높은 것은 아닙니다.
4. **enforce**: `RECORDING_TARGET_GUARD=enforce`를 설정하고 재배포. 운영 처리 함수는 환경 헤더가 없는 호출(이 PR 이전 코드로 빌드된 오래된 Preview 등)과 `preview`/`development` 헤더 호출을 403 으로 거절합니다. 운영 배포는 호출자이자 수신자이므로 같은 배포 안에서 호출 쪽 규칙과 수신 쪽 검사가 함께 켜집니다.
5. **모니터링**: enforce 직후 `recording-target-denied` 로그와, `TRANSCRIBED`/`TEACHER_SPEAKER_CONFIRMED`에 오래 머무는 레코드(아래 7-2)를 확인합니다.

### 7-2. enforce 설정 오류가 일으키는 일 (확인된 코드 동작)

처리 요청이 거절돼도 **레코드는 `TRANSCRIBED`(또는 `TEACHER_SPEAKER_CONFIRMED`)에 그대로 남고 실패로 확정되지 않습니다.** 복구 경로는 다음과 같습니다(`recordingRecovery.ts`, `netlify/functions/recover-transcribed-recordings.ts`, 테스트로 확인).

- 예약 함수 `recover-transcribed-recordings`(15분마다)가 마지막 상태 변경 후 **10분이 지난** `TRANSCRIBED` **및** `TEACHER_SPEAKER_CONFIRMED` 레코드를 다시 트리거합니다. 설정을 고치면 다음 주기에 정상 처리됩니다.
- **24시간 이상** 처리 요청이 계속 거절되면 복구가 포기하고 `ANALYSIS_FAILED`로 확정합니다(그 전에 설정을 고쳐야 합니다. 이후는 운영자가 수동 처리).
- 강사가 화자 확인 직후 트리거가 거절되면 확인은 저장되고 `triggered=false`가 되며, 같은 화자를 다시 누르면 재트리거됩니다.
- 예약 함수는 **게시된(published) 배포에서만** 실행됩니다. Deploy Preview에서는 돌지 않습니다.

> 검토 의견에는 "`TEACHER_SPEAKER_CONFIRMED`는 자동 복구 함수가 없고 수동 복구"라고 되어 있었으나, 현재 코드의 `recover-transcribed-recordings`는 `TEACHER_SPEAKER_CONFIRMED`도 대상으로 포함합니다(`where processingStatus in [TRANSCRIBED, TEACHER_SPEAKER_CONFIRMED]`). 이 문서는 코드를 기준으로 적었고, 정적 테스트가 이 사실을 고정합니다.

### 7-3. 롤백

- `RECORDING_TARGET_GUARD`를 제거하거나 `observe`로 되돌리고 **재배포**하면 즉시 예전 동작입니다(코드 롤백 불필요).
- Netlify에서 이전 배포를 다시 게시하면 그 배포의 **환경변수 스냅샷**으로 돌아갑니다. 변수만 고치고 재배포하지 않으면 반영되지 않습니다.
- 변수를 되돌렸는데도 거절이 계속되면, 거절된 레코드가 24시간 안에 다음 복구 주기로 재처리되는지 확인합니다.

## 8. 로그 사유 코드 (값·URL·비밀은 절대 남기지 않음)

형식은 한 줄 `메시지 {"reason":"<코드>","mode":"observe|enforce"}` 입니다. 같은 (메시지, 사유)는 함수 인스턴스당 한 번만 남깁니다.

| 메시지 | 사유 코드 | 뜻 |
|---|---|---|
| `recording-target-observe` / `-denied` | `app_env_unset`, `app_env_invalid` | `APP_ENV` 없음/허용 값 아님 |
| | `site_url_unset`, `site_url_invalid`, `site_url_not_https`, `site_url_has_credentials`, `site_url_not_origin` | 호출 주소 문제 |
| | `production_target_mismatch` | 운영이 운영 origin 이 아닌 곳을 가리킴 |
| | `production_origin_from_non_production` | 비운영이 운영 origin 을 가리킴 |
| | `production_origin_config_invalid` | 비운영인데 `PRODUCTION_SITE_ORIGIN`에 해석할 수 없는 항목이 있어 운영 별칭 여부를 단정할 수 없음 → 거부 |
| | `header_missing`, `header_mismatch`, `app_env_not_configured` | 수신 쪽 환경 헤더 검사 |
| `recording-target-config` | `guard_mode_invalid`, `production_site_origin_entry_invalid`, `site_name_invalid` | 설정 값 자체의 문제(모드와 무관하게 로그) |
| `recording-trigger-redirect` | `redirect_not_followed` | 처리 함수가 3xx 로 응답 |

운영(`APP_ENV=production`)에서 `PRODUCTION_SITE_ORIGIN`의 잘못된 항목은 거부 사유로 쓰지 않고(운영 트리거를 설정 오타로 막지 않기 위해) `recording-target-config`로만 로그합니다.

## 9. 테스트로 확인한 것 / 하지 않은 것

확인(로컬, `scripts/test-recordingTarget.ts` 및 기존 녹음 테스트): 규칙 표, observe/enforce, 환경 간 호출(Preview→Production 403, Production→Production 통과, 헤더 없는 구형 호출자→enforce 403), 가드 값 오타·빈 문자열, 끝 점·사용자 정의 도메인·`SITE_NAME` 별칭, 잘못된 `PRODUCTION_SITE_ORIGIN`, 301/302/303/307/308 리다이렉트(로컬 loopback 서버로 비밀값 헤더가 다른 origin 에 가지 않음), 실제 Netlify 함수 모듈을 통한 환경 검사(403/401/503), 기본 로그 경로의 비노출, 설정 오류 시 상태 유지·재시도·24시간 한계.
확인하지 않음: 실제 Netlify 환경변수 값·Scope, 운영/Preview URL 호출, 운영 로그, 실제 AssemblyAI·Claude·R2 호출. 함수 모듈 테스트는 DB 접근 전에 거절되는 경로만 실행하며, 통과 경로는 `processRecording` 테스트(`test-recordingProcessing.ts`)가 별도로 다룹니다.
