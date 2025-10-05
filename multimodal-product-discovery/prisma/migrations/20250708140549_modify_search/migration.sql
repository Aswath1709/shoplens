/*
  Warnings:

  - The primary key for the `Search` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `description` on the `Search` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Search` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `Search` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Search" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerId" TEXT,
    "productId" TEXT,
    "shop" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Search" ("id") SELECT "id" FROM "Search";
DROP TABLE "Search";
ALTER TABLE "new_Search" RENAME TO "Search";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
