# Rollback y recuperación de versiones

El rollback se realiza con el historial de Git y los deployments estáticos versionados. Nunca depende de volver a ejecutar la instalación recuperada, usar WordPress o publicar los adjuntos originales.

## Reglas

- no usar `force push`;
- no reescribir ni borrar historial;
- no volver a subir SQL, ZIP, WXR o backups;
- no desplegar un `dist` cuyo commit de origen no esté identificado;
- ejecutar CI sobre toda corrección o reversión;
- mantener alineados `main`, CI y el SHA publicado en Cloudflare;
- no habilitar dos publicadores automáticos en paralelo.

## Revertir un commit

### Desde GitHub

1. Abrir el commit problemático.
2. Si GitHub ofrece **Revert**, revisar exactamente qué archivos revertirá.
3. Cuando la interfaz solo permita revertir mediante PR, realizar una edición inversa controlada directamente en `main`.
4. Confirmar el nuevo commit.
5. Revisar CI.
6. Confirmar el deployment del commit de reversión.

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
6. Confirmar el cambio en `main`.
7. Esperar CI y deployment.

Esto evita perder cambios válidos incluidos en el mismo commit que introdujo el problema.

## Volver temporalmente a un deployment estable

Cloudflare Pages conserva deployments anteriores. Ante una incidencia:

1. seleccionar temporalmente un deployment estable desde el dashboard cuando Cloudflare lo permita;
2. comprobar el SHA de esa versión;
3. corregir o revertir `main`;
4. ejecutar CI;
5. dejar que **Deploy Cloudflare Pages** publique el commit de reversión;
6. verificar que producción y `main` vuelven a coincidir.

El rollback en Cloudflare es una mitigación rápida, no reemplaza la corrección del repositorio. De lo contrario, el siguiente deployment volverá a introducir el defecto.

## Recuperar una versión completa

No mover `main` hacia atrás ni borrar commits. Revertir los commits posteriores hasta que el árbol resultante coincida con la versión estable y ejecutar la canalización normal.

## Despliegue manual de recuperación

Cuando el workflow automático no se inicie:

1. abrir **Actions → Deploy Cloudflare Pages**;
2. ejecutar manualmente desde `main`;
3. confirmar que `npm run verify` termina en verde;
4. comprobar la URL y el SHA publicados.

No usar `npx wrangler deploy`: ese comando corresponde a Workers. El pipeline usa `npx wrangler pages deploy dist`.

## Credenciales

La recuperación requiere:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

No rotar ni ampliar permisos salvo que la causa real sea expiración, cuenta incorrecta o alcance insuficiente.

## Evidencia original

Los cuatro adjuntos deben conservarse fuera del repositorio como evidencia de origen, junto con sus hashes documentados. No son un mecanismo de rollback operativo y no deben publicarse.

## Verificación posterior

- CI verde para el SHA de reversión;
- workflow de Pages verde para el mismo SHA;
- portada y rutas principales disponibles;
- navegación e imágenes correctas;
- sitemap, robots y canonical válidos;
- ausencia de PHP, secretos, backups y referencias heredadas;
- SHA de Cloudflare coincidente con el commit esperado.
