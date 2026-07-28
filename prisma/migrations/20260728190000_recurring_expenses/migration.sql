-- المصروفات الثابتة الشهرية: templates for rent/salaries/utilities, stored as
-- an array of { id, category, amountCents, dayOfMonth, startDate, note }.
-- Nullable with no default: NULL means "this farm has not set any up", which is
-- distinct from an explicit empty list, and neither posts anything.
ALTER TABLE "Settings" ADD COLUMN "recurringExpenses" JSONB;
