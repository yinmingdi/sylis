-- CreateEnum
CREATE TYPE "ArticleDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('STORY', 'NEWS', 'ESSAY', 'CONVERSATION');

-- CreateEnum
CREATE TYPE "ArticleLength" AS ENUM ('SHORT', 'MEDIUM', 'LONG');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "difficulty" "ArticleDifficulty" NOT NULL,
    "theme" TEXT,
    "articleType" "ArticleType" NOT NULL,
    "length" "ArticleLength" NOT NULL,
    "usedWords" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);
