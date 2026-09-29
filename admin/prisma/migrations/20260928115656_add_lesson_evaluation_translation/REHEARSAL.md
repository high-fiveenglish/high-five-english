# 10월 1일 Migration Rehearsal Checklist — `add_lesson_evaluation_translation`

이 문서는 `20260928115656_add_lesson_evaluation_translation` migration을 10/1 Neon
초기화/리허설 때 안전하게 검증하기 위한 절차다. **이 문서 작성 시점에는 이 migration을
실제 DB에 적용하지 않았다** — 아래는 리허설 당일 그대로 따라 하면 되는 명령/확인
목록이다.

## 0. 사전 확인 (이미 이번 조사에서 확인 완료, 리허설 때 재확인만)

- `lesson_evaluations` 테이블 현재 컬럼: `id, classSessionId, content(varchar), createdAt, updatedAt`
  (Production Neon DB에서 read-only 쿼리로 확인 완료, 2026-09-28 기준)
- `lesson_evaluations` 현재 row 수: **0건** (2026-09-28 기준 — 리허설 당일 다시 확인할 것,
  그 사이 실제 평가서가 저장됐을 수 있음)
- migration 내용: 신규 컬럼 2개(`contentTranslated`, `contentTranslatedLang`, 둘 다 nullable)
  추가 + 기존 `content` 컬럼을 `VARCHAR(2000)` → `TEXT`로 확장. **컬럼 삭제나 데이터 변환은
  없음.**

## 1. Migration 적용 전 — 현재 상태 스냅샷

```bash
cd admin

# 현재 마이그레이션 적용 상태
npx prisma migrate status

# 실제 DB의 lesson_evaluations 테이블 구조 확인 (Prisma Studio 또는 직접 SQL)
npx prisma studio
# 또는
# SELECT column_name, data_type, is_nullable FROM information_schema.columns
# WHERE table_name = 'lesson_evaluations' ORDER BY ordinal_position;

# 기존 데이터 건수/샘플 백업 확인 (되돌릴 일이 생기면 비교 기준으로 쓴다)
# SELECT COUNT(*) FROM lesson_evaluations;
# SELECT id, "classSessionId", LEFT(content, 50) AS content_preview, "createdAt"
# FROM lesson_evaluations ORDER BY id LIMIT 20;
```

## 2. Migration 적용

```bash
cd admin
npx prisma migrate deploy
```

`migrate deploy`(운영 환경용 — `migrate dev`가 아님)를 쓴다. `migrate dev`는 스키마
드리프트 감지 시 대화형으로 리셋을 제안할 수 있어 운영 DB에는 위험하다.

## 3. Migration 적용 후 확인

```bash
# 마이그레이션이 정상 기록됐는지
npx prisma migrate status
# "Database schema is up to date!" 확인

# 신규 컬럼이 실제로 생겼는지
# SELECT column_name, data_type, is_nullable FROM information_schema.columns
# WHERE table_name = 'lesson_evaluations' ORDER BY ordinal_position;
# → contentTranslated(text, nullable), contentTranslatedLang(text, nullable) 확인
# → content가 text로 바뀌었는지 확인

# 기존 데이터가 전부 그대로 남아있는지 (건수/내용 1번 스냅샷과 비교)
# SELECT COUNT(*) FROM lesson_evaluations;
# SELECT id, "classSessionId", LEFT(content, 50) AS content_preview, "createdAt"
# FROM lesson_evaluations ORDER BY id LIMIT 20;
# → 1번에서 확인한 값과 완전히 동일해야 한다(신규 컬럼은 전부 NULL로 채워짐).
```

## 4. Application 배포 및 기능 확인

**중요 — 배포 순서**: 반드시 **1) migration 적용 → 2) migration 성공 확인 → 3) application
배포** 순서를 지킬 것. 이유는 아래 "배포 순서 위험 분석" 참고 — 코드가 먼저 배포되면
Daily Evaluation 관련 화면 전체가 깨진다(번역 기능만이 아니라 기존 평가서 조회/저장
전부).

```bash
cd admin
npx prisma generate   # migration 적용 후 클라이언트도 최신 스키마로 재생성
npm run build
# 배포
```

배포 후 확인:
- [ ] 관리자 `/evaluations` 목록 정상 로딩
- [ ] 관리자 `/evaluations/[id]` 상세 정상 로딩, 기존 평가서 내용 그대로 표시
- [ ] 강사 `/teacher/sessions/[id]` 평가서 작성 폼 정상 저장
- [ ] 학생 `/student/evaluations` 목록 정상 로딩
- [ ] 학생 `/student/evaluations/[id]` 상세 정상 로딩 — 번역 캐시가 없는 기존 평가서는
      토글 없이 영어 원문만 표시되는지 확인
- [ ] (ANTHROPIC_API_KEY가 그때 설정되어 있다면) 한국/중국/베트남/일본 거주지역 학생의
      새 평가서를 저장해보고 번역이 실제로 생성되는지, "English (원문)" 토글이 정상
      작동하는지 확인
- [ ] 기존 레벨테스트 관련 화면(`/level-tests`, `/student/level-tests/[id]`)에 regression이
      없는지 확인(이번 migration은 `LevelTest` 테이블을 전혀 건드리지 않음)

## Rollback이 필요한 경우

이 migration은 **컬럼 추가 + 타입 확장뿐**이라 롤백이 상대적으로 안전하다.

- **컬럼 자체를 되돌려야 하는 경우**(예: 설계를 바꾸기로 함): 새 하향 migration을
  작성해 `ALTER TABLE lesson_evaluations DROP COLUMN "contentTranslated", DROP COLUMN
  "contentTranslatedLang";`로 제거. `content`를 다시 `VARCHAR(2000)`으로 좁히는 것은
  **데이터 손실 위험**이 있으므로(2000자 넘는 값이 있으면 잘림) 권장하지 않음 — 필요하면
  먼저 `SELECT COUNT(*) FROM lesson_evaluations WHERE LENGTH(content) > 2000;`으로 초과
  건이 있는지 반드시 확인 후 결정.
- **애플리케이션 코드만 되돌려야 하는 경우**(컬럼은 남겨두고 이전 커밋으로 배포 롤백):
  안전하다 — 이전 코드는 새 컬럼을 아예 참조하지 않으므로 있어도 무해하다(Prisma는
  스키마에 없는 실제 DB 컬럼을 무시함).
- **가장 안전한 순서**: 문제가 생기면 먼저 application만 이전 버전으로 롤백하고(컬럼은
  그대로 둠), DB 롤백은 정말 필요할 때만 별도로 진행한다.

## 배포 순서 위험 분석 (참고)

migration 적용 전에 이번 코드를 먼저 배포하면, `evaluation: true`로 `LessonEvaluation`을
중첩 조회하는 화면(관리자 평가서 목록/상세, 학생 대시보드·평가서 목록·상세, 강사
스케줄·세션 상세 등 12곳 이상)이 전부 "column contentTranslated does not exist" 에러로
깨진다 — 번역 기능만 실패하는 게 아니라 Daily Evaluation 조회/저장 전체가 멈춘다. 자세한
내용은 이번 대화의 최종 코드 검토 보고서(§A/§2) 참고. **반드시 migration → 배포 순서를
지킬 것.**
