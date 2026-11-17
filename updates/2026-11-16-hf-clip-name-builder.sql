INSERT OR REPLACE INTO tools (slug,name,category,description,version,updated,icon,file_needed,local_only,sort)
VALUES ('hf-clip-name-builder','HF Clip Name Builder','Production','Build Highlight Factory clip name keys with roster number swaps and package them as an .efp for DreamCatcher.','1.0','2026-11-16','film',0,0,110);
INSERT OR REPLACE INTO releases (slug,version,date,notes) VALUES ('hf-clip-name-builder','1.0','2026-11-16','- First release in the Tool Library');
UPDATE tools SET enabled=0 WHERE slug='highlights';
