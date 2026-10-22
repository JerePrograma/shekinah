-- Discounts keep the live Dux base price, exact SKU/quantity, stock evidence and
-- all 0024 lifecycle guards. The provider receives the audited final unit price
-- with porc_desc = 0; its returned total must still match every charged cent.
-- Existing orders and applied migrations are unchanged.
CREATE TRIGGER dux_automatic_marketing_redemption_guard
BEFORE INSERT ON marketing_redemptions
WHEN NOT EXISTS (SELECT 1 FROM marketing_redemptions WHERE order_id = NEW.order_id)
  AND EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method = 'automatic_api')
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM orders target
    JOIN checkout_intents request ON request.web_request_id = target.web_request_id
    JOIN dux_order_operations op ON op.order_id = target.id AND op.idempotency_key = 'automatic-reserve:' || target.id
    WHERE target.id = NEW.order_id AND target.status = 'preference_pending'
      AND target.mp_preference_attempted_at IS NULL AND op.attempted_at IS NULL AND op.status = 'pending'
      AND json(NEW.quote_json) = json_extract(op.request_json, '$.quote.marketingQuote')
      AND json(NEW.campaign_snapshot_json) = json_extract(NEW.quote_json, '$.campaignSnapshot')
      AND (json_extract(NEW.quote_json, '$.couponCode') IS json_extract(request.web_request_json, '$.couponCode')
        OR (json_extract(NEW.quote_json, '$.couponCode') IS NULL AND json_extract(NEW.campaign_snapshot_json, '$.type') = 'automatic'))
      AND json_extract(NEW.quote_json, '$.campaignId') = NEW.campaign_id
      AND json_type(NEW.quote_json, '$.subtotalMinor') = 'integer'
      AND json_type(NEW.quote_json, '$.discountMinor') = 'integer'
      AND json_type(NEW.quote_json, '$.totalMinor') = 'integer'
      AND json_extract(NEW.quote_json, '$.discountMinor') > 0
      AND json_extract(NEW.quote_json, '$.totalMinor') > 0
      AND target.total_minor = json_extract(NEW.quote_json, '$.totalMinor')
      AND json_extract(NEW.quote_json, '$.subtotalMinor') - json_extract(NEW.quote_json, '$.discountMinor') = target.total_minor
      AND json_array_length(NEW.quote_json, '$.lines') = json_array_length(op.request_json, '$.quote.lines')
      AND json_array_length(NEW.quote_json, '$.lines') = (SELECT COUNT(DISTINCT json_extract(value, '$.code')) FROM json_each(NEW.quote_json, '$.lines'))
      AND json_array_length(NEW.quote_json, '$.lines') = (SELECT COUNT(DISTINCT json_extract(value, '$.productId')) FROM json_each(NEW.quote_json, '$.lines'))
      AND target.item_count = (SELECT SUM(json_extract(value, '$.quantity')) FROM json_each(NEW.quote_json, '$.lines'))
      AND json_extract(NEW.quote_json, '$.subtotalMinor') = (
        SELECT SUM(json_extract(value, '$.baseUnitPriceMinor') * json_extract(value, '$.quantity')) FROM json_each(NEW.quote_json, '$.lines'))
      AND json_extract(NEW.quote_json, '$.discountMinor') = (
        SELECT SUM(json_extract(value, '$.discountMinor')) FROM json_each(NEW.quote_json, '$.lines'))
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.quote_json, '$.lines') priced
        WHERE json_type(priced.value, '$.quantity') IS NOT 'integer'
          OR json_type(priced.value, '$.baseUnitPriceMinor') IS NOT 'integer'
          OR json_type(priced.value, '$.unitPriceMinor') IS NOT 'integer'
          OR json_type(priced.value, '$.discountMinor') IS NOT 'integer'
          OR json_extract(priced.value, '$.quantity') NOT BETWEEN 1 AND 99
          OR json_extract(priced.value, '$.unitPriceMinor') <= 0
          OR json_extract(priced.value, '$.baseUnitPriceMinor') < json_extract(priced.value, '$.unitPriceMinor')
          OR json_extract(priced.value, '$.discountMinor') < 0
          OR json_extract(priced.value, '$.discountMinor') <>
            (json_extract(priced.value, '$.baseUnitPriceMinor') - json_extract(priced.value, '$.unitPriceMinor')) * json_extract(priced.value, '$.quantity')
          OR json_extract(priced.value, '$.baseUnitPriceMinor') - json_extract(priced.value, '$.unitPriceMinor') >
            CAST((json_extract(priced.value, '$.baseUnitPriceMinor') * json_extract(NEW.campaign_snapshot_json, '$.percentOff') + 50) / 100 AS INTEGER)
          OR (json_extract(priced.value, '$.discountMinor') > 0
            AND json_array_length(NEW.campaign_snapshot_json, '$.productCodes') > 0
            AND NOT EXISTS (SELECT 1 FROM json_each(NEW.campaign_snapshot_json, '$.productCodes') eligible
              WHERE eligible.value = json_extract(priced.value, '$.code')))
          OR NOT EXISTS (
            SELECT 1 FROM json_each(op.request_json, '$.quote.lines') quoted
            WHERE json_extract(quoted.value, '$.productId') = json_extract(priced.value, '$.productId')
              AND json_extract(quoted.value, '$.code') = json_extract(priced.value, '$.code')
              AND json_extract(quoted.value, '$.quantity') = json_extract(priced.value, '$.quantity')
              AND json_extract(quoted.value, '$.unitPriceMinor') = json_extract(priced.value, '$.unitPriceMinor')
              AND json_extract(quoted.value, '$.baseUnitPriceMinor') = json_extract(priced.value, '$.baseUnitPriceMinor')
              AND json_extract(quoted.value, '$.stockBefore.priceMinor') = json_extract(priced.value, '$.baseUnitPriceMinor')
          )
      )
  ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_MARKETING_EVIDENCE_INVALID') END;
END;

CREATE TRIGGER dux_automatic_marketing_order_item_guard
BEFORE INSERT ON order_items
WHEN EXISTS (SELECT 1 FROM dux_order_links WHERE order_id = NEW.order_id AND verification_method = 'automatic_api')
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM dux_order_operations op, json_each(op.request_json, '$.quote.lines') quoted
    WHERE op.order_id = NEW.order_id AND op.idempotency_key = 'automatic-reserve:' || NEW.order_id
      AND json_extract(quoted.value, '$.productId') = NEW.product_id
      AND json_extract(quoted.value, '$.code') = NEW.sku
      AND json_extract(quoted.value, '$.quantity') = NEW.quantity
      AND json_extract(quoted.value, '$.unitPriceMinor') = NEW.unit_price_minor
      AND json_type(quoted.value, '$.stockBefore.priceMinor') = 'integer'
      AND (
        (json_type(op.request_json, '$.quote.marketingQuote') IS NULL
          AND json_extract(quoted.value, '$.stockBefore.priceMinor') = NEW.unit_price_minor)
        OR EXISTS (
          SELECT 1 FROM marketing_redemptions redemption, json_each(redemption.quote_json, '$.lines') priced
          WHERE redemption.order_id = NEW.order_id
            AND json(redemption.quote_json) = json_extract(op.request_json, '$.quote.marketingQuote')
            AND json_extract(priced.value, '$.productId') = NEW.product_id
            AND json_extract(priced.value, '$.code') = NEW.sku
            AND json_extract(priced.value, '$.quantity') = NEW.quantity
            AND json_extract(priced.value, '$.unitPriceMinor') = NEW.unit_price_minor
            AND json_extract(priced.value, '$.baseUnitPriceMinor') = json_extract(quoted.value, '$.stockBefore.priceMinor')
            AND json_extract(quoted.value, '$.baseUnitPriceMinor') = json_extract(priced.value, '$.baseUnitPriceMinor')
        )
      )
  ) THEN RAISE(ABORT, 'DUX_AUTOMATIC_MARKETING_EVIDENCE_REQUIRED') END;
END;
