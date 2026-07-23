# Despliegue en GitHub Pages

Fecha de actualización: **2026-07-23**.

## Configuración

- Repositorio: `JerePrograma/shekinah`.
- Rama de producción: `main`.
- Directorio generado: `dist/`.
- URL: `https://jereprograma.github.io/shekinah/`.
- Publicador: GitHub Actions.

## Flujo

1. Un commit llega a `main`.
2. El workflow instala las dependencias declaradas.
3. Ejecuta lint, formato, validación de contenido, build, pruebas y auditorías.
4. Genera una segunda salida con la base `/shekinah/` y el origen público de GitHub Pages.
5. Audita la salida final.
6. Empaqueta exclusivamente `dist/` como artefacto de GitHub Pages.
7. Despliega el artefacto en el entorno `github-pages`.

El despliegue no utiliza secretos externos, tokens de proveedores ni archivos `.env`.

## Construcción local

Construcción normal:

```bash
npm install --package-lock=false --no-audit --no-fund
npm run install:browsers
npm run verify
```

Construcción equivalente a producción:

```bash
SITE_BASE_PATH=/shekinah/ SITE_ORIGIN=https://jereprograma.github.io/shekinah npm run build
SITE_BASE_PATH=/shekinah/ SITE_ORIGIN=https://jereprograma.github.io/shekinah npm run audit:output
```

## Requisitos del repositorio

GitHub Pages debe usar GitHub Actions como origen de publicación. El workflow `.github/workflows/ci.yml` contiene tanto la validación como el despliegue y crea el entorno `github-pages` cuando corresponde.
