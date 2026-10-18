> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Rediseño de bases de datos: primera tabla funcional

> Documento histórico de 2A. El usuario aprobó después esta dirección visual. La ampliación actual, sus pruebas y pendientes están en [DATABASE_WORKSPACE_STAGE2B.md](DATABASE_WORKSPACE_STAGE2B.md); sus estados sustituyen los pendientes de aprobación y límites del prototipo descritos aquí.

16 de octubre de 2026. Etapa 2A del [plan general](DATABASE_PLAN.md). La etapa 1 de identidad y migración se conserva. El objetivo general permanece abierto: esta entrega prepara una tabla para revisión; no extiende el diseño a todas las bases, tableros ni tarjetas.

## Referencia: observación y decisiones

Se reutilizaron tabla de Notion (`notion-database-test-rows.jpg`, evidencia/herramienta local no publicada), peek con cuerpo (`notion-database-peek-body.jpg`, evidencia/herramienta local no publicada) y [evidencias N01–N22](NOTION_DATABASE_EVIDENCE.md). No fue necesario volver a abrir Notion. Estas referencias proceden de la conexión de navegador de la inspección anterior, no de REA. No se modificaron páginas, datos ni permisos de Notion durante este rediseño.

| Aspecto | Observado en la referencia | Decisión del prototipo de Atlas |
| --- | --- | --- |
| Pestañas/herramientas | Pestañas compactas con icono, vista activa con fondo discreto y acciones en la franja superior; botón azul de creación. Captura de tabla, N01 y N22. | Una fila flexible con pestañas a la izquierda y filtro, orden, agrupación, altura y Nuevo a la derecha. Se conservan etiquetas visibles en las herramientas para facilitar su identificación. No se simulan botones de automatizaciones o funciones inexistentes. |
| Tipografía/cuadrícula | Fondo oscuro neutro, encabezados discretos, divisores finos y filas compactas. Captura de tabla. | Paleta local `#191919`/`#252525`, texto de 14 px y filas pequeñas de 36 px. Son medidas elegidas para Atlas, no valores extraídos del CSS ni mediciones exactas de Notion. |
| Propiedades y etiquetas | Iconos por tipo; Estado con punto y cápsula; selección múltiple con etiquetas de distintos colores. N02–N04 y N16. | Iconos SVG consistentes, títulos de cabecera atenuados, cápsulas de Estado y etiquetas rectangulares suaves. Se conservan las opciones reales de Atlas: «No iniciado», «En proceso», etc.; no se cambian los valores para imitar nombres de Notion. |
| Edición y apertura | OPEN se revela en el título y abre el peek lateral; la página contiene propiedades y cuerpo separados. N17 y N19. | Campo de título editable y OPEN separado, visible con hover o foco de teclado. Panel de registro lateral con propiedades y editor real. No se modifica el origen de filas de la tabla de fondo. |
| Menús | Se observaron menús de propiedad, filtros, ordenación y agrupación, con límites de comprobación registrados en N02–N11. | Se reutilizan las acciones reales existentes, con superficies neutras y espaciado compacto. El menú de propiedades del prototipo se coloca fuera del contenedor de scroll para evitar recortes. No se añade AND/OR, ordenación múltiple ni catálogo de diseños sólo por apariencia. |
| Tableros y tarjetas | Hay referencias de pestañas/arrastre registradas en N16–N22; las capturas disponibles no documentan todas las variantes visuales. | Pendientes de la etapa 2B. No se asume su diseño completo ni se extrapola esta tabla a tableros sin revisión. |

La selección azul, el foco de celda, los anchos iniciales y la adaptación a pantallas estrechas son decisiones de implementación. No se afirma haber verificado en Notion todos los recorridos de teclado, estados responsivos o temas claros.

## Alcance técnico y funcional

El JSON de **una base de ejemplo** contiene `presentation_preview: "notion-table-v1"`. Sólo las vistas de tabla de esa base reciben `.bn-db-notion-preview`. El guardado conserva `database_id`, propiedades y vistas. El estilo no se activa por defecto en bases existentes, bloques antiguos, tableros ni módulos ajenos.

Las pestañas Todo, Libros y Terminados representan vistas de la misma base de entretenimiento. Sus registros son páginas reales de Atlas, con propiedades y cuerpo, en un `DATA_ROOT` temporal. Se incluyen cuatro ejemplos ficticios con números, Estado, Género, Notas y Tipo. Libros filtra Tipo; Terminados filtra Estado. La identidad/migración y las bases A/B de la demo anterior siguen disponibles para comprobación.

Cambios del prototipo:

- Barra común de pestañas/herramientas, iconos por tipo, tipografía sans serif, líneas discretas, selección y foco visibles, etiquetas compactas y cálculos secundarios visibles al interactuar.
- Edición de títulos en celda mediante el endpoint existente, con aviso de error y recarga del valor persistido. OPEN sigue accesible por teclado sin depender del hover.
- El editor numérico de la tabla de revisión conserva `0` al editar; no se cambia globalmente el editor de propiedades de otras páginas. La validación general de tipos y guardados concurrentes sigue siendo trabajo funcional pendiente.
- Nuevo y Nueva página crean registros reales de la misma fuente; los filtros de vista siguen siendo proyecciones.
- Menú de propiedad en portal con ajuste de posición a la ventana y cierre por Escape/clic exterior. Los popovers de opciones reciben el estilo sólo si se originan en la tabla o su panel de revisión.
- Panel lateral sólo cuando se abre desde esta tabla, con cuerpo editable y propiedades reales. Se neutralizan únicamente allí los estilos de ventana y marcos de los temas de Atlas. Otros peeks conservan su presentación anterior.

Código: [customBlocks.jsx](../knowledge_base/editor-src/src/customBlocks.jsx), [database-preview.css](../knowledge_base/editor-src/src/database-preview.css), [databaseIcons.jsx](../knowledge_base/editor-src/src/databaseIcons.jsx), [databasePropertyMenu.jsx](../knowledge_base/editor-src/src/databasePropertyMenu.jsx), [databasePresentation.js](../knowledge_base/editor-src/src/databasePresentation.js), y ajustes acotados de contexto visual en [app.js](../knowledge_base/static/app.js) y [properties.js](../knowledge_base/static/properties.js). No se modificó el backend de identidad ni el migrador en esta etapa.

Antes de editar se guardó otra copia del punto de partida en `/tmp/atlas-redesign-baseline-739b2tjb`, con manifiesto SHA-256 de los seis archivos que se iban a ampliar. El respaldo inicial de los cinco archivos locales y sus manifiestos también se conserva.

## Revisión local

Con las dependencias del proyecto disponibles:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5058 --redesign
```

También se puede usar otro Python con `knowledge_base/requirements-dev.txt` instalado. El script crea datos temporales nuevos y un respaldo, y muestra las rutas y enlaces. Contraseña exclusiva de demostración: `atlas-db-demo`. La ruta de la tabla es `http://127.0.0.1:5058/?open=mi-tracker-de-entretenimiento`; volver a ese enlace después del login si se pierde el parámetro.

Revisión propuesta: apariencia de Todo; cambiar a Libros/Terminados y volver; editar una celda y recargar; enfocar un título para revelar OPEN; abrir el panel y leer/editar el cuerpo; comprobar selección y menús. Estas acciones afectan sólo a los ejemplos. El ejemplo no utiliza datos del almacén real ni necesita Notion como entorno de pruebas.

## Validación y evidencia

**Resultado local:** `npm test` aprobado y `npm run build` aprobado, 1106 módulos (JS 4 367,60 kB, CSS 256,57 kB). Las 30 pruebas Python de identidad/migración y caracterización pasan de nuevo. La suite Python completa de 341 pruebas corresponde al cierre de etapa 1; no se presenta como una nueva ejecución completa en esta etapa, que no cambió el backend. Los tests del editor cubren además activación expresa del prototipo, exclusión de tableros/tipos no soportados y conservación de cero, decimales y vacío.

La primera ejecución de pruebas encontró que los SVG definidos como JSX a nivel de módulo se evaluaban al importar el esquema en modo headless; se movieron al componente para evitar esa evaluación anticipada. Las pruebas posteriores pasan. El menú de propiedad se ajustó después de detectar su recorte por el scroll y de comprobar la colocación del portal tras asignar la referencia DOM. Ambos recorridos se verificaron otra vez en el navegador.

Instancias temporales del recorrido: primero `/tmp/atlas-database-demo-9dp2qyij` y, tras detenerse ese proceso, `/tmp/atlas-database-demo-fs517amv`, con sus respectivos respaldos `-backup`. La instancia final sirve en `127.0.0.1:5058`. La disponibilidad del enlace depende de mantener el proceso; el comando anterior permite recrearlo sin acceder al almacén real.

| Evidencia de Atlas | Comprobación y resultado |
| --- | --- |
| V01 — tabla de revisión con panel (`atlas-database-redesign-table.jpg`, evidencia/herramienta local no publicada) | Cuatro registros, seis columnas contando Título, pestañas/herramientas y etiquetas. La captura final incluye el panel de La última estación; V02 muestra la tabla completa durante la selección. El foco en el título revela OPEN. La tabla conserva la misma identidad `db_cccc…`. Se ajustaron sólo los anchos de los ejemplos para la revisión. |
| V02 — selección (`atlas-database-redesign-selection.jpg`, evidencia/herramienta local no publicada) | Marcar una fila muestra la selección y las acciones reales; desmarcarla devuelve la tabla a su estado normal. No se ejecutó eliminar. |
| V03 — menú de propiedades (`atlas-database-redesign-property-menu.jpg`, evidencia/herramienta local no publicada) | Cabecera Estado → Cambiar tipo: las ocho opciones de Atlas se muestran completas fuera del área de scroll. Escape cierra el menú. No se cambió el tipo ni se eliminó/renombró una propiedad. |
| V04 — agrupación funcional (`atlas-database-redesign-grouping.jpg`, evidencia/herramienta local no publicada) | Agrupar por Estado mostró No iniciado (1), En proceso (1) y Terminado (2). Quitar agrupación devolvió las cuatro filas a su orden de origen. También se abrió el menú de ordenación; no se ejecutó una ordenación nueva. |
| V05 — panel lateral (`atlas-database-redesign-peek.jpg`, evidencia/herramienta local no publicada) | OPEN abre la misma página a la derecha, con propiedades y cuerpo, sin desenfocar ni oscurecer toda la tabla. El tema y los marcos del resto de Atlas permanecen en su presentación anterior. |

Se cambió a Libros y se observaron sólo El mapa de las mareas y Ciudad de papel; tras recargar se conservó la vista. Volver a Todo devolvió los cuatro registros. Se editó el título de El mapa de las mareas y se cambió la calificación de Órbita de medianoche de 8,5 a 0; ambos cambios reaparecieron tras recargar. Se restituyeron después los valores del ejemplo. No se afirma haber comprobado todas las combinaciones de filtros/ordenación por ese recorrido.

Se escribió texto en el cuerpo del peek, se cerró y se reabrió después de recargar: el texto reapareció. La automatización lo insertó al principio de un encabezado, por lo que **no se da por validada la navegación Control+End ni deshacer del editor del cuerpo**. Tras cerrar y vaciar los guardados, se restauró sólo ese cuerpo ficticio desde el respaldo de la siembra para presentar el ejemplo limpio; V05 muestra ese cuerpo restaurado. El ensayo no afectó a datos reales ni modificó el editor de bloques general.

Se abrió también la página de aislamiento A/B: no tenía ninguna tabla con `.bn-db-notion-preview`, conservaba sus etiquetas y presentación anteriores, y A/B seguían separadas. La revisión de tableros se limita aquí a la exclusión del estilo y al guard del código; no se declara una nueva validación visual completa del tablero.

Las capturas son de momentos distintos del recorrido. Se usó la conexión de navegador disponible para Atlas local; no REA. No se volvió a inspeccionar Notion en esta etapa. La comprobación de espacios de fuentes y documentación no presenta errores; el bundle generado mantiene la advertencia de un tabulador dentro del literal de una dependencia, ya documentada en etapa 1.

## Lo que sigue abierto

La tabla es una **propuesta para revisión**, no un diseño aprobado ni la finalización de la etapa 2. La siguiente extensión depende de los comentarios de apariencia: refinamiento de densidad y jerarquía, menús completos, tableros/carriles/tarjetas, estados vacíos, paneles y modos de apertura, temas claros y comportamiento responsivo comprobado. Los cambios deben continuar dentro del módulo de bases de datos.

Los filtros y ordenación siguen admitiendo un criterio por vista; agrupación y opciones reutilizan el modelo actual. No se corrigieron el renombrado de propiedades por fan-out ni las actualizaciones concurrentes del índice. No se implementaron fuentes enlazadas entre bloques/páginas ni relaciones. No se afirma una reproducción exacta de Notion ni validación de todos sus estados. El diseño de claro y la revisión exhaustiva en móvil están pendientes; el primer ejemplo reproduce la dirección oscura observada.
