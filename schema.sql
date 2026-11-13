CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  role       TEXT NOT NULL DEFAULT 'user',
  last_seen  TEXT
);
CREATE TABLE IF NOT EXISTS tools (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT,
  version      TEXT DEFAULT 'latest',
  updated      TEXT,
  icon         TEXT DEFAULT 'box',
  file_needed  INTEGER DEFAULT 0,
  local_only   INTEGER DEFAULT 0,
  sort         INTEGER DEFAULT 100,
  enabled      INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tool_data (
  tool     TEXT NOT NULL,
  email    TEXT NOT NULL,
  key      TEXT NOT NULL,
  value    TEXT,
  updated  TEXT,
  PRIMARY KEY (tool, email, key)
);
INSERT OR REPLACE INTO tools (slug,name,category,description,version,updated,icon,file_needed,local_only,sort) VALUES
 ('admin','LM Admin Tools','Admin','Per diem, RMA, travel requests, trip reports, vacation, travel dates and weekly summary builders.','2.2','2026-10-16','briefcase',0,0,10),
 ('commissioning','LM Commissioning','Commissioning','Project-based commissioning: server, Matrox and I/O setup, Operational Settings, and Package & Deploy for per-server .efp files.','latest',NULL,'wrench',1,0,20),
 ('health','LM Health Report','Monitoring','DreamCatcher cluster health checks and report.','latest',NULL,'heart',0,1,30),
 ('monitoring','LM Monitoring','Monitoring','Live, read-only 2110 view of DreamCatcher Matrox cards from the NMOS API. IO map, Red/Blue lanes, SDP compare across servers.','1.0.80','2026-11-10','pulse',0,1,40),
 ('core-builder','LM Core Builder','Documentation','Draws rear and front plates for an LM-CORE build: model, input card, SDI I/O config and front PCIe slot. Exports PNG.','0.1','2026-10-30','grid',1,0,50),
 ('games','LM Games','Operations','Game and event tracking.','latest',NULL,'flag',0,0,60),
 ('mediabank','Media Bank Integration','Integrations','MediaBank and DreamCatcher integration tools.','latest',NULL,'link',0,0,70),
 ('roster','VueWeb Roster Management','Integrations','Build and manage vueWeb rosters.','latest',NULL,'users',0,0,80),
 ('scheduler','Scheduler Builder','Operations','Build DreamCatcher schedules.','latest',NULL,'calendar',0,0,90),
 ('highlights','Highlight Factory Tools','Production','Highlight Factory setup and helpers.','latest',NULL,'film',0,0,100);
CREATE TABLE IF NOT EXISTS releases (
  slug     TEXT NOT NULL,
  version  TEXT NOT NULL,
  date     TEXT NOT NULL,
  notes    TEXT NOT NULL,
  PRIMARY KEY (slug, version)
);
INSERT OR REPLACE INTO releases (slug, version, date, notes)
SELECT slug, version, COALESCE(updated, date('now')), '- Added to the Live-Media Tool Library.' FROM tools;
