> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Bases de datos: continuación del rediseño aprobado

> Continuación posterior: [Peek ajustado con evidencia real de REA](DATABASE_PEEK_REA_REFINEMENT.md).
> Este documento conserva los resultados históricos de 2B; la reconexión e
> inspecciones REA R02–R04 ocurrieron después de aquella implementación.

16 de octubre de 2026. Rama `feat/database-identity-stage1`; trabajo local sin commit/push/despliegue. Se conserva la etapa de identidad y el [primer prototipo](DATABASE_REDESIGN_STAGE2.md), cuya dirección visual fue aprobada por el usuario. Este documento describe su continuación; el objetivo de paridad fina con Notion permanece abierto según los límites indicados.

## Base de trabajo y referencias

Se revisaron rama, cambios locales e instrucciones antes de editar. No se cambió de rama ni se ejecutó pull/reset. Los 37 archivos locales modificados o sin seguimiento se respaldaron, con manifiesto SHA-256, en `/tmp/atlas-database-approved-baseline-sgarjv4m`. `AUDIT.md` y los respaldos anteriores se conservan.

Se reutilizaron las capturas tabla de Notion (`notion-database-test-rows.jpg`, evidencia/herramienta local no publicada), Peek con cuerpo (`notion-database-peek-body.jpg`, evidencia/herramienta local no publicada) y las evidencias N01–N22 de [NOTION_DATABASE_EVIDENCE.md](NOTION_DATABASE_EVIDENCE.md). **En esta continuación no se abrió Notion ni se utilizó REA.** La inspección previa documentada se hizo con la conexión de navegador, mientras REA no logró conectarse. Ningún cambio de Atlas constituye una observación nueva de Notion.

La densidad, medidas CSS, iconos SVG, adaptación de las vistas secundarias y soporte de tipos locales son decisiones de implementación apoyadas en esas referencias y en los requisitos del usuario. No son valores extraídos del CSS de Notion ni una comprobación de todos sus menús/variantes. El resto de la apariencia de Atlas queda fuera del cambio.

## Implementación y separación de responsabilidades

- `database_api.py`: esquema canónico serializado dentro del bloque Markdown de la página propietaria, consultas por `parent_id + database_id`, guardado selectivo de una fila en SQLite, validación, cálculo, relaciones, archivos, papelera y recuperación.
- `DatabaseWorkspace.jsx`: herramientas, pestañas, tabla, menú de columnas, filtros/ordenaciones, previsualización y configuración de vistas. Las acciones de esquema se serializan y comprueban la revisión del Markdown antes de escribir.
- `databaseModel.js`: normalización compatible con los antiguos esquemas planos, filtros, ordenaciones, agrupación, cálculos y cola de guardado que conserva el último borrador tras un fallo.
- `databaseUI.jsx`: editores de celda, etiquetas, portales y propiedades reutilizadas en Peek y página completa. `databasePropertyConfig.jsx`: opciones, colores, grupos y configuración específica por tipo.
- `databaseViews.jsx`: representaciones diferenciadas de los mismos registros. No crea copias al cambiar o crear una vista.
- `database-workspace.css`: estilos acotados a `.adb-*` y al Peek de registros; no cambia el tema general de Atlas.
- `main.jsx`/`app.js`: el Peek usa el mismo `BlockEditor.create`, esquema de bloques, menús slash, barra de edición y carga/serialización que una página normal. El contexto de página/editor es independiente; también se conserva al crear una subpágina desde el Peek.

El renderer se remonta al cambiar `database_id`, para que una reparación de identidad de un bloque copiado no reutilice el estado de la fuente anterior. Un bloque nuevo se guarda en su página antes de conectar su API si aún no está serializado en disco.

La ruta heredada de `customBlocks.jsx` sigue disponible para bloques sin identidad. Las filas antiguas ambiguas se muestran como registros sin asignar; no se unen a ninguna base nueva ni se reasignan automáticamente.

## Matriz funcional

| Requisito | Implementado localmente | Adaptación o límite |
| --- | --- | --- |
| Herramientas | Iconos de filtro, ordenación, búsqueda, configuración y más opciones; tooltips y etiquetas accesibles; estados activos; botón Nuevo. | Agrupación, altura y presentación están en configuración. No se añade automatización/IA decorativa. |
| Peek | Título, acciones superiores, propiedades discretas y cuerpo separado; botón, Escape y clic exterior. Reconoce portales de propiedades y BlockNote y el diálogo de subpáginas propio. | Falta una matriz exhaustiva de todos los diálogos de plugins de BlockNote y navegación de teclado. No se afirma haberla probado completa. |
| Guardado del Peek | Espera propiedades y cuerpo antes de destruir el editor o abrir otra página. Serializa escrituras; mantiene borrador y panel ante fallo, permite reintentar y descargar copia; conserva borradores de cuerpo/celdas en la sesión del navegador. | La copia de sesión no sustituye un respaldo del servidor. Si se borra la sesión del navegador se pierde esa copia local. |
| Propiedades compartidas | Nombre, tipo y configuración pertenecen a la fuente. Editar una celda actualiza sólo esa fila. Los nombres/tipos/opciones proyectados son canónicos también en página completa. | Las propiedades archivadas conservan sus valores originales. Los endpoints antiguos ajenos al nuevo módulo no se han reescrito todos. |
| Menú de columna | Nombre, configuración/tipo, filtros, orden, grupo, cálculo, congelación, ocultación, ajuste, insertar antes/después, duplicar y eliminar recuperable. | Nombre/tipo/opciones/inserción/duplicación/eliminación cambian el esquema. Visibilidad, anchos, ajuste, congelación y cálculo sólo cambian la vista actual. |
| Opciones de Estado/Selección | Edición de nombres, colores y grupos de Estado; renombrado de opciones actualiza los registros. | Retirar una opción conserva sus valores existentes; no se los reemplaza por otra opción. |
| Conversiones | Diagnóstico previo; HTTP 409 ante incompatibilidades. La aceptación explícita mantiene valores incompatibles con advertencia y tipo original. Cambiar a calculada requiere reconocer valores previos. | Restauración completa condicionada a que no haya cambios posteriores; si los hay, descargar copia y recuperar valores concretos. |
| Vistas | Once tipos, pestañas con nombre/icono, previsualización inmediata antes de crear, configuración persistente y propia de cada vista. Filtros AND/OR y varias ordenaciones. | Los filtros no incluyen toda la gramática anidada ni los operadores relativos de Notion. La búsqueda de nombre es temporal. |
| Identidad | Todas las vistas consultan los mismos IDs. Las otras bases permanecen aisladas; cuerpo y orden de las filas no se recrean. | No se han migrado datos reales. Bloques independientes conservan identidades distintas; no se añadió una interfaz de fuentes enlazadas entre bloques. |

## Tipos de propiedad

| Tipos | Comportamiento real |
| --- | --- |
| Texto, Número, URL, Teléfono, Correo, Fecha | Edición y validación por tipo; número finito, correo/URL y fecha ISO. Cero y falso se conservan. Formatos numérico/porcentaje/USD. Enlaces externos, correo y teléfono con acción de apertura. El editor de Fecha selecciona días; no reproduce el selector completo de horas de Notion. |
| Selección, Selección múltiple, Estado | Opciones del esquema y colores; selección de una o varias; grupos de Estado configurables. |
| Casilla | Valor booleano real, no texto. |
| Persona | Lista con el usuario local `owner`, mostrado como Propietario. Atlas tiene una contraseña de propietario; no se inventan miembros ni cuentas externas. |
| Archivos y multimedia | Adjuntos locales de hasta 20 MB, identificador seguro, nombre/tamaño persistidos y descarga; previsualización de imágenes permitidas en tarjetas. No integración con bibliotecas externas. |
| Relación | Elegir una fuente existente, seleccionar IDs de sus registros y mostrar sus títulos. Se rechazan referencias a otra base distinta de la configurada. Es un vínculo unidireccional; no se simula una relación inversa automática. |
| Rollup | Relación y propiedad de destino; contar, sumar, promedio, mínimo y máximo numéricos. |
| Fórmula | Intérprete restringido sin `eval`: aritmética, `prop`, `concat`, `round`, `length`, `ifelse`; detección de dependencias circulares y error visible. No implementa el lenguaje completo de Notion. |
| Botón | Acción local que establece un valor validado en una propiedad del mismo registro. Debe configurarse; los errores se muestran. No simula automatizaciones externas. |
| ID | Prefijo configurable más UID persistente de la página. No es un contador secuencial de Notion. |
| Lugar | Nombre, latitud y longitud validados; fuente de la vista Mapa. No consulta geocodificación ni envía ubicaciones a terceros. |
| Creación, última edición, creado por y editado por | Fechas de metadatos del servidor y propietario local. Se conservan fechas antiguas existentes; una fecha histórica ausente no se inventa. |

Quedan excluidos Google Drive, Figma, GitHub Pull Requests, Zendesk y autocompletado mediante IA.

## Vistas y configuración

| Vista | Función y opciones actuales | Extensión pendiente |
| --- | --- | --- |
| Tabla | Cuadrícula editable, selección, OPEN, propiedades, filtros/orden/grupo, cálculo, anchos, ajuste, congelación, visibilidad y altura. | Navegación de hoja de cálculo completa, reordenación de columnas por arrastre y más operadores específicos. |
| Board | Carriles de agrupación y tarjetas reales; arrastrar actualiza la propiedad editable de grupo, sin duplicar IDs. Icono, ajuste, color, Side Peek/página, previsualización, tamaño, compacto/lista. | Orden manual de tarjetas dentro del grupo, colapsar grupos y más variantes visuales. |
| Galería | Tarjetas, contenido o imagen, tamaño, icono y propiedades visibles con los mismos editores de celda. | Elegir una propiedad concreta como portada y más modos de recorte. |
| Lista | Filas compactas con título y propiedades editables/visibles. | Distribuciones y densidades adicionales. |
| Calendario | Mes navegable, registros por propiedad de fecha, apertura en Peek y creación en un día. Registros sin fecha accesibles. | Arrastrar entre fechas, intervalos y vista semanal. |
| Timeline | Barras reales de inicio/fin, apertura de los registros, escala diaria y lista sin fecha. | Arrastrar/redimensionar barras, zoom temporal y dependencias. |
| Gráficos | Barras por grupos, conteo/suma/promedio y acceso a registros del grupo. | Otros tipos de gráfico y ejes/opciones avanzadas. |
| Dashboard | Métricas de número de registros y sumas numéricas más gráfico configurable. | Constructor de widgets y distribución libre. |
| Feed | Tarjetas cronológicas por creación/edición, extracto de cuerpo y propiedades. | Comentarios, reacciones y cronología colaborativa; no se muestran controles falsos. |
| Mapa | Proyección local de coordenadas, marcadores y apertura por teclado/selección; sin proveedor externo. | Mapa de calles, búsqueda geográfica, zoom y agrupación de marcadores. No se presenta como equivalente completo al mapa de Notion. |
| Formulario | Formulario autenticado que crea un registro en la fuente; editores reales por tipo y propiedades visibles configurables. | Publicación externa, validaciones avanzadas, lógica condicional y diseño completo de formularios. |

Sólo se muestran ajustes con efecto en la representación correspondiente. Las vistas secundarias son implementaciones iniciales funcionales; no se declaran cerradas sus diferencias visuales o de interacción con Notion.

## Respaldo, conservación y recuperación

Antes de un cambio de esquema se crea `DATA_ROOT/data/database_recovery/<id>/snapshot.json`, con Markdown anterior/posterior y metadatos anteriores/posteriores de las filas afectadas. Un fallo antes de finalizar deja el estado `prepared`, que debe revisarse con esa copia; no existe una transacción única de sistema de archivos y SQLite resistente a toda interrupción de proceso. Las escrituras API usan transacciones SQLite y sustitución de archivo; los lectores de fuente se serializan con sus escritores. No se afirma que los antiguos endpoints de todo Atlas tengan esta misma disciplina.

La revisión SHA-256 rechaza operaciones sobre Markdown cambiado. `_schema_version` impide que un autoguardado de página con un esquema anterior sobrescriba un cambio reciente de la API. Se conserva la compatibilidad de filtros/ordenación/cálculos/anchos/altura de los esquemas planos y de `__title`; una lectura no reescribe la página.

El menú «Más opciones» permite descargar respaldos y restaurarlos. La restauración completa se bloquea cuando la página o las filas afectadas cambiaron después, para no borrar trabajo posterior. Las propiedades eliminadas se archivan y pueden restaurarse sin perder sus valores. Los registros eliminados entran en la papelera de su base y se restauran con el mismo ID; se conserva además copia de metadatos/cuerpo en `database_deleted` y no se borra su Markdown.

El deshacer del editor de página no sustituye la restauración de un cambio de esquema ya confirmado por la API: una versión antigua del esquema se rechaza, y se utiliza su respaldo para recuperarlo. El migrador de identidad y sus respaldos no se sustituyen. Los registros ambiguos se resuelven con un mapa explícito mediante el procedimiento de la etapa 1.

## Pruebas y evidencia de esta continuación

Validación final: **350 pruebas Python aprobadas** (`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DATA_ROOT=/tmp/atlas-workspace-full-test-bootstrap /tmp/atlas-stage1-venv/bin/python -m pytest knowledge_base/tests -q`). Incluye nueve contratos nuevos de la API del workspace y los contratos anteriores de identidad/migración. Las 19 advertencias son de `datetime.utcnow()` en módulos anteriores de asistente/mapas conceptuales.

`npm --prefix knowledge_base/editor-src test` aprobado: pruebas existentes más cola de guardado, valores incompatibles, compatibilidad de vistas antiguas, filtros, ordenación, cálculos y renderizado diferenciado de diez vistas alternativas. Se agregó una regresión para el gráfico de conteo sin propiedad numérica: ese caso falló durante la revisión y fue corregido. `npm --prefix knowledge_base/editor-src run build` aprobado (1112 módulos; bundle y CSS regenerados). `node --check` de los dos scripts estáticos aprobado.

La comprobación de espacios de fuentes/documentación y de los archivos nuevos pasó. `git diff --no-index --check /dev/null <archivo>` devolviendo 1 sin salida significa diferencias respecto a un archivo vacío, no errores de espacios. El bundle conserva el tabulador del literal de una dependencia ya registrado en la etapa 1; no se alteró ese literal para ocultar la advertencia.

Pruebas API sobre almacenes temporales: aislamiento entre bases, mismos IDs en vistas, persistencia de ajustes, renombrar/duplicar/archivar/restaurar propiedades, cuerpo compartido, conversión bloqueada/aceptada y recuperación con conflictos, archivos, persona local, lugar, relaciones, rollup, fórmula segura/circular, botón, propiedades automáticas, valores inválidos y papelera. Pruebas del cliente: no descartar la última edición durante una escritura en curso y retener el borrador tras fallo.

En navegador se verificó directamente, sólo en el demo temporal:

- Tabla final (`atlas-database-workspace-table.jpg`, evidencia/herramienta local no publicada): herramientas con iconos, pestañas persistentes y propiedades; el (+) permanece disponible al desbordar las pestañas. Tabla, Board, Galería y Lista muestran los cuatro registros de la misma fuente. Arrastrar «El mapa de las mareas» entre carriles cambió Estado y la tabla reflejó el cambio. Board (`atlas-database-workspace-board.jpg`, evidencia/herramienta local no publicada).
- Editar Estado desde su selector portal conservó abierto el Peek y actualizó el Board de fondo. El cuerpo editado persistió al cerrar exteriormente y apareció en página completa junto con las mismas propiedades canónicas. La automatización insertó texto en medio de un párrafo/lista: se verifica persistencia, no navegación End/Control+End ni una edición editorial limpia.
- Crear una propiedad URL desde (+), buscar tipo, renombrar «Enlace de prueba» a «Referencia», editar su valor desde Lista y ocultarla sólo en Todo. Renombrar una opción de Estado a «Por empezar» actualizó el valor de la fila; se configuró su grupo.
- Crear Agenda desde Calendario mostró inmediatamente el mes y el panel de configuración. Después de esperar el guardado, recargar mantuvo Agenda activa y las cuatro páginas en sus fechas. Calendario (`atlas-database-workspace-calendar.jpg`, evidencia/herramienta local no publicada).
- Se impidió temporalmente escribir **sólo en `.history` del demo**, para provocar un HTTP 500 real. El clic exterior mantuvo el Peek y su texto, con reintento y descarga. Se restauraron inmediatamente los permisos originales; Reintentar guardó el borrador y permitió cerrar. El mismo fallo afectó al guardado de configuración de la página de fondo, cuyo error también se mostró. Error recuperable (`atlas-database-workspace-save-error.jpg`, evidencia/herramienta local no publicada).

- Se crearon y guardaron las vistas Timeline, Gráficos, Dashboard, Feed, Mapa y Formulario desde (+). El gráfico sumó Calificación por Estado; Dashboard mostró 4 registros y suma 24,5 en ese momento. Mapa representó cuatro coordenadas de prueba. Timeline (`atlas-database-workspace-timeline.jpg`, evidencia/herramienta local no publicada), gráfico (`atlas-database-workspace-chart.jpg`, evidencia/herramienta local no publicada), mapa (`atlas-database-workspace-map.jpg`, evidencia/herramienta local no publicada).
- Formulario creó «Registro creado desde formulario» con calificación 0; apareció en Lista, incrementando la fuente a cinco registros. Dentro de su Peek se abrió el slash completo y el diálogo de subpágina; cancelarlo conservó el Peek. Se eligió Lista de Verificación por búsqueda slash y Enter, se escribió y marcó la tarea; la página completa conservó texto y estado. Slash (`atlas-database-workspace-slash.jpg`, evidencia/herramienta local no publicada), página completa (`atlas-database-workspace-full-page.jpg`, evidencia/herramienta local no publicada). No se declara probado cada bloque multimedia ni todas las selecciones con ratón de ese menú.
- En la tabla final, Tab desde el título reveló OPEN; abrirlo mostró el mismo registro y un clic en la pestaña actual cerró el Peek sin cambiar de vista. El (+) de vistas permaneció visible aunque hubiese trece pestañas de prueba.
- Escape dentro de un selector de Estado cerró el selector y mantuvo el Peek; Escape en el título cerró el Peek. Peek final (`atlas-database-workspace-peek.jpg`, evidencia/herramienta local no publicada). A/B conservaron sólo Alfa/Beta respectivamente; alternar la otra pestaña de A no mostró Beta. El detalle de recuperación abrió la fila ambigua sin asignarle fuente.
- Se retiró el marco azul de selección de bloque que aparecía alrededor del workspace nuevo; los controles conservan sus propios indicadores de foco. El cambio se limita al bloque de base de datos.

Para dejar una presentación limpia, se restauró **sólo el cuerpo ficticio de El mapa de las mareas** desde la copia inicial después de verificar el guardado. La edición utilizada en las pruebas se conserva en `/tmp/atlas-database-demo-hjrjs3m0/verified-body-before-clean-preview.md`. El registro creado desde Formulario conserva su bloque de verificación real. `AUDIT.md` original coincide por SHA-256 con el respaldo previo.

No se inspeccionó de nuevo Notion. No se considera que una prueba de renderizado estático sustituya una revisión de interacción completa de cada vista.

## Demo y revisión local

Servidor aislado en `http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento`, contraseña temporal `atlas-db-demo`. Datos y copia inicial en `/tmp/atlas-database-demo-hjrjs3m0` y `/tmp/atlas-database-demo-hjrjs3m0-backup`. Todos sus registros son ficticios. El directorio temporal puede desaparecer al limpiar `/tmp`.

Para crear otro ejemplo limpio:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --redesign
```

Para reabrir este mismo ejemplo sin sembrarlo ni migrarlo otra vez, cuando el puerto esté libre:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --resume-demo /tmp/atlas-database-demo-hjrjs3m0
```

`--resume-demo` acepta sólo directorios marcados `atlas-database-demo-*` dentro de `/tmp`. Los datos reales no se leen ni migran. Para revisar: alternar Todo/Board/Galería/Lista, abrir una tarjeta y editar propiedades/cuerpo, cerrar exteriormente, reabrir como página y recargar; usar los dos (+), menú de encabezado, configuración de vista y menú Más opciones para recuperación. Las vistas nuevas conservan los mismos registros.
