-- Fix trips table: remove duplicate date column
ALTER TABLE public.trips DROP COLUMN IF EXISTS date_value;
