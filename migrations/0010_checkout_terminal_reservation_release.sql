PRAGMA foreign_keys = ON;

-- Los estados terminales de Checkout Pro no deben retener unidades.
-- 0009 permite acortar esta ventana únicamente para failed/rejected/cancelled.
UPDATE orders
SET stock_reservation_expires_at = updated_at
WHERE channel = 'checkout_pro'
  AND stock_consumed_at IS NULL
  AND status IN ('rejected', 'cancelled')
  AND stock_reservation_expires_at IS NOT NULL
  AND unixepoch(stock_reservation_expires_at) > unixepoch(updated_at);

CREATE TRIGGER IF NOT EXISTS checkout_orders_release_terminal_reservation
AFTER UPDATE OF status ON orders
WHEN OLD.channel = 'checkout_pro'
  AND NEW.channel = 'checkout_pro'
  AND OLD.status IS NOT NEW.status
  AND NEW.status IN ('rejected', 'cancelled')
  AND NEW.stock_consumed_at IS NULL
  AND NEW.stock_reservation_expires_at IS NOT NULL
  AND unixepoch(NEW.stock_reservation_expires_at) > unixepoch(NEW.updated_at)
BEGIN
  UPDATE orders
  SET stock_reservation_expires_at = NEW.updated_at
  WHERE id = NEW.id;
END;
