-- CreateTable
CREATE TABLE "salary_bands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "min_amount" DECIMAL(14,2) NOT NULL,
    "max_amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "salary_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_bands_country_id_level_key" ON "salary_bands"("country_id", "level");

-- AddForeignKey
ALTER TABLE "salary_bands" ADD CONSTRAINT "salary_bands_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
