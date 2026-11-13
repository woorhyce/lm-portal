ALTER TABLE tools ADD COLUMN downloads TEXT;
UPDATE tools SET local_only=0, url=NULL, downloads='[{"label":"Trusty","url":"/local/dc_cluster_health_check_trusty.efp"},{"label":"Live Media","url":"/local/dc_cluster_health_check_livemedia.efp"}]', description='Installable DreamCatcher cluster health check (.efp). Pick the build for the server: Trusty or Live Media.' WHERE slug='health';
INSERT OR REPLACE INTO tools (slug,name,category,description,version,updated,icon,file_needed,local_only,sort) VALUES ('design-studio','LM Design Studio','Design','Live-Media design studio.','latest','2026-11-13','palette',0,0,105);
INSERT OR REPLACE INTO releases (slug, version, date, notes) VALUES ('design-studio','latest','2026-11-13','- Added to the Live-Media Tool Library.');
