INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('core-builder','4.42','2026-11-16','- New mixed-format wiring for the 12-port SDI card on LM-CORE-HC: 3 UHD in (ports 1-3), 4 1080p in (ports 4-7), 2 out (ports 11-12)
- Drawing labels each input UHD or 1080p
- Marked awaiting verification until confirmed on hardware');
UPDATE tools SET version='4.42', updated='2026-11-16' WHERE slug='core-builder';
