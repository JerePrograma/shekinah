ALTER TABLE checkout_intents
  ADD COLUMN cart_fingerprint TEXT;

UPDATE checkout_intents
SET cart_fingerprint = (
  SELECT orders.cart_fingerprint
  FROM orders
  WHERE orders.checkout_idempotency_key = checkout_intents.checkout_idempotency_key
)
WHERE cart_fingerprint IS NULL
  AND EXISTS (
    SELECT 1
    FROM orders
    WHERE orders.checkout_idempotency_key = checkout_intents.checkout_idempotency_key
  );
