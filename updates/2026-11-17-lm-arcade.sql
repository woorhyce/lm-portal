UPDATE tools SET name='LM Arcade', url='https://arcade.evertz.app/', updated='2026-11-17' WHERE slug='games';
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('games','latest','2026-11-17','- LM Games is now LM Arcade, at arcade.evertz.app (the old address still works)');
