ALTER TABLE categories ADD COLUMN spending_label TEXT CHECK(spending_label IS NULL OR spending_label IN ('green','white','yellow','red'));
