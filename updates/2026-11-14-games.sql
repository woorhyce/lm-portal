UPDATE tools SET category='Training', version='2.0', updated='2026-11-14',
  description='Four DreamCatcher training games: Replay Op, Replay Academy, Input Breaker and Million Frame Replay. Best scores follow you across computers.'
  WHERE slug='games';
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('games','2.0','2026-11-14','- LM Games is now a menu of four games
- Added Replay Op (RCP-10 + VUE simulator with live faults)
- Added Input Breaker
- Added Million Frame Replay
- Team top-three leaderboard on every game card');
