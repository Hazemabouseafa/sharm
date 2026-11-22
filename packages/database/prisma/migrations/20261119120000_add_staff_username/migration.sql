-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_username_key" ON "StaffUser"("username");
