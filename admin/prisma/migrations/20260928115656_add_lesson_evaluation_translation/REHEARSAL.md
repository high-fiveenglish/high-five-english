# 10월 1일 Migration Rehearsal Checklist — Bilingual Evaluation Translation

이 문서는 3개 평가서(Level Test / Daily Evaluation / Monthly Evaluation)의 bilingual
번역 기능을 10/1 Neon 초기화/리허설 때 안전하게 적용하기 위한 절차다. **이 문서
작성 시점에는 아래 두 migration 중 어느 것도 실제 DB에 적용하지 않았다.**

**대상 migration 2개**:
- `20260928115656_add_lesson_evaluation_translation` — Daily Evaluation(`lesson_evaluations`)
- `20260929051417_add_monthly_evaluation_translation` — Monthly Evaluation(`monthly_evaluations`)

Level Test(`level_tests`)는 이 두 migration과 무관하다 — `resultContentTranslated`/
`resultContentTranslatedLang` 컬럼은 이번 작업 이전부터 이미 schema/DB에 존재했다.

---

## 0. 현재 상태 (이 문서 작성 시점 기준 — 리허설 당일 재확인 필수)

- **Production 배포된 commit**: `6d7ef79`("fix: preserve full evaluation content")
- **Local(미push) commit**: `84e9790`("feat: add bilingual evaluation translations") — 이 문서를 담고 있던 migration 2개, 번역 함수, 저장 action, 학생 UI가 전부 이 커밋에 포함되어 있다
- `84e9790`은 **아직 push되지 않았고**, 아래 두 migration 중 어느 것도 **아직 DB에 적용되지 않았다**

> ⚠️ **주의**: 위 commit hash(`6d7ef79`, `84e9790`)는 이 문서를 작성한 시점의 스냅샷일
> 뿐이다. 실제 10/1 리허설 당일에는 반드시 그날의 실제 `git log`/Production 배포
> 상태를 다시 확인해서 사용할 것 — 위 값을 "반드시 이 commit이어야 한다"는 고정값으로
> 취급하지 않는다. 그 사이 다른 커밋이 추가·배포됐을 수 있다.

### Daily / Monthly migration이 각각 어떤 변경을 하는지

**Daily(`20260928115656_add_lesson_evaluation_translation`)** — `lesson_evaluations` 테이블:
- `contentTranslated` 컬럼 신규 추가 (`TEXT`, nullable)
- `contentTranslatedLang` 컬럼 신규 추가 (`TEXT`, nullable)
- 기존 `content` 컬럼을 `VARCHAR(2000)` → `TEXT`로 확장(widening — 데이터 손실 없음)

**Monthly(`20260929051417_add_monthly_evaluation_translation`)** — `monthly_evaluations` 테이블:
- `contentTranslated` 컬럼 신규 추가 (`TEXT`, nullable)
- `contentTranslatedLang` 컬럼 신규 추가 (`TEXT`, nullable)
- 기존 `content` 컬럼(`VARCHAR(4000)`)은 **변경하지 않음** — Daily와 달리 타입 확장 없음

두 migration은 서로 다른 테이블을 건드리며 의존 관계가 없어 적용 순서와 무관하게 안전하다. `prisma migrate deploy`는 타임스탬프 순(Daily → Monthly)으로 두 migration을 자동 순차 적용한다.

### 사전 확인 (2026-09-28/29 기준 — 리허설 당일 재확인)

- `lesson_evaluations` 현재 컬럼: `id, classSessionId, content(varchar), createdAt, updatedAt`
- `lesson_evaluations` 현재 row 수: **0건**(2026-09-28 기준, read-only 쿼리로 확인)
- `monthly_evaluations`는 이 문서 작성 시점에 별도로 row 수를 재확인하지 않았음 — **리허설
  당일 아래 1단계에서 반드시 확인할 것**

---

## PHASE A — Pre-check

1. **Git 상태 확인**
   ```bash
   git status --short
   git log -3 --oneline
   ```
2. **Production commit 확인** — Netlify(또는 실제 배포 플랫폼) 대시보드에서 현재
   Published된 commit이 무엇인지 확인하고, 그 커밋에 적용하려는 migration 2개가
   포함되어 있는지 확인한다.
3. **Migration 파일 확인**
   ```bash
   ls admin/prisma/migrations/ | tail -5
   cat admin/prisma/migrations/20260928115656_add_lesson_evaluation_translation/migration.sql
   cat admin/prisma/migrations/20260929051417_add_monthly_evaluation_translation/migration.sql
   ```
4. **DB snapshot/status**
   ```bash
   cd admin
   npx prisma migrate status
   ```
5. **기존 row count / content 샘플 확인** (Daily + Monthly 둘 다)
   ```sql
   SELECT COUNT(*) FROM lesson_evaluations;
   SELECT id, "classSessionId", LEFT(content, 50) AS content_preview, "createdAt"
   FROM lesson_evaluations ORDER BY id LIMIT 20;

   SELECT COUNT(*) FROM monthly_evaluations;
   SELECT id, "enrollmentId", "cycleNumber", LEFT(content, 50) AS content_preview, "createdAt"
   FROM monthly_evaluations ORDER BY id LIMIT 20;
   ```
   현재 schema 상태와 pending migration 목록도 `npx prisma migrate status` 출력에서
   함께 확인한다.

---

## PHASE B — DB migration

6. **`prisma migrate deploy` 실행**
   ```bash
   cd admin
   npx prisma migrate deploy
   ```
   `migrate deploy`(운영 환경용 — `migrate dev`가 아님)를 쓴다. `migrate dev`는 스키마
   드리프트 감지 시 대화형으로 리셋을 제안할 수 있어 운영 DB에는 위험하다.
7. **migration 전체 성공 여부 확인** — 명령 출력에 두 migration(Daily, Monthly)이
   모두 "Applied"로 표시되는지 확인한다.
8. **실패하면 즉시 STOP** — 아래 "FAIL-STOP 규칙" 참고. 어느 한쪽이라도 실패하면
   Application deploy로 넘어가지 않는다.

---

## PHASE C — DB verification

9. **migration status 재확인**
   ```bash
   npx prisma migrate status
   # "Database schema is up to date!" 확인
   ```
10. **`lesson_evaluations` 신규 column 확인**
    ```sql
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'lesson_evaluations' ORDER BY ordinal_position;
    -- contentTranslated(text, nullable), contentTranslatedLang(text, nullable) 확인
    -- content가 text로 바뀌었는지 확인
    ```
11. **`monthly_evaluations` 신규 column 확인**
    ```sql
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'monthly_evaluations' ORDER BY ordinal_position;
    -- contentTranslated(text, nullable), contentTranslatedLang(text, nullable) 확인
    -- content는 varchar(4000) 그대로인지 확인(변경되지 않아야 정상)
    ```
12. **row count 확인** — PHASE A 5번 스냅샷과 완전히 동일한 건수인지 Daily/Monthly
    둘 다 확인.
13. **기존 content 무결성 확인** — PHASE A 5번에서 뽑은 `content_preview` 샘플과
    1:1로 동일한지 확인(신규 컬럼 2개는 전부 NULL로 채워져 있어야 정상, 기존
    `content` 값은 한 글자도 바뀌면 안 된다).

---

## PHASE D — Application preparation

14. **`prisma generate`**
    ```bash
    cd admin
    npx prisma generate
    ```
15. **TypeScript**
    ```bash
    npx tsc --noEmit -p .
    ```
16. **build**
    ```bash
    npm run build
    ```
17. **실패하면 STOP** — TypeScript/build 중 하나라도 실패하면 Production deploy로
    넘어가지 않는다.

---

## PHASE E — Application deploy

18. Production deploy 실행(실제 배포 플랫폼 절차대로).
19. **Admin / Teacher 평가 작성 테스트** — Level Test / Daily Evaluation / Monthly
    Evaluation 3개 전부, 관리자 화면과 강사 화면 양쪽에서 저장이 정상 동작하는지
    확인.
20. **Student 화면 테스트** — 아래 PHASE F로 이어짐.

---

## PHASE F — Bilingual E2E

21. **Level Test** 학생 화면(`/student/level-tests/[id]`) 확인
22. **Daily Evaluation** 학생 화면(`/student/evaluations/[id]`) 확인
23. **Monthly Evaluation** 학생 화면(`/student/monthly-evaluations/[id]`) 확인
24. **ko / zh / vi** 거주지역 학생 각각에서 번역본이 기본 표시되는지 확인
25. **en(영어권) fallback** — 토글 자체가 나타나지 않고 영어 원문만 표시되는지 확인
26. **"English Original" 토글** — 번역본 → 영어 → 다시 번역본으로 정상 전환되는지
    확인
27. **translation failure fallback** — 아래 "Translation Failure Fallback 체크"
    참고

각 평가서별 세부 확인 항목:

| | 번역 캐시 있음 | English Original | fallback(캐시 없음/실패) |
|---|---|---|---|
| **Level Test** | 국가 언어(ko/zh/vi) 기본 표시 | 클릭 시 영어 원문 표시 | 영어 원문만 표시, 토글 없음 |
| **Daily Evaluation** | 동일 | 동일 | 동일 |
| **Monthly Evaluation** | 동일 | 동일 | 동일 |

**English locale(학생 거주지역이 AUSTRALIA/USA_OTHER)**: 3개 평가서 전부 불필요한
translation toggle이 나타나지 않고 영어 원문만 표시되는지 확인한다.

---

## FAIL-STOP 규칙

다음 중 **하나라도** 실패하면 Application deploy를 진행하지 않고 즉시 중단한다:

- migration deploy 실패(PHASE B 6-7단계)
- migration status 불일치("up to date"가 아님)
- 신규 column 미존재(`lesson_evaluations`/`monthly_evaluations` 둘 중 하나라도)
- row count 변화(PHASE A 스냅샷과 다름)
- 기존 content 손실 의심(샘플 비교 시 값이 달라짐)
- `prisma generate` 실패
- `tsc`/`build` 실패

> **Migration이 완전히 성공하고 schema 검증이 완료되기 전에는 application을
> Production에 배포하지 않는다.**

이유: Monthly Evaluation이 코드상 여러 곳(관리자 목록/상세/삭제, 강사 재배정
로직, 학생 목록/상세, 강사 목록/상세/저장, 관리자·강사 대시보드 — 직접 조회
지점 11곳 확인됨)에서 조회되고 있고, Daily Evaluation도 12곳 이상에서 조회된다.
Prisma Client는 `schema.prisma`(이미 새 컬럼을 포함한 버전)를 기준으로 쿼리를
생성하므로, **신규 컬럼을 조회하는 코드 경로가 존재하는 한 실제 DB에 그 컬럼이
없는 상태(schema mismatch)에서는 해당 경로에서 실패할 수 있다.** 정확히 몇 곳이
실패하는지는 각 화면의 `select`/`include` 방식에 따라 다르므로, "11곳/12곳
전부에서 반드시 에러가 난다"고 단정하지는 않는다 — 다만 이 경로들이 전부
migration 완료 이전에는 잠재적 위험 구간이라는 뜻이다.

---

## Translation Failure Fallback 체크

번역 API가 실패하거나(네트워크 오류 등) `ANTHROPIC_API_KEY`가 미설정인 경우,
**Daily / Monthly 둘 다** 다음이 성립해야 한다(코드 레벨로는 이미 확인됨 —
`getClient()`가 키 없으면 `null`을 반환하고, 저장 action은 그 경우 `contentTranslated`를
그냥 `null`로 두고 원문 저장을 계속 진행한다):

- [ ] 평가 저장 자체는 **실패하지 않아야 함**(번역은 부가 기능, 저장의 필수 조건이 아님)
- [ ] 영어 원문 `content`는 정상 저장됨
- [ ] `contentTranslated`/`contentTranslatedLang`은 `null`일 수 있음(정상)
- [ ] 학생 화면에서는 영어 원문으로 fallback 표시(토글 없이)
- [ ] 번역 실패가 **평가 작성 기능 전체 장애로 이어지지 않는지** 확인(강사가
      평가서를 못 쓰게 되는 일이 없어야 함)

---

## Migration 적용 전/후 체크리스트 요약

**적용 전**:
- [ ] migration status(pending migration 목록 포함)
- [ ] `lesson_evaluations`/`monthly_evaluations` row count
- [ ] 기존 `content` 샘플 확인(둘 다)
- [ ] schema 상태(`prisma migrate status`)

**적용 후**:
- [ ] `lesson_evaluations` 신규 column 2개 존재
- [ ] `monthly_evaluations` 신규 column 2개 존재
- [ ] 기존 row count 동일(둘 다)
- [ ] 기존 content 손실 없음(둘 다)
- [ ] migration status 정상("up to date")

---

## Rollback이 필요한 경우

두 migration 모두 **컬럼 추가(+ Daily만 타입 확장)뿐**이라 롤백이 상대적으로 안전하다.

- **컬럼 자체를 되돌려야 하는 경우**(예: 설계를 바꾸기로 함): 새 하향 migration을
  작성해 `DROP COLUMN "contentTranslated", DROP COLUMN "contentTranslatedLang"`로
  제거(Daily/Monthly 각각). Daily의 `content`를 다시 `VARCHAR(2000)`으로 좁히는 것은
  **데이터 손실 위험**이 있으므로(2000자 넘는 값이 있으면 잘림) 권장하지 않음 —
  필요하면 먼저 `SELECT COUNT(*) FROM lesson_evaluations WHERE LENGTH(content) > 2000;`으로
  초과 건이 있는지 반드시 확인 후 결정. Monthly는 `content` 타입을 건드리지 않았으므로
  이 문제가 없다.
- **애플리케이션 코드만 되돌려야 하는 경우**(컬럼은 남겨두고 이전 커밋으로 배포
  롤백): 안전하다 — 이전 코드는 새 컬럼을 아예 참조하지 않으므로 있어도 무해하다
  (Prisma는 스키마에 없는 실제 DB 컬럼을 무시함).
- **가장 안전한 순서**: 문제가 생기면 먼저 application만 이전 버전으로 롤백하고
  (컬럼은 그대로 둠), DB 롤백은 정말 필요할 때만 별도로 진행한다.
