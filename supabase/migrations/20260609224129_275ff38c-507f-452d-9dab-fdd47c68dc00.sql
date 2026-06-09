ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS vat_number text;

UPDATE customers SET vat_number = pin_number WHERE vat_number IS NULL AND pin_number IS NOT NULL;
UPDATE suppliers SET vat_number = pin_number WHERE vat_number IS NULL AND pin_number IS NOT NULL;

ALTER TABLE customers DROP COLUMN IF EXISTS pin_number;
ALTER TABLE suppliers DROP COLUMN IF EXISTS pin_number;