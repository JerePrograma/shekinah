-- Empty by design. Administrators explicitly author and enable all campaigns.
CREATE TABLE marketing_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('coupon','automatic','announcement')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 140),
  body TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL DEFAULT '',
  placement TEXT NOT NULL CHECK(placement IN ('announcement','home')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK(typeof(priority) = 'integer' AND priority BETWEEN -1000 AND 1000),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  percent_off INTEGER CHECK(percent_off IS NULL OR (typeof(percent_off) = 'integer' AND percent_off BETWEEN 1 AND 90)),
  code TEXT UNIQUE,
  min_subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK(typeof(min_subtotal_minor) = 'integer' AND min_subtotal_minor >= 0),
  max_discount_minor INTEGER CHECK(max_discount_minor IS NULL OR (typeof(max_discount_minor) = 'integer' AND max_discount_minor > 0)),
  product_codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(product_codes_json) AND json_type(product_codes_json) = 'array'),
  max_redemptions INTEGER CHECK(max_redemptions IS NULL OR (typeof(max_redemptions) = 'integer' AND max_redemptions > 0)),
  updated_at TEXT NOT NULL,
  CHECK(starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at),
  CHECK((type = 'coupon' AND code IS NOT NULL AND length(code) BETWEEN 3 AND 32 AND code GLOB '[A-Z0-9]*' AND code NOT GLOB '*[^A-Z0-9_-]*') OR (type <> 'coupon' AND code IS NULL)),
  CHECK((type = 'announcement' AND percent_off IS NULL AND min_subtotal_minor = 0 AND max_discount_minor IS NULL AND max_redemptions IS NULL AND product_codes_json = '[]') OR (type <> 'announcement' AND percent_off IS NOT NULL))
);
CREATE INDEX marketing_campaigns_active ON marketing_campaigns(type,enabled,starts_at,ends_at);

-- A redemption is a slot reserved by an initiated order, never a sale counter.
CREATE TABLE marketing_redemptions (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES orders(id),
  campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id),
  campaign_snapshot_json TEXT NOT NULL CHECK(json_valid(campaign_snapshot_json)),
  quote_json TEXT NOT NULL CHECK(json_valid(quote_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX marketing_redemptions_campaign ON marketing_redemptions(campaign_id);
CREATE TRIGGER marketing_redemption_insert_guard BEFORE INSERT ON marketing_redemptions
WHEN NOT EXISTS (SELECT 1 FROM marketing_redemptions WHERE order_id = NEW.order_id)
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM marketing_campaigns c WHERE c.id = NEW.campaign_id
      AND c.type IN ('coupon','automatic') AND c.enabled = 1
      AND (c.starts_at IS NULL OR c.starts_at <= NEW.created_at)
      AND (c.ends_at IS NULL OR c.ends_at > NEW.created_at)
      AND (c.max_redemptions IS NULL OR (SELECT count(*) FROM marketing_redemptions r WHERE r.campaign_id = c.id) < c.max_redemptions)
      AND json_extract(NEW.campaign_snapshot_json,'$.id') = c.id
      AND json_extract(NEW.campaign_snapshot_json,'$.updatedAt') = c.updated_at
      AND json_extract(NEW.campaign_snapshot_json,'$.type') = c.type
      AND json_extract(NEW.campaign_snapshot_json,'$.title') = c.title
      AND json_extract(NEW.campaign_snapshot_json,'$.body') = c.body
      AND json_extract(NEW.campaign_snapshot_json,'$.ctaLabel') = c.cta_label
      AND json_extract(NEW.campaign_snapshot_json,'$.href') = c.href
      AND json_extract(NEW.campaign_snapshot_json,'$.placement') = c.placement
      AND json_extract(NEW.campaign_snapshot_json,'$.priority') = c.priority
      AND json_extract(NEW.campaign_snapshot_json,'$.enabled') = c.enabled
      AND json_extract(NEW.campaign_snapshot_json,'$.startsAt') IS c.starts_at
      AND json_extract(NEW.campaign_snapshot_json,'$.endsAt') IS c.ends_at
      AND json_extract(NEW.campaign_snapshot_json,'$.percentOff') = c.percent_off
      AND json_extract(NEW.campaign_snapshot_json,'$.code') IS c.code
      AND json_extract(NEW.campaign_snapshot_json,'$.minSubtotalMinor') = c.min_subtotal_minor
      AND json_extract(NEW.campaign_snapshot_json,'$.maxDiscountMinor') IS c.max_discount_minor
      AND json(json_extract(NEW.campaign_snapshot_json,'$.productCodes')) = json(c.product_codes_json)
      AND json_extract(NEW.campaign_snapshot_json,'$.maxRedemptions') IS c.max_redemptions
      AND json_extract(NEW.quote_json,'$.campaignId') = c.id
      AND json(json_extract(NEW.quote_json,'$.campaignSnapshot')) = json(NEW.campaign_snapshot_json)
      AND json_extract(NEW.quote_json,'$.discountMinor') > 0
      AND json_extract(NEW.quote_json,'$.subtotalMinor') >= c.min_subtotal_minor
      AND (c.max_discount_minor IS NULL OR json_extract(NEW.quote_json,'$.discountMinor') <= c.max_discount_minor)
  ) THEN RAISE(ABORT,'MARKETING_CAMPAIGN_UNAVAILABLE') END;
END;
CREATE TRIGGER marketing_redemption_identity_guard BEFORE INSERT ON marketing_redemptions
WHEN EXISTS (SELECT 1 FROM marketing_redemptions WHERE order_id = NEW.order_id AND
  (campaign_id <> NEW.campaign_id OR quote_json <> NEW.quote_json OR campaign_snapshot_json <> NEW.campaign_snapshot_json))
BEGIN SELECT RAISE(ABORT,'MARKETING_REDEMPTION_CONFLICT'); END;
CREATE TRIGGER marketing_redemption_immutable_update BEFORE UPDATE ON marketing_redemptions
BEGIN SELECT RAISE(ABORT,'MARKETING_REDEMPTION_IMMUTABLE'); END;
CREATE TRIGGER marketing_redemption_immutable_delete BEFORE DELETE ON marketing_redemptions
BEGIN SELECT RAISE(ABORT,'MARKETING_REDEMPTION_IMMUTABLE'); END;
