-- CreateTable
CREATE TABLE "FoodImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "foodName" TEXT NOT NULL,
    "originalUrl" TEXT,
    "localPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodImage_foodName_key" ON "FoodImage"("foodName");
