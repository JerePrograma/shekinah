# Modelo comercial y catálogo del BLOQUE 4

## Alcance

Este bloque incorpora la estructura técnica necesaria para recibir productos autorizados sin publicar datos ficticios.

La colección de producción permanece vacía. Los nombres y valores utilizados en pruebas existen únicamente como fixtures y no forman parte del bundle de producción.

## Separación de responsabilidades

- `src/config/authorized-assets.ts`: metadatos del único activo visual autorizado;
- `src/content/site-content.ts`: contenido estructural de la interfaz;
- `src/data/authorized-commercial-data.ts`: productos y contacto expresamente autorizados;
- `src/catalog/model.ts`: contrato y validación del producto;
- `src/catalog/catalog.ts`: normalización, categorías, búsqueda, filtros y formato;
- `src/catalog/CatalogSection.tsx`: presentación del catálogo;
- `src/test/fixtures/catalog-products.ts`: datos exclusivos para pruebas.

## Modelo de producto

Campos obligatorios:

- `id`;
- `name`;
- `category`;
- `presentation`.

Campo opcional:

- `price`, compuesto por un importe positivo y la moneda `ARS`.

Los textos obligatorios se recortan y los vacíos se rechazan. Los importes no finitos, nulos o negativos se rechazan. Los identificadores duplicados se rechazan al construir una colección.

El modelo no contiene campos de imagen.

## Búsqueda y categorías

La búsqueda:

- elimina espacios iniciales y finales;
- reduce espacios repetidos;
- normaliza a minúsculas;
- elimina marcas diacríticas;
- busca todos los términos sobre nombre, categoría y presentación.

Las categorías se derivan exclusivamente de la colección autorizada, se deduplican de manera insensible a mayúsculas y acentos, y se ordenan para español de Argentina.

La búsqueda y la categoría se aplican de forma conjunta.

## Renderizado condicional

Cuando no existen productos:

- no se muestran búsqueda ni filtros;
- se presenta un estado vacío;
- no se crean tarjetas.

Cuando existen productos:

- se muestra búsqueda;
- el filtro de categoría aparece únicamente si hay más de una categoría;
- cada tarjeta muestra solo campos disponibles;
- el precio se omite cuando no fue proporcionado;
- no se renderizan imágenes.

## Datos comerciales actuales

- productos autorizados: ninguno;
- contacto autorizado: ninguno.

La incorporación futura de datos exige modificar únicamente la fuente centralizada y superar nuevamente las validaciones.
