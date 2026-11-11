-- Nacho Cookbook: remember which Woolworths / Coles products you pick on the
-- shopping list, so the whole household sees the same prices.
-- Run once in the Supabase SQL Editor (after 003_recipe_photos.sql). Safe to run again.
--
-- The value is JSON text written by the app, e.g.
-- {"store":"coles","coles":{"id":"123","name":"Coles Plain Flour","price":2.4,"size":2000,"unit":"g"}}
-- The PowerSync sync streams use SELECT *, so nothing else needs changing.

alter table ingredients add column if not exists price_pick text;
