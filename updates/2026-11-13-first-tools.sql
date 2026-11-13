UPDATE tools SET version='4.41', updated='2026-11-13' WHERE slug='core-builder';
UPDATE tools SET version='2.50', updated='2026-11-13' WHERE slug='commissioning';
UPDATE tools SET updated='2026-11-13', description='Pick a sport, paste each team''s roster and list play tags. Generates home roster, away roster and play-tags CSVs for vueWeb.' WHERE slug='roster';
UPDATE tools SET updated='2026-11-13', description='Build a school or sport schedule list for DreamCatcher.' WHERE slug='scheduler';
UPDATE tools SET updated='2026-11-13', file_needed=0, description='Pick a school and a local username, get back a ready-to-install MediaBank integration .efp package.' WHERE slug='mediabank';
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES
('core-builder','4.41','2026-11-13','- Moved to the Live-Media Tool Library. Saved builds now sync across computers.'),
('commissioning','2.50','2026-11-13','- Moved to the Live-Media Tool Library. Projects now sync across computers.'),
('roster','latest','2026-11-13','- Moved to the Live-Media Tool Library.'),
('scheduler','latest','2026-11-13','- Moved to the Live-Media Tool Library.'),
('mediabank','latest','2026-11-13','- Moved to the Live-Media Tool Library.');
DELETE FROM releases WHERE slug IN ('core-builder','commissioning') AND version IN ('0.1','latest');
