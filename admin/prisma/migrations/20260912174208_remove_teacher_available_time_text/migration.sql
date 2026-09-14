-- AlterTable
ALTER TABLE "teachers" DROP COLUMN "availableTimeText";

-- 근무 가능 시간 체크박스가 시간(hour) 단위에서 30분(half-hour) 단위로 바뀌면서
-- availableHours 배열의 의미가 "시(0~23)"에서 "자정 기준 분(minute-of-day)"으로
-- 바뀌었다. 기존에 저장된 시간 단위 값은 새 의미로는 무의미하므로 초기화한다.
UPDATE "teachers" SET "availableHours" = '{}';
