-- Store profile values for a database that already had its store row when the email and
-- opening hours columns were added (the shared test site). The demo seed only runs on an empty
-- database, so without this the store page there would show no hours and no email. Only empty
-- values are filled, so anything the manager has already set is left alone. The hours match the
-- 11 AM to 10 PM window that checkout enforces (CHECKOUT_SETTINGS) until structured hours arrive.
UPDATE "StoreSettings"
SET "openingHours" = '{"monday":"11:00 AM – 10:00 PM","tuesday":"11:00 AM – 10:00 PM","wednesday":"11:00 AM – 10:00 PM","thursday":"11:00 AM – 10:00 PM","friday":"11:00 AM – 10:00 PM","saturday":"11:00 AM – 10:00 PM","sunday":"11:00 AM – 10:00 PM"}'::jsonb
WHERE "openingHours" = '{}'::jsonb;

UPDATE "StoreSettings"
SET "email" = 'hello@crustandco.example'
WHERE "email" = '';
