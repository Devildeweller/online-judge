-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('CPP', 'PYTHON', 'JAVA', 'JAVASCRIPT');

-- CreateEnum
CREATE TYPE "CheckerType" AS ENUM ('LINES', 'TOKENS', 'FLOAT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'COMPILING', 'RUNNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'INTERNAL_ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "bio" TEXT,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "inputFormat" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL,
    "constraints" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "tags" TEXT[],
    "timeLimitMs" INTEGER NOT NULL DEFAULT 1000,
    "memoryLimitMb" INTEGER NOT NULL DEFAULT 256,
    "checker" "CheckerType" NOT NULL DEFAULT 'LINES',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "authorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" SERIAL NOT NULL,
    "problemId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "penaltyMinutes" INTEGER NOT NULL DEFAULT 20,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestProblem" (
    "contestId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ContestProblem_pkey" PRIMARY KEY ("contestId","problemId")
);

-- CreateTable
CREATE TABLE "ContestRegistration" (
    "contestId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestRegistration_pkey" PRIMARY KEY ("contestId","userId")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "problemId" INTEGER NOT NULL,
    "contestId" INTEGER,
    "language" "Language" NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "Verdict",
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "passedTests" INTEGER NOT NULL DEFAULT 0,
    "totalTests" INTEGER NOT NULL DEFAULT 0,
    "failedTest" INTEGER,
    "compileOutput" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "judgedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionTestResult" (
    "id" SERIAL NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "memoryKb" INTEGER NOT NULL,

    CONSTRAINT "SubmissionTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_solvedCount_idx" ON "User"("solvedCount");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");

-- CreateIndex
CREATE INDEX "Problem_isPublic_difficulty_idx" ON "Problem"("isPublic", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_problemId_position_key" ON "TestCase"("problemId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_slug_key" ON "Contest"("slug");

-- CreateIndex
CREATE INDEX "Contest_startTime_idx" ON "Contest"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "ContestProblem_contestId_label_key" ON "ContestProblem"("contestId", "label");

-- CreateIndex
CREATE INDEX "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_problemId_verdict_idx" ON "Submission"("problemId", "verdict");

-- CreateIndex
CREATE INDEX "Submission_contestId_userId_idx" ON "Submission"("contestId", "userId");

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionTestResult_submissionId_position_key" ON "SubmissionTestResult"("submissionId", "position");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" ADD CONSTRAINT "ContestProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRegistration" ADD CONSTRAINT "ContestRegistration_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestRegistration" ADD CONSTRAINT "ContestRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionTestResult" ADD CONSTRAINT "SubmissionTestResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

