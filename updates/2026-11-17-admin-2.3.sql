INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('admin','2.3','2026-11-17','- My Trips: finished trips grouped by year, newest first; the Done section can be minimized
- Weekly Summary: drag bullets to reorder them, within a week or between Last week and This week
- Travel Dates: export just the month you are viewing
- Tool Library link on the LIVE-MEDIA logo');
UPDATE tools SET version='2.3', updated='2026-11-17' WHERE slug='admin';
