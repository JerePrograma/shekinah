# Activos no resueltos

El HTML recuperado referencia 19 imágenes externas de Unsplash y `assets.zyrosite.com`. No se dejaron hotlinks: esa práctica habría creado una dependencia del proveedor anterior o de terceros.

## Tratamiento

- Se intentó comprobar la disponibilidad desde el sandbox.
- La red del entorno no permitió resolver esos hosts de manera fiable.
- Se utilizaron imágenes locales recuperadas con función visual equivalente.
- Las URLs remotas se conservaron solo en inventarios privados de trabajo, no en producción.

## Impacto

No hay imágenes esenciales rotas. Algunas fotografías concretas de chocolate, barras de cereal y escenas editoriales no pudieron preservarse literalmente; las páginas usan medios locales de cocina, especias y marca.

## Acción futura opcional

Un responsable de contenido puede incorporar fotografías propias y licenciadas en `public/images/`, actualizar el frontmatter y abrir un commit en `main`. No hace falta acceder a los backups para hacerlo.
