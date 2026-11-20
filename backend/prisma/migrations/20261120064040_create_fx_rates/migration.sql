-- CreateTable
CREATE TABLE "fx_rates" (
    "currency_code" CHAR(3) NOT NULL,
    "valid_from" DATE NOT NULL,
    "units_per_usd" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("currency_code","valid_from")
);
