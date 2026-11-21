-- AlterTable
ALTER TABLE "salary_records" ADD COLUMN     "import_id" UUID;

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_name" TEXT NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_count" INTEGER NOT NULL,
    "applied_count" INTEGER NOT NULL,
    "unchanged_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
