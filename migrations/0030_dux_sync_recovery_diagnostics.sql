-- Diagnóstico cerrado: nunca cuerpos, URLs completas, headers ni credenciales.
ALTER TABLE dux_sync_operations ADD COLUMN provider_status INTEGER
  CHECK (provider_status IS NULL OR provider_status BETWEEN 100 AND 599);
ALTER TABLE dux_sync_operations ADD COLUMN provider_endpoint TEXT
  CHECK (provider_endpoint IS NULL OR provider_endpoint IN ('/v2/empresas', '/v2/sucursales', '/v2/depositos', '/v2/items'));
ALTER TABLE dux_sync_operations ADD COLUMN provider_error_code TEXT
  CHECK (provider_error_code IS NULL OR (provider_error_code GLOB 'DUX_[A-Z_]*' AND length(provider_error_code) <= 80));
ALTER TABLE dux_sync_operations ADD COLUMN provider_error_at TEXT;
ALTER TABLE dux_sync_operations ADD COLUMN phase_attempts INTEGER NOT NULL DEFAULT 0 CHECK (phase_attempts BETWEEN 0 AND 3);
ALTER TABLE dux_sync_operations ADD COLUMN retry_not_before_ms INTEGER NOT NULL DEFAULT 0 CHECK (retry_not_before_ms >= 0);
ALTER TABLE dux_sync_operations ADD COLUMN provider_reason_code TEXT
  CHECK (provider_reason_code IS NULL OR provider_reason_code IN ('VALIDACION', 'ERROR_VALIDACION', 'SOLICITUD_INVALIDA',
    'LIMITE_PETICIONES_EXCEDIDO', 'AUTENTICACION_REQUERIDA', 'NO_AUTORIZADO', 'PROHIBIDO', 'NO_ENCONTRADO', 'ERROR_INTERNO', 'UNKNOWN'));
ALTER TABLE dux_sync_operations ADD COLUMN provider_invalid_fields_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(provider_invalid_fields_json) AND json_type(provider_invalid_fields_json) = 'array' AND json_array_length(provider_invalid_fields_json) <= 13);
ALTER TABLE dux_sync_operations ADD COLUMN provider_error_fingerprint TEXT
  CHECK (provider_error_fingerprint IS NULL OR (length(provider_error_fingerprint) = 64 AND provider_error_fingerprint NOT GLOB '*[^a-f0-9]*'));
