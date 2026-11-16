UPDATE tools SET version='2.1', updated='2026-11-15',
  description='Five DreamCatcher games: Replay Op, Replay Academy, Input Breaker, Million Frame Replay and Venues On Call. Best scores follow you across computers.'
  WHERE slug='games';
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('games','2.1','2026-11-15','- Added Venues On Call, a week on call with the Venues team
- Replay Op: two outputs, VUE layout, real shortcuts, settings, status and sound');
