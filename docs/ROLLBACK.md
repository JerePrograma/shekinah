# Rollback y recuperación de versiones

El rollback se realiza con el historial de Git y los despliegues estáticos versionados. Nunca depende de volver a ejecutar la instalación recuperada, usar WordPress o publicar los adjuntos originales.

## Reglas

- no usar `force push`;
- no reescribir ni borrar historial;
- no volver a subir SQL, ZIP, WXR o backups;
- no desplegar un `dist` cuyo commit de origen no esté identificado;
- ejecutar CI sobre toda corrección o reversión;
- mantener alineados `main` y el SHA publicado en Cloudflare;
- no habilitar dos publicadores automáticos en paralelo.

## Revertir un commit

### Desde GitHub

1. Abrir el commit problemático.
2. Si GitHub ofrece **Revert**, revisar exactamente qué archivos revertirá.
3. Como el proyecto trabaja directamente sobre `main`, realizar una edición inversa desde la web cuando la interfaz de GitHub solo permita revertir mediante PR.
4. Confirmar el nuevo commit en `main`.
5. Revisar CI.
6. Verificar el despliegue del commit de reversión en Cloudflare.

### Con Git opcional

```bash
git switch main
git pull --ff-only origin main
git revert <SHA_A_REVERTIR>
git push origin main
```

Para múltiples commits, revertir del más nuevo al más antiguo o preparar un único commit inverso cuidadosamente revisado.

## Restaurar solamente un archivo

1. Abrir el archivo en GitHub.
2. Elegir **History**.
3. Abrir la revisión estable.
4. Copiar su contenido.
5. Editar la versión actual y restaurarla.
6. Confirmar el cambio sobre `main`.
7. Esperar CI y el deployment de Cloudflare.

Esto evita perder cambios válidos incluidos en el mismo commit que introdujo el problema.

## Volver temporalmente a un deployment estable

Cloudflare Pages conserva deployments anteriores. Ante una incidencia:

1. seleccionar temporalmente un deployment estable desde el dashboard cuando Cloudflare lo permita;
2. comprobar el SHA de esa versión;
3. corregir o revertir `main`;
4. ejecutar CI;
5. dejar que la integración Git de Cloudflare publique el commit de reversión;
6. usar el workflow manual de GitHub Actions solo si la integración Git está bloqueada;
7. verificar que producción y `main` vuelven a coincidir.

El rollback en Cloudflare es una mitigación rápida, no reemplaza la corrección del repositorio. De lo contrario, el siguiente push volverá a publicar el defecto.

## Recuperar una versión completa

La forma correcta no es mover `main` hacia atrás ni borrar commits. Se deben revertir los commits posteriores hasta que el árbol resultante coincida con la versión estable y luego ejecutar la canalización normal.

## Recuperación mediante GitHub Actions

Cuando la integración Git de Cloudflare no pueda utilizarse:

1. configurar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` como secretos de Actions;
2. abrir **Actions → Deploy Cloudflare Pages**;
3. ejecutar manualmente desde `main`;
4. confirmar que `npm run verify` termina en verde;
5. verificar la URL y el SHA publicados;
6. no dejar el workflow como publicador automático paralelo.

## Evidencia original

Los cuatro adjuntos deben conservarse fuera del repositorio como evidencia de origen, junto con sus hashes documentados. No son un mecanismo de rollback operativo y no deben publicarse.

## Verificación posterior

- CI verde para el SHA de reversión;
- portada y rutas principales disponibles;
- navegación e imágenes correctas;
- sitemap, robots y canonical válidos;
- ausencia de PHP, secretos, backups y referencias heredadas;
- SHA de Cloudflare coincidente con el commit esperado.
