-- Reviewed pg17.11-icu67.1-vi-db-authority-v1: canonical-equivalent names
-- compare equal; UUID ascending breaks every tie. No employee/cell rewrite.
CREATE COLLATION "mkw_read_vi_equivalent" (provider = icu, locale = 'vi', deterministic = false);
