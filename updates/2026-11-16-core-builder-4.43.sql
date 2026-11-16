INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('core-builder','4.43','2026-11-16','- New mixed-format 6x2 for the 12-port SDI card on LM-CORE-HC: 3 UHD in (ports 1-3), 3 1080p in (ports 4-6), 2 out (ports 11-12)
- Marked awaiting verification until confirmed on hardware');
UPDATE tools SET version='4.43', updated='2026-11-16' WHERE slug='core-builder';
