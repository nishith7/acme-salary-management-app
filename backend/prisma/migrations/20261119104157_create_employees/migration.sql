-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('ACTIVE', 'TERMINATED');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "gender" "gender" NOT NULL,
    "job_title" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "department_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "joining_date" DATE NOT NULL,
    "status" "employee_status" NOT NULL DEFAULT 'ACTIVE',
    "terminated_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
