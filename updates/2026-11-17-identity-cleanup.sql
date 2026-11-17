DELETE FROM tool_data WHERE email NOT LIKE '%@%.%';
DELETE FROM prefs WHERE email NOT LIKE '%@%.%';
DELETE FROM users WHERE email NOT LIKE '%@%.%';
