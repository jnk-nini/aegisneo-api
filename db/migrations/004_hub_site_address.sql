-- The website now lives on its own address (aegisneo-hub.vercel.app), so the main
-- site's launch address is relative to the hub page instead of starting with /frontend/.
-- Run once as the owner role. Safe to run twice.
update public.sites set url = 'explorer' where slug = 'aegisneo';
