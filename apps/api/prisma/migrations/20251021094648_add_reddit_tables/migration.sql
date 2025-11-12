-- CreateTable
CREATE TABLE "UserSubreddit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subredditName" TEXT NOT NULL,
    "displayName" TEXT,
    "category" TEXT,
    "difficulty" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSubreddit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRedditHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redditId" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "wordsLearned" INTEGER NOT NULL DEFAULT 0,
    "readDuration" INTEGER,
    "difficulty" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRedditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRedditSaved" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redditId" TEXT NOT NULL,
    "subreddit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "notes" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRedditSaved_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRedditStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPostsRead" INTEGER NOT NULL DEFAULT 0,
    "totalWordsLearned" INTEGER NOT NULL DEFAULT 0,
    "totalReadTime" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRedditStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSubreddit_userId_idx" ON "UserSubreddit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubreddit_userId_subredditName_key" ON "UserSubreddit"("userId", "subredditName");

-- CreateIndex
CREATE INDEX "UserRedditHistory_userId_readAt_idx" ON "UserRedditHistory"("userId", "readAt");

-- CreateIndex
CREATE INDEX "UserRedditHistory_userId_subreddit_idx" ON "UserRedditHistory"("userId", "subreddit");

-- CreateIndex
CREATE UNIQUE INDEX "UserRedditHistory_userId_redditId_key" ON "UserRedditHistory"("userId", "redditId");

-- CreateIndex
CREATE INDEX "UserRedditSaved_userId_savedAt_idx" ON "UserRedditSaved"("userId", "savedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserRedditSaved_userId_redditId_key" ON "UserRedditSaved"("userId", "redditId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRedditStats_userId_key" ON "UserRedditStats"("userId");
