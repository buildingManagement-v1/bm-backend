-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "tenant_payment_requests" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "type" "PaymentType" NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "months_covered" JSONB,
    "notes" TEXT,
    "receipt_url" TEXT NOT NULL,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_payment_requests_building_id_idx" ON "tenant_payment_requests"("building_id");

-- CreateIndex
CREATE INDEX "tenant_payment_requests_tenant_id_idx" ON "tenant_payment_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_payment_requests_status_idx" ON "tenant_payment_requests"("status");

-- AddForeignKey
ALTER TABLE "tenant_payment_requests" ADD CONSTRAINT "tenant_payment_requests_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_requests" ADD CONSTRAINT "tenant_payment_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_requests" ADD CONSTRAINT "tenant_payment_requests_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_payment_requests" ADD CONSTRAINT "tenant_payment_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
