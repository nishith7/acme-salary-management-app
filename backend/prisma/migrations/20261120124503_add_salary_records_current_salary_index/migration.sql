-- CreateIndex
CREATE INDEX "salary_records_employee_id_effective_from_created_at_idx" ON "salary_records"("employee_id", "effective_from" DESC, "created_at" DESC);
