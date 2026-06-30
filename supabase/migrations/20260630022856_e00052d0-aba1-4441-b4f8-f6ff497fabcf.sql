
-- Extend transfer order statuses
ALTER TYPE public.transfer_order_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'confirmed';
ALTER TYPE public.transfer_order_status ADD VALUE IF NOT EXISTS 'rejected' AFTER 'cancelled';
