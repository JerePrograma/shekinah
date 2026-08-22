PRAGMA foreign_keys = ON;

ALTER TABLE orders
  ADD COLUMN stock_reserved_at TEXT;

ALTER TABLE orders
  ADD COLUMN stock_reservation_expires_at TEXT;

ALTER TABLE orders
  ADD COLUMN stock_consumed_at TEXT;

ALTER TABLE orders
  ADD COLUMN whatsapp_fulfillment_fingerprint TEXT;

ALTER TABLE order_items
  ADD COLUMN stock_controlled INTEGER NOT NULL DEFAULT 0
  CHECK (stock_controlled IN (0, 1));

CREATE INDEX idx_orders_checkout_stock_reservation
  ON orders(channel, stock_consumed_at, stock_reservation_expires_at, status);

DROP TRIGGER whatsapp_order_items_reserve_stock;
DROP TRIGGER catalog_mutations_insert_reservation_guard;
DROP TRIGGER catalog_mutations_update_reservation_guard;
DROP TRIGGER whatsapp_orders_approve_consistency;

CREATE TRIGGER commerce_order_items_reserve_stock
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND (
      (channel = 'whatsapp' AND status = 'pending')
      OR channel = 'checkout_pro'
    )
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM catalog_product_mutations
      WHERE product_id = NEW.product_id
        AND deleted = 1
    )
    THEN RAISE(ABORT, 'STOCK_PRODUCT_DELETED')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM catalog_product_mutations
      WHERE product_id = NEW.product_id
        AND deleted = 0
        AND json_extract(payload_json, '$.availability') = 'unavailable'
    )
    THEN RAISE(ABORT, 'STOCK_PRODUCT_UNAVAILABLE')
  END;

  SELECT CASE
    WHEN NEW.stock_controlled <> CASE
      WHEN EXISTS (
        SELECT 1
        FROM catalog_product_mutations
        WHERE product_id = NEW.product_id
          AND deleted = 0
          AND json_type(payload_json, '$.stockQuantity') = 'integer'
      ) THEN 1
      ELSE 0
    END
    THEN RAISE(ABORT, 'STOCK_CONTROL_SNAPSHOT_INCONSISTENT')
  END;

  SELECT CASE
    WHEN NEW.stock_controlled = 1
      AND EXISTS (
        SELECT 1
        FROM orders
        WHERE id = NEW.order_id
          AND channel = 'checkout_pro'
          AND (
            stock_reserved_at IS NULL
            OR stock_reservation_expires_at IS NULL
            OR unixepoch(stock_reserved_at) IS NULL
            OR unixepoch(stock_reservation_expires_at) IS NULL
            OR unixepoch(stock_reservation_expires_at) <= unixepoch(stock_reserved_at)
          )
      )
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_WINDOW_REQUIRED')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM catalog_product_mutations AS mutation
      WHERE mutation.product_id = NEW.product_id
        AND mutation.deleted = 0
        AND json_type(mutation.payload_json, '$.stockQuantity') = 'integer'
        AND json_extract(mutation.payload_json, '$.stockQuantity') < (
          COALESCE((
            SELECT SUM(items.quantity)
            FROM order_items AS items
            INNER JOIN orders AS reserved_orders ON reserved_orders.id = items.order_id
            WHERE items.product_id = NEW.product_id
              AND (
                (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
                OR (
                  reserved_orders.channel = 'checkout_pro'
                  AND reserved_orders.stock_reserved_at IS NOT NULL
                  AND reserved_orders.stock_reservation_expires_at IS NOT NULL
                  AND reserved_orders.stock_consumed_at IS NULL
                  AND reserved_orders.status NOT IN ('approved', 'refunded')
                  AND (
                    unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                    OR EXISTS (
                      SELECT 1
                      FROM payments AS pending_payments
                      WHERE pending_payments.order_id = reserved_orders.id
                        AND pending_payments.mapped_status = 'pending'
                    )
                  )
                )
              )
          ), 0) + NEW.quantity
        )
    )
    THEN RAISE(ABORT, 'STOCK_RESERVATION_INSUFFICIENT')
  END;
END;

CREATE TRIGGER checkout_order_items_initial_only
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND channel = 'checkout_pro'
    AND status <> 'preference_pending'
)
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_ORDER_ITEMS_NOT_INITIAL');
END;

CREATE TRIGGER checkout_order_items_update_immutable
BEFORE UPDATE ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = OLD.order_id
    AND channel = 'checkout_pro'
    AND stock_reserved_at IS NOT NULL
) OR EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND channel = 'checkout_pro'
    AND stock_reserved_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_ORDER_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER checkout_order_items_delete_immutable
BEFORE DELETE ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = OLD.order_id
    AND channel = 'checkout_pro'
    AND stock_reserved_at IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_ORDER_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER catalog_mutations_insert_reservation_guard
BEFORE INSERT ON catalog_product_mutations
WHEN NEW.deleted = 0
  AND json_type(NEW.payload_json, '$.stockQuantity') = 'integer'
  AND json_extract(NEW.payload_json, '$.stockQuantity') < COALESCE((
    SELECT SUM(items.quantity)
    FROM order_items AS items
    INNER JOIN orders AS reserved_orders ON reserved_orders.id = items.order_id
    WHERE items.product_id = NEW.product_id
      AND (
        (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
        OR (
          reserved_orders.channel = 'checkout_pro'
          AND reserved_orders.stock_reserved_at IS NOT NULL
          AND reserved_orders.stock_reservation_expires_at IS NOT NULL
          AND reserved_orders.stock_consumed_at IS NULL
          AND reserved_orders.status NOT IN ('approved', 'refunded')
          AND (
            unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
            OR EXISTS (
              SELECT 1
              FROM payments AS pending_payments
              WHERE pending_payments.order_id = reserved_orders.id
                AND pending_payments.mapped_status = 'pending'
            )
          )
        )
      )
  ), 0)
BEGIN
  SELECT RAISE(ABORT, 'STOCK_BELOW_RESERVATIONS');
END;

CREATE TRIGGER catalog_mutations_update_reservation_guard
BEFORE UPDATE ON catalog_product_mutations
BEGIN
  SELECT CASE
    WHEN OLD.deleted = 0
      AND json_type(OLD.payload_json, '$.stockQuantity') = 'integer'
      AND EXISTS (
        SELECT 1
        FROM order_items AS items
        INNER JOIN orders AS reserved_orders ON reserved_orders.id = items.order_id
        WHERE items.product_id = OLD.product_id
          AND (
            (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
            OR (
              reserved_orders.channel = 'checkout_pro'
              AND reserved_orders.stock_reserved_at IS NOT NULL
              AND reserved_orders.stock_reservation_expires_at IS NOT NULL
              AND reserved_orders.stock_consumed_at IS NULL
              AND reserved_orders.status NOT IN ('approved', 'refunded')
              AND (
                unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                OR EXISTS (
                  SELECT 1
                  FROM payments AS pending_payments
                  WHERE pending_payments.order_id = reserved_orders.id
                    AND pending_payments.mapped_status = 'pending'
                )
              )
            )
          )
      )
      AND (
        NEW.deleted = 1
        OR COALESCE(json_type(NEW.payload_json, '$.stockQuantity'), '') <> 'integer'
      )
    THEN RAISE(ABORT, 'STOCK_CONTROL_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.deleted = 0
      AND json_type(NEW.payload_json, '$.stockQuantity') = 'integer'
      AND json_extract(NEW.payload_json, '$.stockQuantity') < COALESCE((
        SELECT SUM(items.quantity)
        FROM order_items AS items
        INNER JOIN orders AS reserved_orders ON reserved_orders.id = items.order_id
        WHERE items.product_id = NEW.product_id
          AND (
            (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
            OR (
              reserved_orders.channel = 'checkout_pro'
              AND reserved_orders.stock_reserved_at IS NOT NULL
              AND reserved_orders.stock_reservation_expires_at IS NOT NULL
              AND reserved_orders.stock_consumed_at IS NULL
              AND reserved_orders.status NOT IN ('approved', 'refunded')
              AND (
                unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                OR EXISTS (
                  SELECT 1
                  FROM payments AS pending_payments
                  WHERE pending_payments.order_id = reserved_orders.id
                    AND pending_payments.mapped_status = 'pending'
                )
              )
            )
          )
      ), 0)
    THEN RAISE(ABORT, 'STOCK_BELOW_RESERVATIONS')
  END;
END;

CREATE TRIGGER whatsapp_orders_approve_consistency
BEFORE UPDATE OF status ON orders
WHEN OLD.channel = 'whatsapp'
  AND OLD.status = 'pending'
  AND NEW.status = 'approved'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM order_items WHERE order_id = OLD.id
    )
      OR NEW.item_count <> COALESCE((
        SELECT SUM(quantity) FROM order_items WHERE order_id = OLD.id
      ), 0)
    THEN RAISE(ABORT, 'WHATSAPP_RESERVATION_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      INNER JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND mutation.deleted = 1
    )
    THEN RAISE(ABORT, 'WHATSAPP_RESERVATION_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      INNER JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND mutation.deleted = 0
        AND json_type(mutation.payload_json, '$.stockQuantity') = 'integer'
        AND json_extract(mutation.payload_json, '$.stockQuantity') < COALESCE((
          SELECT SUM(reserved_items.quantity)
          FROM order_items AS reserved_items
          INNER JOIN orders AS reserved_orders ON reserved_orders.id = reserved_items.order_id
          WHERE reserved_items.product_id = target_items.product_id
            AND (
              (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
              OR (
                reserved_orders.channel = 'checkout_pro'
                AND reserved_orders.stock_reserved_at IS NOT NULL
                AND reserved_orders.stock_reservation_expires_at IS NOT NULL
                AND reserved_orders.stock_consumed_at IS NULL
                AND reserved_orders.status NOT IN ('approved', 'refunded')
                AND (
                  unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                  OR EXISTS (
                    SELECT 1
                    FROM payments AS pending_payments
                    WHERE pending_payments.order_id = reserved_orders.id
                      AND pending_payments.mapped_status = 'pending'
                  )
                )
              )
            )
        ), 0)
    )
    THEN RAISE(ABORT, 'WHATSAPP_RESERVATION_INCONSISTENT')
  END;
END;

CREATE TRIGGER checkout_orders_consume_stock_consistency
BEFORE UPDATE OF status ON orders
WHEN OLD.channel = 'checkout_pro'
  AND NEW.status IN ('approved', 'refunded')
  AND OLD.stock_reserved_at IS NOT NULL
  AND OLD.stock_consumed_at IS NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM order_items WHERE order_id = OLD.id
    )
      OR NEW.item_count <> COALESCE((
        SELECT SUM(quantity) FROM order_items WHERE order_id = OLD.id
      ), 0)
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_RESERVATION_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      LEFT JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND target_items.stock_controlled = 1
        AND (
          mutation.product_id IS NULL
          OR mutation.deleted = 1
          OR COALESCE(json_type(mutation.payload_json, '$.stockQuantity'), '') <> 'integer'
        )
    )
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_CONTROL_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      INNER JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND mutation.deleted = 0
        AND json_type(mutation.payload_json, '$.stockQuantity') = 'integer'
        AND json_extract(mutation.payload_json, '$.stockQuantity') < (
          target_items.quantity + COALESCE((
            SELECT SUM(reserved_items.quantity)
            FROM order_items AS reserved_items
            INNER JOIN orders AS reserved_orders ON reserved_orders.id = reserved_items.order_id
            WHERE reserved_items.product_id = target_items.product_id
              AND reserved_orders.id <> OLD.id
              AND (
                (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
                OR (
                  reserved_orders.channel = 'checkout_pro'
                  AND reserved_orders.stock_reserved_at IS NOT NULL
                  AND reserved_orders.stock_reservation_expires_at IS NOT NULL
                  AND reserved_orders.stock_consumed_at IS NULL
                  AND reserved_orders.status NOT IN ('approved', 'refunded')
                  AND (
                    unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                    OR EXISTS (
                      SELECT 1
                      FROM payments AS pending_payments
                      WHERE pending_payments.order_id = reserved_orders.id
                        AND pending_payments.mapped_status = 'pending'
                    )
                  )
                )
              )
          ), 0)
        )
    )
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_RESERVATION_INCONSISTENT')
  END;
END;

CREATE TRIGGER checkout_orders_pending_stock_consistency
BEFORE UPDATE OF status ON orders
WHEN OLD.channel = 'checkout_pro'
  AND NEW.status = 'pending'
  AND OLD.stock_reserved_at IS NOT NULL
  AND OLD.stock_consumed_at IS NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM order_items WHERE order_id = OLD.id
    )
      OR NEW.item_count <> COALESCE((
        SELECT SUM(quantity) FROM order_items WHERE order_id = OLD.id
      ), 0)
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_RESERVATION_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      LEFT JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND target_items.stock_controlled = 1
        AND (
          mutation.product_id IS NULL
          OR mutation.deleted = 1
          OR COALESCE(json_type(mutation.payload_json, '$.stockQuantity'), '') <> 'integer'
        )
    )
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_CONTROL_INCONSISTENT')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM order_items AS target_items
      INNER JOIN catalog_product_mutations AS mutation
        ON mutation.product_id = target_items.product_id
      WHERE target_items.order_id = OLD.id
        AND mutation.deleted = 0
        AND json_type(mutation.payload_json, '$.stockQuantity') = 'integer'
        AND json_extract(mutation.payload_json, '$.stockQuantity') < COALESCE((
          SELECT SUM(reserved_items.quantity)
          FROM order_items AS reserved_items
          INNER JOIN orders AS reserved_orders ON reserved_orders.id = reserved_items.order_id
          WHERE reserved_items.product_id = target_items.product_id
            AND (
              (reserved_orders.channel = 'whatsapp' AND reserved_orders.status = 'pending')
              OR (
                reserved_orders.channel = 'checkout_pro'
                AND reserved_orders.stock_reserved_at IS NOT NULL
                AND reserved_orders.stock_reservation_expires_at IS NOT NULL
                AND reserved_orders.stock_consumed_at IS NULL
                AND reserved_orders.status NOT IN ('approved', 'refunded')
                AND (
                  unixepoch(reserved_orders.stock_reservation_expires_at) > unixepoch()
                  OR EXISTS (
                    SELECT 1
                    FROM payments AS pending_payments
                    WHERE pending_payments.order_id = reserved_orders.id
                      AND pending_payments.mapped_status = 'pending'
                  )
                )
              )
            )
        ), 0)
    )
    THEN RAISE(ABORT, 'CHECKOUT_STOCK_RESERVATION_INCONSISTENT')
  END;
END;

CREATE TRIGGER checkout_orders_consume_stock
AFTER UPDATE OF status ON orders
WHEN OLD.channel = 'checkout_pro'
  AND NEW.status IN ('approved', 'refunded')
  AND OLD.stock_reserved_at IS NOT NULL
  AND OLD.stock_consumed_at IS NULL
BEGIN
  UPDATE catalog_product_mutations
  SET payload_json = json_set(
        payload_json,
        '$.stockQuantity',
        json_extract(payload_json, '$.stockQuantity') - (
          SELECT items.quantity
          FROM order_items AS items
          WHERE items.order_id = NEW.id
            AND items.product_id = catalog_product_mutations.product_id
        )
      ),
      updated_by = 'mercadopago-webhook',
      updated_at = NEW.updated_at
  WHERE deleted = 0
    AND json_type(payload_json, '$.stockQuantity') = 'integer'
    AND EXISTS (
      SELECT 1
      FROM order_items AS items
      WHERE items.order_id = NEW.id
        AND items.product_id = catalog_product_mutations.product_id
    );

  UPDATE orders
  SET stock_consumed_at = COALESCE(NEW.approved_at, NEW.updated_at)
  WHERE id = NEW.id
    AND stock_consumed_at IS NULL;
END;

CREATE TRIGGER checkout_orders_stock_markers_immutable
BEFORE UPDATE OF stock_reserved_at, stock_reservation_expires_at, stock_consumed_at ON orders
WHEN OLD.channel = 'checkout_pro'
  AND (
    NEW.stock_reserved_at IS NOT OLD.stock_reserved_at
    OR NEW.stock_reservation_expires_at IS NOT OLD.stock_reservation_expires_at
    OR (
      OLD.stock_consumed_at IS NOT NULL
      AND NEW.stock_consumed_at IS NOT OLD.stock_consumed_at
    )
    OR (
      OLD.stock_consumed_at IS NULL
      AND NEW.stock_consumed_at IS NOT NULL
      AND NEW.status NOT IN ('approved', 'refunded')
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'CHECKOUT_STOCK_MARKERS_IMMUTABLE');
END;
