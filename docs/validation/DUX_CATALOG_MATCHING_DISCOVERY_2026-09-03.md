# Descubrimiento de vínculos Dux / catálogo local / Mercado Libre — 2026-09-03

## Objetivo

Medir, sin modificar datos de negocio, cuánto contenido editorial de los 513 productos locales puede reutilizarse sobre el universo autoritativo de Dux antes de completar el corte público.

## Autoridad y alcance

- Dux continúa siendo la única autoridad de existencia, código, nombre, precio y stock.
- El catálogo local sólo puede aportar imágenes, descripción, texto breve y presentación editorial mediante un vínculo inequívoco.
- Mercado Libre se consulta únicamente desde su mirror histórico D1 como evidencia editorial. No se renueva OAuth, no se llama a su API, no se usa precio ni stock y no se reactiva la integración directa.
- La extracción no crea ni confirma vínculos, no publica snapshots y no modifica inventario. `handleAdminRequest` conserva únicamente la auditoría administrativa habitual.
- El análisis de similitud se ejecuta localmente para no consumir CPU de Workers Free.

## Componentes

- `POST /api/admin/dux/matching-source`: exporta una fotografía autenticada de Dux, productos locales, mappings de inventario ya confirmados y mirror histórico de Mercado Libre.
- `scripts/analyze-dux-catalog-matches.mjs`: genera un informe JSON y CSV locales.

## Clasificación

1. `confirmed`: identidad fuerte 1:1 ya persistida o coincidencia exacta por código/SKU, código externo o barcode.
2. `suggested`: nombre y presentación equivalentes, o similitud alta con margen suficiente; requiere aprobación.
3. `ambiguous`: múltiples candidatos, conflicto de mappings o dos productos Dux reclamando la misma ficha local.
4. `dux_only`: no existe candidato local suficientemente confiable.
5. `local_only`: la ficha local no participa en ningún match confirmado, sugerido o ambiguo.

Mercado Libre no cambia estas categorías. Sólo informa relaciones editoriales candidatas por seller SKU, triangulación local histórica o título exacto.

## Estado productivo durante el descubrimiento

- `0015_dux_catalog_snapshot.sql` permanece aplicada sólo en preview.
- Producción no debe aplicar `0015` ni publicar el catálogo Dux hasta revisar el informe.
- El catálogo público productivo continúa en modo transitorio anterior.
- Checkout Pro, WhatsApp transaccional y la integración directa Mercado Libre permanecen cerrados.

## Salidas

El analizador produce:

- `catalog-matching-summary.json`;
- `catalog-matching-report.json`;
- `dux-local-matching.csv`;
- `review-required.csv`;
- `local-only.csv`;
- `mercadolibre-only.csv`.

Estos archivos son artefactos locales de análisis y no deben commitearse.
