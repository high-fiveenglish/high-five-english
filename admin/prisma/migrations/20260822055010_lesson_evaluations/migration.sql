-- CreateTable
CREATE TABLE "lesson_evaluations" (
    "id" SERIAL NOT NULL,
    "classSessionId" INTEGER NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_evaluations_classSessionId_key" ON "lesson_evaluations"("classSessionId");

-- AddForeignKey
ALTER TABLE "lesson_evaluations" ADD CONSTRAINT "lesson_evaluations_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
