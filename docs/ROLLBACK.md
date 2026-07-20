# Rollback

El rollback se basa en Git y en despliegues estáticos, nunca en volver a ejecutar la instalación recuperada.

## Revertir un commit desde GitHub

Para un commit introducido por un pull request, GitHub ofrece el botón **Revert**. Como este proyecto trabaja directamente sobre `main`, la forma segura es crear un commit inverso mediante una edición web o GitHub Codespaces y `git revert <SHA>`, sin reescribir historial.

Reglas:

- no usar force push;
- no borrar commits anteriores;
- no volver a subir SQL, ZIP o WXR;
- ejecutar CI sobre el commit de reversión.

## Volver a un despliegue estable

Cloudflare Pages conserva despliegues anteriores. En el dashboard del proyecto se puede seleccionar un despliegue previo y promoverlo/realizar rollback. Después debe corregirse `main` para que la siguiente publicación no reintroduzca el problema.

## Recuperar una versión de archivo

1. Abrir el archivo en GitHub.
2. Elegir **History**.
3. Abrir la revisión estable.
4. Copiar su contenido en una nueva edición y confirmar el cambio.

## Evidencia original

Los cuatro adjuntos deben conservarse fuera del repositorio como evidencia de origen. No son un mecanismo de rollback operativo y no deben publicarse.
