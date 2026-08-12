PRAGMA foreign_keys = ON;

ALTER TABLE orders
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'checkout_pro'
  CHECK (channel IN ('checkout_pro', 'whatsapp'));

ALTER TABLE orders
  ADD COLUMN resolved_at TEXT;

ALTER TABLE orders
  ADD COLUMN resolved_by TEXT;

CREATE INDEX idx_orders_channel_status_created
  ON orders(channel, status, created_at DESC);

CREATE INDEX idx_order_items_product_order
  ON order_items(product_id, order_id);

CREATE TRIGGER whatsapp_orders_initial_state
BEFORE INSERT ON orders
WHEN NEW.channel = 'whatsapp' AND NEW.status <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_INITIAL_STATE_INVALID');
END;

CREATE TRIGGER whatsapp_orders_channel_immutable
BEFORE UPDATE OF channel ON orders
WHEN NEW.channel <> OLD.channel
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_CHANNEL_IMMUTABLE');
END;

CREATE TRIGGER whatsapp_orders_state_transition
BEFORE UPDATE OF status ON orders
WHEN OLD.channel = 'whatsapp' AND NEW.status <> OLD.status
BEGIN
  SELECT CASE
    WHEN OLD.status <> 'pending' OR NEW.status NOT IN ('approved', 'rejected')
    THEN RAISE(ABORT, 'WHATSAPP_STATE_TRANSITION_INVALID')
  END;
  SELECT CASE
    WHEN NEW.resolved_at IS NULL OR length(trim(NEW.resolved_at)) = 0
      OR NEW.resolved_by IS NULL OR length(trim(NEW.resolved_by)) = 0
    THEN RAISE(ABORT, 'WHATSAPP_RESOLUTION_METADATA_REQUIRED')
  END;
END;

CREATE TRIGGER whatsapp_order_items_reserve_stock
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND channel = 'whatsapp'
    AND status = 'pending'
)
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM catalog_product_mutations
      WHERE product_id = NEW.product_id
        AND deleted = 1
    )
    THEN RAISE(ABORT, 'WHATSAPP_PRODUCT_DELETED')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM catalog_product_mutations
      WHERE product_id = NEW.product_id
        AND deleted = 0
        AND json_extract(payload_json, '$.availability') = 'unavailable'
    )
    THEN RAISE(ABORT, 'WHATSAPP_PRODUCT_UNAVAILABLE')
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
            INNER JOIN orders AS pending_orders ON pending_orders.id = items.order_id
            WHERE items.product_id = NEW.product_id
              AND pending_orders.channel = 'whatsapp'
              AND pending_orders.status = 'pending'
          ), 0) + NEW.quantity
        )
    )
    THEN RAISE(ABORT, 'WHATSAPP_INSUFFICIENT_STOCK')
  END;
END;

CREATE TRIGGER whatsapp_order_items_pending_only
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1
  FROM orders
  WHERE id = NEW.order_id
    AND channel = 'whatsapp'
    AND status <> 'pending'
)
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_ORDER_ITEMS_NOT_PENDING');
END;

CREATE TRIGGER whatsapp_order_items_update_immutable
BEFORE UPDATE ON order_items
WHEN EXISTS (
  SELECT 1 FROM orders WHERE id = OLD.order_id AND channel = 'whatsapp'
) OR EXISTS (
  SELECT 1 FROM orders WHERE id = NEW.order_id AND channel = 'whatsapp'
)
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_ORDER_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER whatsapp_order_items_delete_immutable
BEFORE DELETE ON order_items
WHEN EXISTS (
  SELECT 1 FROM orders WHERE id = OLD.order_id AND channel = 'whatsapp'
)
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_ORDER_ITEMS_IMMUTABLE');
END;

CREATE TRIGGER catalog_mutations_insert_reservation_guard
BEFORE INSERT ON catalog_product_mutations
WHEN NEW.deleted = 0
  AND json_type(NEW.payload_json, '$.stockQuantity') = 'integer'
  AND json_extract(NEW.payload_json, '$.stockQuantity') < COALESCE((
    SELECT SUM(items.quantity)
    FROM order_items AS items
    INNER JOIN orders AS pending_orders ON pending_orders.id = items.order_id
    WHERE items.product_id = NEW.product_id
      AND pending_orders.channel = 'whatsapp'
      AND pending_orders.status = 'pending'
  ), 0)
BEGIN
  SELECT RAISE(ABORT, 'WHATSAPP_STOCK_BELOW_RESERVATIONS');
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
        INNER JOIN orders AS pending_orders ON pending_orders.id = items.order_id
        WHERE items.product_id = OLD.product_id
          AND pending_orders.channel = 'whatsapp'
          AND pending_orders.status = 'pending'
      )
      AND (
        NEW.deleted = 1
        OR COALESCE(json_type(NEW.payload_json, '$.stockQuantity'), '') <> 'integer'
      )
    THEN RAISE(ABORT, 'WHATSAPP_STOCK_CONTROL_REQUIRED')
  END;

  SELECT CASE
    WHEN NEW.deleted = 0
      AND json_type(NEW.payload_json, '$.stockQuantity') = 'integer'
      AND json_extract(NEW.payload_json, '$.stockQuantity') < COALESCE((
        SELECT SUM(items.quantity)
        FROM order_items AS items
        INNER JOIN orders AS pending_orders ON pending_orders.id = items.order_id
        WHERE items.product_id = NEW.product_id
          AND pending_orders.channel = 'whatsapp'
          AND pending_orders.status = 'pending'
      ), 0)
    THEN RAISE(ABORT, 'WHATSAPP_STOCK_BELOW_RESERVATIONS')
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
          INNER JOIN orders AS pending_orders ON pending_orders.id = reserved_items.order_id
          WHERE reserved_items.product_id = target_items.product_id
            AND pending_orders.channel = 'whatsapp'
            AND pending_orders.status = 'pending'
        ), 0)
    )
    THEN RAISE(ABORT, 'WHATSAPP_RESERVATION_INCONSISTENT')
  END;
END;

CREATE TRIGGER whatsapp_orders_consume_reservation
AFTER UPDATE OF status ON orders
WHEN OLD.channel = 'whatsapp'
  AND OLD.status = 'pending'
  AND NEW.status = 'approved'
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
      updated_by = NEW.resolved_by,
      updated_at = NEW.resolved_at
  WHERE deleted = 0
    AND json_type(payload_json, '$.stockQuantity') = 'integer'
    AND EXISTS (
      SELECT 1
      FROM order_items AS items
      WHERE items.order_id = NEW.id
        AND items.product_id = catalog_product_mutations.product_id
    );
END;
