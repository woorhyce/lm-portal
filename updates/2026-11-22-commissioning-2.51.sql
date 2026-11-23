INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('commissioning','2.51','2026-11-22','- 2110: a different Matrox card (25G or 50G) can be set per server in Project Details
- Server Commissioning only configures each server''s own Matrox ports
- Matrox pages switch to the picked server''s card; Package & Deploy builds each server with its own card');
UPDATE tools SET version='2.51', updated='2026-11-22' WHERE slug='commissioning';
