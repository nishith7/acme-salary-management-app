-- CreateEnum
CREATE TYPE "salary_change_reason" AS ENUM ('HIRE', 'PROMOTION', 'MERIT', 'MARKET_ADJUSTMENT', 'CORRECTION');

-- CreateTable
CREATE TABLE "salary_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "annual_amount" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "reason" "salary_change_reason",
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
