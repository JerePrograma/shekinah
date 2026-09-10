PRAGMA foreign_keys = ON;

-- Refuerza las confirmaciones asistidas contra carreras con webhook/conciliación.
-- La evidencia de una operación manual en Dux nunca puede sobreescribir la
-- dimensión financiera de Mercado Pago ni asumir que un reembolso repuso stock.
CREATE TRIGGER dux_assisted_release_financial_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'release'
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'assisted_admin'
  )
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND (
          payment.amount_minor <> target.total_minor
          OR payment.currency <> target.currency
          OR payment.external_reference <> target.id
        )
    )
    OR EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND payment.amount_minor = target.total_minor
        AND payment.currency = target.currency
        AND payment.external_reference = target.id
        AND payment.mapped_status IN ('approved', 'pending')
    )
    OR EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND target.mp_preference_attempted_at IS NOT NULL
        AND (
          julianday(NEW.attempted_at) < julianday(target.mp_preference_attempted_at, '+30 minutes')
          OR json_extract(NEW.request_json, '$.paymentReconciledAt') IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > julianday(NEW.attempted_at)
          OR julianday(NEW.attempted_at) - julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > (2.0 / 1440.0)
        )
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_RELEASE_FINANCIAL_GUARD') END;
END;

CREATE TRIGGER dux_assisted_finalize_financial_guard
BEFORE INSERT ON dux_order_operations
WHEN NEW.action = 'finalize'
  AND EXISTS (
    SELECT 1 FROM dux_order_links
    WHERE order_id = NEW.order_id AND verification_method = 'assisted_admin'
  )
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND (
          target.mp_preference_attempted_at IS NULL
          OR target.mp_preference_id IS NULL
          OR target.mp_checkout_url IS NULL
        )
    )
    OR (SELECT COUNT(*)
      FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND payment.amount_minor = target.total_minor
        AND payment.currency = target.currency
        AND payment.external_reference = target.id
        AND payment.mapped_status = 'approved') <> 1
    OR EXISTS (
      SELECT 1 FROM payments AS payment
      INNER JOIN orders AS target ON target.id = payment.order_id
      WHERE payment.order_id = NEW.order_id
        AND (
          payment.amount_minor <> target.total_minor
          OR payment.currency <> target.currency
          OR payment.external_reference <> target.id
          OR payment.mapped_status IN ('pending', 'refunded')
        )
    )
    OR EXISTS (
      SELECT 1 FROM orders AS target
      WHERE target.id = NEW.order_id
        AND (
          json_extract(NEW.request_json, '$.paymentReconciledAt') IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) IS NULL
          OR julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > julianday(NEW.attempted_at)
          OR julianday(NEW.attempted_at) - julianday(json_extract(NEW.request_json, '$.paymentReconciledAt')) > (2.0 / 1440.0)
        )
    )
  THEN RAISE(ABORT, 'DUX_ASSISTED_FINALIZE_FINANCIAL_GUARD') END;
END;
