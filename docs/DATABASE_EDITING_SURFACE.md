# Superficie de edición y retirada de «Relacionadas»

Ronda de revisión del demo, 16 de octubre de 2026. Cambios sobre la rama y el árbol local existentes. No se modifican esquemas de bases de datos, registros, cuerpos, relaciones guardadas ni datos reales.

## Decisión e implementación

- El decorador de ventanas (`static/atlas-frames.js`) deja de registrar `.entry-view`. No se monta su capa ornamental ni se aplica el borde Centinela a la superficie de edición. Los marcos de navegación, herramientas y diálogos conservan su comportamiento.
- `static/editing-surface.css`, cargado después de los temas, retira el límite de 1280/1460 px y el antiguo reparto entre editor y columna «Relacionadas». La página y sus contenedores admiten el ancho disponible; `min-width:0` impide que una tabla fuerce el ancho del contenedor flex.
- Los bloques de prosa completos mantienen una medida máxima de 780 px. Los ancestros de bases, tablas, código y medios pueden extenderse al ancho disponible, incluso si el bloque amplio está anidado. No se limita el ancho del editor completo para conseguir la medida de lectura.
- Se conserva una franja de 56 px a la izquierda para los controles nativos de BlockNote (48 px en pantallas pequeñas) y un margen derecho de 24/16 px. No son los antiguos espacios ornamentales. El borde, sombra y capa decorativa central desaparecen.
- Tablas y boards conservan su desplazamiento horizontal propio. Las columnas de la cuadrícula mantienen el ancho configurado; una tabla demasiado ancha se desplaza en vez de comprimirse. El tamaño cambia con el espacio que deja la navegación.
- En escritorio de 1500 px o más, Side Peek reserva su anchura real y la página se reajusta a su izquierda. Center Peek y las pantallas más pequeñas mantienen la superposición para no dejar dos editores demasiado estrechos. El cierre devuelve el espacio sin persistir una anchura en los datos.
- La preferencia de ancho completo de un registro sigue ampliando su prosa. Una base de datos incluida en el cuerpo puede usar la superficie disponible aunque la prosa conserve la medida de lectura.

## Qué era «Relacionadas»

La presentación retirada constaba de `#relatedSidebar`, `loadRelatedSidebar` y las reglas `.related-sidebar` / `.has-related-sidebar`. Su única interacción era navegar mediante `loadEntry(id)` a una sugerencia. La interfaz consultaba `GET /api/pages/related/<entry_id>` al abrir una página; no escribía relaciones ni metadatos.

El endpoint `pages_related` en `app.py` calcula recomendaciones a partir de datos existentes:

1. Usa las etiquetas de la página, palabras significativas del título y la identidad de página padre.
2. Considera subpáginas directas, etiquetas compartidas o al menos dos coincidencias de palabras del título; excluye cursos, espacios y filas de base de datos.
3. Puntúa subpáginas (15), etiquetas compartidas (8 cada una) y palabras del título (5 cada una). Las coincidencias repetidas en el cuerpo sólo sirven para desempatar (hasta 2).
4. Devuelve hasta 24 candidatos con puntuación mínima de 12, incluyendo `shared_tags` para mostrar contexto.

Por tanto, **era una recomendación calculada y no una lista de relaciones explícitas ni de backlinks**. Retirar su interfaz no elimina un almacén de datos propio porque no existía tal almacén. Se conservan el endpoint, títulos, etiquetas, jerarquía y cuerpos utilizados por el cálculo, sin reclasificarlos ni crear vínculos automáticamente.

## Funciones distintas que se conservan

| Función de Atlas | Origen y semántica | Estado en esta ronda |
| --- | --- | --- |
| «Relacionadas» | Recomendaciones calculadas por etiquetas/título/subpáginas. | Se retiran panel, carga y columna. API y datos conservados. |
| «Relaciones» | Enlaces explícitos tipados entre entidades por UID; `relations.json` y `/api/relations`. Incluye navegación y añadir/quitar enlaces. | Conservada; no es el panel retirado. |
| «Referenciado por» | Relaciones entrantes explícitas del mismo grafo, agrupadas por tipo. | Conservada. |
| «Referencias» del contenido | `/api/entry/<id>/backlinks` busca el título como subcadena en otros cuerpos y devuelve fragmentos. Puede detectar texto sin enlace. | Conservada; no se presenta como índice canónico de menciones. |
| Propiedad Relación de una base | Referencias entre registros según el esquema de esa base. | Conservada; identidad y aislamiento sin cambios. |

## Contraste con Notion y decisión pendiente

La retirada visual solicitada no requiere asumir una equivalencia. La inspección específica de REA de esta ronda se documentará en la evidencia de conexión correspondiente. Mientras no exista una observación que sustente otra ubicación, **no se reemplaza el panel por un supuesto backlink, una relación creada automáticamente o una columna colapsable**. La similitud terminológica no prueba una equivalencia funcional.

## Validación

- `node --check knowledge_base/static/app.js`: correcto.
- `node --check knowledge_base/static/atlas-frames.js`: correcto.
- `git diff --check` de los archivos rastreados de esta superficie: correcto.
- La hoja nueva se analiza correctamente con PostCSS. `git diff --no-index --check /dev/null` de los dos archivos nuevos devuelve 1 sin mensajes: hay archivos nuevos respecto a `/dev/null`, sin errores de espacios.
- Comprobación de integración con cliente Flask y almacén aislado `/tmp/atlas-surface-validation-vlk0k88x`: HTML y CSS responden 200, el HTML carga la hoja nueva y conserva «Relaciones»/«Referenciado por» sin el panel «Relacionadas». La API conservada responde sin modificar la página de prueba.
- La inspección del código confirma que se conservan `pages_related`, `_title_keywords`, `/api/relations`, el lector/escritor de `relations.json`, los backlinks y las propiedades de relación.
- Pendiente al redactar: mediciones y capturas del demo con navegación abierta/cerrada, Peek y tablas amplias. No se afirma una comprobación visual hasta realizarla.

Archivos de esta parte: `templates/index.html`, `static/app.js`, `static/atlas-frames.js`, `static/style.css` y la nueva hoja `static/editing-surface.css`.

## Revisión integrada de esta ronda

Validación visual, evidencia REA, pruebas y límites finales en [DATABASE_REVIEW_ROUND.md](DATABASE_REVIEW_ROUND.md).
