ALTER TABLE categories ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases_json) AND json_type(aliases_json)='array');
