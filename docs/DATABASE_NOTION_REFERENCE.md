> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

> Estado posterior: la continuación del diseño aprobado y las funciones actuales se documentan en [DATABASE_WORKSPACE_STAGE2B.md](DATABASE_WORKSPACE_STAGE2B.md). Esta referencia conserva la separación entre lo observado en Notion y las diferencias históricas de Atlas.

# Bases de datos de Atlas: diagnóstico y propuesta a partir de Notion

> Alcance ampliado: [plan de dos etapas](DATABASE_PLAN.md). Identidad/migración es la etapa 1; el [rediseño visual](DATABASE_REDESIGN_STAGE2.md) sigue abierto y empieza con una tabla funcional para revisión antes de extenderse a otras bases y vistas.

> Actualización posterior: [etapa 1 de identidad de Atlas](DATABASE_IDENTITY_STAGE1.md). Se integró esta documentación local tras actualizar main por fast-forward. Las observaciones y los intentos de conexión que siguen conservan su carácter histórico; durante la implementación no se accedió a Notion.

Fecha: 16 de octubre de 2026. Estado: diagnóstico y propuesta; sin implementación, migración, commit ni push.

Repositorio verificado: `origin = git@github.com:Codevhn/mision_python.git`, rama `main`, revisión `2ef281db1fb0ea8b94836e83b8da5d8554e9b568`. Se respetaron las instrucciones de respuesta del usuario. No se localizaron archivos `AGENTS.md` aplicables dentro del proyecto ni en los directorios ascendentes consultados.

## Alcance y continuidad del diagnóstico

Se revisaron propiedades, edición de celdas, vistas, filtros, ordenación, agrupación y apertura de registros como páginas. Por indicación posterior del usuario se amplió la revisión al cuerpo editable del peek y a los menús «+» de vistas, fuentes y relaciones. La referencia fue la base privada «Base privada de referencia», en la pestaña ya autenticada del usuario. Tras las revisiones iniciales de lectura, el usuario autorizó crear dos filas de prueba, completar sus columnas y añadir contenido a una de sus páginas.

**REA no consiguió conectarse a Notion.** El descubrimiento HTTP falló y el WebSocket agotó su plazo incluso después de la autorización comunicada por el usuario. La inspección que sí se realizó fue mediante la conexión de navegador disponible, con lecturas AX/DOM y capturas visuales. Los resultados y los errores de REA están separados en el [registro de evidencia](NOTION_DATABASE_EVIDENCE.md). Ninguna observación de Notion de este informe se presenta como un resultado de REA.

La búsqueda inicial no encontró `DATABASE_AUDIT.md` en el checkout ni en el historial local disponible. **La verificación posterior encontró [docs/DATABASE_AUDIT.md en el main remoto](https://github.com/Codevhn/mision_python/blob/1e18bcde9fe91ca6f5f0c8126ec61e7d25670403/docs/DATABASE_AUDIT.md)**, junto con [su evidencia](https://github.com/Codevhn/mision_python/blob/1e18bcde9fe91ca6f5f0c8126ec61e7d25670403/docs/DATABASE_AUDIT_EVIDENCE.json). Las referencias remotas almacenadas localmente estaban desactualizadas. Se leyeron ambos archivos mediante consultas a GitHub, sin traer cambios al checkout ni sobrescribir documentos.

El informe remoto analizó la revisión `6e84f20503e379552fdc3a3d0a3a325ad96838c5` y ya documenta ensayos de API y navegador sobre aislamiento de bases, filtro/orden único y desincronización de propiedades. Informa siete pruebas de caracterización y 318 pruebas de servidor aprobadas; son resultados atribuidos a ese informe, **no pruebas ejecutadas de nuevo en esta sesión**. Este documento aporta el contraste con Notion y amplía la propuesta; debe reconciliarse con ese diagnóstico existente, no sustituirlo ni repetir su auditoría.

La declaración de REA no disponible y Notion no analizado en el informe remoto corresponde a **otra sesión**. En esta sesión REA sí expuso herramientas y respondió al diagnóstico, pero su conexión a la pestaña falló. Notion se inspeccionó aquí con la conexión de navegador. Las dos fuentes de evidencia conservan esa distinción.

## Estado comprobado antes de implementar

Verificación del 16 de octubre de 2026:

| Elemento | Estado observado |
| --- | --- |
| Rama y HEAD del checkout | `main`, `2ef281db1fb0ea8b94836e83b8da5d8554e9b568`. |
| Referencia origin/main almacenada localmente | También `2ef281d`; no refleja el main remoto actual. |
| Main remoto consultado en vivo | `1e18bcde9fe91ca6f5f0c8126ec61e7d25670403`, tres commits por delante, ninguno exclusivo del checkout local según la comparación remota. |
| Cambios de archivos versionados / staging | Ninguno. Los diff del árbol de trabajo y del índice estaban vacíos. |
| Archivos sin seguimiento | `AUDIT.md` preexistente; este informe; `NOTION_DATABASE_EVIDENCE.md`; las dos capturas `notion-database-*.jpg`. No se añadieron al índice. |
| Búsqueda de DATABASE_AUDIT.md | Ausente de las dos ramas locales y de las puntas de las referencias remotas almacenadas localmente; presente en el main remoto en vivo. Las otras ocho ramas remotas anunciadas conservaban los SHA de sus referencias locales, cuyos árboles también se comprobaron. |
| Cambios remotos respecto a este checkout | Incluyen `app.py`, `markdown.js`, bundle, estilos y pruebas, además del diagnóstico. Los enlaces de código local de este informe siguen referidos a `2ef281d`; no se consideran una revisión de toda la implementación remota. |

Se usó `git ls-remote --heads origin` para consultar las nueve ramas remotas. El primer intento falló por los permisos de la configuración SSH; el reintento autorizado fuera del entorno restringido respondió correctamente. Se inspeccionó el árbol completo del nuevo SHA de main mediante la API de GitHub (`truncated: false`) y se compararon los commits. No se ejecutaron `git pull`, `git fetch`, checkout, merge, reset, stash, commit ni push. El HEAD y las referencias Git locales permanecieron intactos.

### Comandos marcados como Failed

Se repitieron por separado los dos comandos señalados, capturando código de salida, stdout y stderr:

| Comando | Código | stdout / stderr | Diagnóstico |
| --- | --- | --- | --- |
| `git diff --no-index --check /dev/null docs/DATABASE_NOTION_REFERENCE.md` | `1` | Ambos vacíos | Diferencia de un archivo con contenido respecto a `/dev/null`; sin diagnóstico de espacios. |
| `git diff --no-index --check /dev/null docs/NOTION_DATABASE_EVIDENCE.md` | `1` | Ambos vacíos | Mismo resultado; sin diagnóstico de espacios. |

Como control sin crear archivos se comparó `/dev/null` con texto enviado por stdin: `texto\n` devolvió `1` y ninguna salida; `texto \n` devolvió `3` y el mensaje `trailing whitespace`. Por tanto, la etiqueta Failed de los dos comandos originales refleja un retorno distinto de cero por diferencias, **no un fallo de espacios en estos documentos**. No se necesita corregirlos por ese motivo. Las verificaciones de espacios realizadas sobre los archivos también fueron satisfactorias.

## Comprobaciones directas en Notion

| Área | Comprobado | Evidencia y límite |
| --- | --- | --- |
| Estructura | Seis cabeceras originales y siete vistas. El estado final contiene el ejemplo vacío del usuario y dos filas de prueba nuevas: un libro pendiente y una película terminada. | N12, N16 y N22. Se conservaron las columnas, vistas y fuente originales. |
| Propiedades | Calificación distingue cero, decimal y vacío; Estado usa opciones en tres grupos; Género permite varios valores y Tipo uno. Se guardaron números, texto, estados y etiquetas. | N16. Valores comprobados tras cerrar/reabrir y recargar; no se probaron entradas inválidas. |
| Esquema y vistas | La interfaz separa `View settings` de `Data source settings`; una leyenda indica que los ajustes de una propiedad se aplican a todas sus vistas. Las vistas conservan la página y cambian el parámetro `v`. | N02 y N07. No se analizó el modelo interno de Notion. |
| Filtros | Se observaron el acceso avanzado y operadores de Estado. Con los datos nuevos, Libros mostró sólo el libro y Terminados sólo la película terminada. | N05 y N19. El resultado efectivo quedó verificado sin cambiar reglas; la incertidumbre inicial del marcador `Select an option` queda superada para estos casos. |
| Ordenación | Selector por propiedad y direcciones numéricas ascendente/descendente desde la cabecera. | N06. No se aplicó ordenación ni se verificaron varios criterios. |
| Agrupación | El ejemplo vacío aparece en No Estado, el libro en To-do y la película en Complete. Arrastrar el libro a In progress cambió su Estado a En progreso; se restableció Pendiente desde la página. | N18. Se comprobó el cambio del valor por arrastre y su restauración final. |
| Presentación por vista | El tablero muestra Título y lista las otras cinco propiedades como ocultas. | N09. No se accionaron interruptores de visibilidad. |
| Registros como páginas | OPEN aparece a la derecha del título al pasar el puntero y abre directamente el peek. Se comprobó página lateral y completa, y la conservación de valores al reabrir. | N14 y N17. Center peek sigue comprobado sólo como opción de menú. |
| Edición de celdas | Se guardaron las cinco propiedades y el título de dos filas nuevas; se verificó cero, decimal, selección simple y múltiple. Una nota editada desde el peek se reflejó en la tabla. | N16. Se recargó la base y se leyeron los valores guardados; no se probaron conflictos o valores inválidos. |
| Cuerpo del peek | Se añadieron un encabezado, un párrafo y dos elementos de lista al cuerpo de la segunda página. Persistieron tras cerrar, recargar y abrir con OPEN, separados de sus propiedades. | N20. El menú ofrece más bloques, pero sólo se ejecutaron estos tres tipos. |
| Los dos «+» y conexiones | Add view ofrece diseños y New data source; el «+» de cabeceras ofrece propiedades, incluidas Relation y Rollup. Se consultaron el selector de Relation y la administración de fuentes. | N21–N22. No se eligió una fuente externa ni se creó relación; la vista provisional del flujo de enlace fue retirada. |

No se publicaron páginas ni se cambiaron permisos. Las escrituras se limitaron a los dos registros de prueba autorizados y a retirar elementos provisionales: una plantilla vacía creada por error quedó recuperable en Trash y la vista Table que añadió el selector de fuentes fue eliminada. La fuente original conserva sus siete vistas y seis columnas, sin fuentes externas enlazadas. No se modificaron las reglas de las vistas existentes. No se probaron colaboración, automatizaciones, IA, fórmulas ni cálculos de rollup.

## Qué tiene ya Atlas y qué diferencias se comprobaron

Las afirmaciones sobre Atlas proceden de lectura del código local, no de una prueba del sistema publicado. Los comentarios antiguos que comparan Atlas con Notion no se toman como evidencia del comportamiento actual de Notion.

| Área | Implementación existente de Atlas | Diferencia o límite |
| --- | --- | --- |
| Identidad y filas | El bloque guarda esquema en `block.props.data`; toma `window._currentEntryId`, consulta `/api/entry/{pageId}/children` y conserva todos los hijos marcados `db_row`. | No aparece un identificador persistente de base ni pertenencia por base en ese recorrido. Dos bloques de la misma página consultarían el mismo conjunto de filas. Es una inferencia directa del flujo de código; no se reprodujo en ejecución. [customBlocks.jsx:452,614](../knowledge_base/editor-src/src/customBlocks.jsx#L452), [app.py:2926](../knowledge_base/app.py#L2926). |
| Persistencia del bloque | El Markdown conserva el JSON dentro de `:::database`; el analizador genera un nuevo `id` de bloque al cargarlo. | El identificador del bloque React/BlockNote no sirve como identidad persistente de base. La futura identidad debe sobrevivir dentro de los datos serializados. [markdown.js:235,413](../knowledge_base/editor-src/src/markdown.js#L235). |
| Propiedades | Ocho tipos: texto, número, selección, multiselección, estado, fecha, casilla y URL. Columnas identificadas por `id`; opciones de selección compartidas en el esquema del bloque. | Hay una base funcional útil. Notion ofrece ajustes de número y grupos/opciones de Estado configurables; Atlas usa estados fijos duplicados entre dos módulos. [customBlocks.jsx:105,176,758](../knowledge_base/editor-src/src/customBlocks.jsx#L105), [properties.js:6,18](../knowledge_base/static/properties.js#L6). |
| Edición de celdas | Texto editable, número/URL con input, casilla directa y selectores para etiquetas/estado. Fecha abre la página. El título de fila es un botón de apertura. | En Notion, el título se edita con un clic normal y OPEN lo abre por separado (N17). El cero se conservó en Notion tras recarga; `parseFloat(value) || ""` lo convierte en vacío en los caminos leídos de Atlas: defecto deducido del código, sin reproducción en Atlas. [customBlocks.jsx:138,1070,1127](../knowledge_base/editor-src/src/customBlocks.jsx#L1070), [properties.js:189,336](../knowledge_base/static/properties.js#L189). |
| Esquema frente a valores | La fila almacena objetos con `id`, `name`, `type` y `value`; la tabla consulta por `id`. Renombrar una columna propaga nombres a filas mediante PATCH separados. | El panel de página puede renombrar o quitar su copia de una propiedad sin modificar el esquema del bloque. Cambiar el tipo de columna actualiza el esquema, sin una conversión equivalente de todas las propiedades guardadas. Riesgo de desajuste tabla/página. [customBlocks.jsx:769,789,847](../knowledge_base/editor-src/src/customBlocks.jsx#L769), [properties.js:104,570](../knowledge_base/static/properties.js#L104). |
| Guardado | Las celdas y el panel envían el array completo de propiedades; el servidor lo reemplaza y guarda el índice mediante SQLite. | No hay validación contra un esquema de base ni revisión esperada en `update_properties`. La transacción del índice no evita por sí sola perder una edición concurrente derivada de una lectura anterior. Es riesgo del diseño, no una pérdida reproducida. [app.py:292,2735](../knowledge_base/app.py#L2735). |
| Vistas | Tabla y tablero, varias pestañas, cambio de nombre/tipo y eliminación; esquema compartido, filtro/orden/grupo/cálculo/altura/ancho del título por vista. Migración del formato plano en memoria, escrita al editar. | No hay que reconstruir estas funciones. Notion además permite visibilidad de propiedades por vista; Atlas recorre `schema.columns` en tabla y tarjetas, sin una lista de visibilidad propia de cada vista. El ancho de las columnas ordinarias sigue en el esquema común. [customBlocks.jsx:52,67,125,632,1185,1469,1533](../knowledge_base/editor-src/src/customBlocks.jsx#L52). |
| Filtros | Un objeto `filter` por vista: contiene texto, igualdad de estado/selección, pertenencia de multiselección y casilla. | Sin árbol de condiciones ni operadores explícitos de vacío, desigualdad o comparación numérica/fecha. Números y fechas caen en comparación textual para ese filtro. [customBlocks.jsx:222,1263](../knowledge_base/editor-src/src/customBlocks.jsx#L222). |
| Ordenación | Un objeto `sort`, ascendente/descendente; cálculo sobre una copia de las filas. | Preserva el orden manual almacenado. No hay lista de criterios. La ordenación múltiple sería una ampliación propuesta; no se verificó en esta sesión de Notion. [customBlocks.jsx:246,995,1317](../knowledge_base/editor-src/src/customBlocks.jsx#L995). |
| Agrupación | Una propiedad por vista, colapso temporal, grupos y tablero con colores; arrastre de tarjeta cambia el valor. | Notion mostró agrupación por grupo de Estado y controles persistentes de visibilidad/fijación; Atlas agrupa por etiquetas fijas. La multiselección se agrupa por el conjunto unido y no se ofrece para carriles del tablero; no se comprobó la semántica equivalente de Notion con datos. [customBlocks.jsx:176,198,265,292,499,894](../knowledge_base/editor-src/src/customBlocks.jsx#L265). |
| Apertura de registros | Cada fila es una entrada real con propiedades y cuerpo; `_openPagePeek` carga un editor editable y vacía guardados pendientes al cerrar. | Conservar este mecanismo. No se encontraron modos de apertura por vista equivalentes a Side peek/Center peek/Full page. El contexto global `_currentEntryId` cambia al abrir el peek: conviene sustituirlo por contexto explícito de cada editor/base. [customBlocks.jsx:861](../knowledge_base/editor-src/src/customBlocks.jsx#L861), [app.js:12831,12875](../knowledge_base/static/app.js#L12831). |
| Cuerpo y conexiones | El peek de Atlas ya monta BlockEditor para el cuerpo. Las propiedades disponibles no incluyen Relation ni Rollup y las vistas del bloque usan su mismo esquema y conjunto de filas. | El cuerpo editable no debe tratarse como función ausente ni confundirse con Notas. Las conexiones entre fuentes y registros requerirían un modelo explícito adicional; no se verificó su funcionamiento en Notion, sólo sus selectores. [app.js:12870](../knowledge_base/static/app.js#L12870), [customBlocks.jsx:105,125,614](../knowledge_base/editor-src/src/customBlocks.jsx#L105). |

La compatibilidad actual considera filas a hijos antiguos sin `db_row` cuando su tipo es `page`; además, mover una página fuera desactiva `db_row`. Cualquier migración debe conservar y revisar ambas reglas, no reemplazarlas mediante una asignación indiscriminada. [app.py:1316,1738,2938](../knowledge_base/app.py#L2938).

## Propuesta por etapas

Estas etapas son una propuesta para revisión. No autorizan ni ejecutan cambios.

### 1. Identidad independiente y conservación de los datos

Introducir una identidad persistente de base/fuente en el JSON serializado y una pertenencia explícita de cada fila, separadas de `parent_id`, del `id` temporal de BlockNote y de los identificadores de vista. Distinguir desde el diseño el contenedor visual, la fuente que posee registros y esquema, la vista y la página de registro; al principio puede mantenerse una fuente por base. Para nuevas bases independientes, generar identidad propia; añadir vistas no debe duplicar filas. El contexto del editor debe recibir explícitamente la página y la fuente a las que pertenece.

Antes de migrar, producir un inventario sobre una copia consistente: páginas contenedoras, bloques `:::database`, esquemas, vistas, hijos `db_row`, hijos antiguos sin bandera y propiedades sin correspondencia. Reutilizar el mecanismo existente de snapshot SQLite para una copia coherente del índice y conservar también Markdown e historial. No ejecutar el servidor sobre los datos originales para hacer ese inventario: `load_index()` puede realizar migraciones.

Definir un manifiesto de correspondencias y un formato versionado. Con una base inequívoca por página, mantener los identificadores de entrada, propiedades, valores, cuerpos, orden, iconos, hijos y vistas; añadir pertenencia sin recrear registros. Si una página tiene varios bloques antiguos, todos consultaban las mismas filas: **no es posible deducir automáticamente a cuál pertenecía cada fila**. Conservar temporalmente ese conjunto compartido con referencias explícitas y señalarlo en el manifiesto hasta resolver si son vistas enlazadas o bases que deben separarse. Tampoco convertir automáticamente toda subpágina antigua en fila.

La migración debe ser idempotente, reanudable y reversible, con comprobación de versión antes de escribir. Dado que esquema y metadatos viven en archivos/almacenes distintos, usar un registro de migración y una transición recuperable; no suponer una transacción única entre SQLite y Markdown. Conservar el modo antiguo sólo para contenido todavía no migrado. Definir también la copia: duplicar una base independiente exige nueva identidad y correspondencias explícitas; crear una vista enlazada conserva la identidad. La duplicación genérica actual copia el Markdown y no resuelve esa distinción (`app.py:3050`).

**Criterio de cierre:** dos bases nuevas en una misma página no comparten filas; una base conserva su identidad tras guardar/cargar, mover la página o abrir un registro. En el corpus migrado permanecen los mismos IDs de entradas y los mismos valores/cuerpos; cada fila queda contabilizada, las ambigüedades no se asignan silenciosamente y la restauración desde copia está verificada. Ningún borrado ni conversión de valores forma parte de esta etapa.

### 2. Esquema común y guardado fiable

Separar definiciones de propiedad de los valores de fila, conservando los IDs actuales. Hacer que tabla y página usen el mismo esquema de la base, incluyendo opciones y grupos de Estado. Evitar renombrados divergentes y cambios de tipo sin política de conversión. Conservar propiedades antiguas no reconocidas hasta resolverlas; ocultar una columna no debe borrar su valor.

Corregir la distinción entre cero y vacío. Añadir validación por tipo y guardado de una propiedad concreta con revisión esperada, manejo de error y posibilidad de reintento, en lugar de reemplazos ciegos del array completo. Mantener el vaciado de cambios pendientes al cerrar el peek y revisar su estado global al coexistir editores.

**Criterio de cierre:** editar en celda y abrir/cerrar la página produce el mismo valor; se conservan `0`, `false`, vacío y valores antiguos; un error o conflicto no aparece como guardado satisfactorio. Renombrar una propiedad no cambia su identidad ni pierde sus valores.

### 3. Completar la configuración por vista

Ampliar las vistas existentes con visibilidad y orden de propiedades, anchos y modo de apertura. Mantener las definiciones de propiedad compartidas y los registros únicos. Conservar Tabla y Tablero como alcance inicial; no añadir todos los diseños del catálogo de Notion.

**Criterio de cierre:** ocultar o reorganizar una propiedad en una vista no altera otra ni elimina datos; los ajustes sobreviven al guardado/carga. Los esquemas planos antiguos mantienen su presentación al convertirse al formato de vistas.

### 4. Filtros, ordenación y agrupación

Incorporar operadores por tipo, empezando por igualdad/desigualdad, vacío/no vacío y comparaciones numéricas/fecha. Después, un árbol de condiciones AND/OR y ordenación con varios criterios. Son ampliaciones propuestas; en Notion se observaron el acceso avanzado y operadores de Estado, sin probar el árbol completo ni la ordenación múltiple.

Conservar el orden manual de las filas, aplicando estos ajustes como proyecciones. Añadir agrupación por grupo u opción de Estado y visibilidad de grupos vacíos antes de subgrupos. Resolver la semántica de multiselección con un caso de referencia que tenga registros, sin tomar los comentarios de Atlas como verificación de Notion.

**Criterio de cierre:** mismas filas y valores antes/después de cambiar de vista; quitar filtro u orden recupera la presentación correspondiente. Casos comprobados de cero, vacío, fechas, varias etiquetas y empates de ordenación.

### 5. Edición y apertura de registros

Reutilizar los editores actuales de celda y el peek editable; completar fecha, edición directa del título y la navegación de teclado sobre ellos. Separar editar el título de abrir la página mediante un control OPEN discreto en su extremo derecho, como se comprobó en N17. Mantener el cuerpo como editor de bloques dentro del peek, separado de las propiedades y de Notas, conservando los bloques ya soportados por Atlas. Ofrecer progresivamente apertura lateral, centrada y completa por vista, conservando título, propiedades, cuerpo y guardados pendientes. Una fila sigue siendo la misma página en todas las vistas.

**Criterio de cierre:** abrir/cerrar o cambiar de registro no altera la base que se ve detrás ni pierde cambios; foco y retorno a la tabla son coherentes. Verificar con registros de prueba locales, sin usar Notion privado como entorno de escritura.

### 6. Vistas enlazadas y relaciones entre registros

Tras estabilizar la identidad y la migración, añadir dos capacidades separadas: vistas que referencian una fuente existente sin copiar sus filas, y propiedades Relation que guardan referencias estables a registros de otra fuente. La [ayuda oficial de Notion sobre fuentes](https://www.notion.com/help/data-sources-and-linked-databases) explica el primer caso; la [ayuda sobre relaciones](https://www.notion.com/help/relations-and-rollups) describe el segundo. En esta revisión se observaron sus menús y selectores; no se completó ninguna conexión entre bases.

Conservar como distinciones del modelo `sourceId`, `viewId` y `entryId` —nombres conceptuales propuestos, no campos existentes de Atlas— y resolver vistas enlazadas por referencia. Definir validación, movimientos, borrado y comportamiento de referencias rotas antes de incorporar relaciones recíprocas o rollups. El «+» debe permitir distinguir crear una vista, una fuente independiente o una referencia a una fuente existente. Rollup queda para una ampliación posterior, una vez comprobadas las relaciones.

**Criterio de cierre:** dos vistas enlazadas muestran los mismos registros sin duplicarlos, con configuración de vista independiente; una relación conserva el ID de destino aunque cambie su título y no amplía permisos. La adición de estas funciones no reasigna filas antiguas ni mezcla fuentes por compartir una página contenedora.

## Pendientes y verificación de esta entrega

Antes de escribir la primera etapa se debe acordar la revisión de partida y preparar una integración que preserve los cinco archivos locales sin seguimiento; el checkout está tres commits por detrás del main consultado en vivo. Después corresponde reconciliar la propuesta con el DATABASE_AUDIT.md remoto ya leído y cerrar el contrato de identidad, pertenencia de filas y migración versionada: inventario sobre copia consistente, tratamiento explícito de varios bloques antiguos con filas compartidas, respaldo/reversión y criterios de aceptación. Las pruebas de caracterización remotas deben aprovecharse y adaptar sus expectativas al nuevo contrato; no hace falta repetir la auditoría completa. Nada de esto se ha implementado ni se ha sincronizado automáticamente el checkout.

Las pruebas autorizadas N16–N22 verificaron escritura de valores válidos, persistencia tras recarga, sincronización tabla/peek, multiselección, arrastre con cambio de Estado, filtros existentes y cuerpo con bloques. No se verificaron entradas inválidas, conflictos, ordenación efectiva, AND/OR, agrupación de varias etiquetas, relaciones ejecutadas, rollups ni propagación entre fuentes enlazadas. No se validó el aislamiento de dos bases distintas de Notion ni su implementación interna. En Atlas no se reprodujeron los riesgos en ejecución ni se examinó el contenido de los datos del usuario para contar bases o resolver ambigüedades.

La entrega local modifica este informe, su registro de evidencia y dos capturas: tabla (`notion-database-test-rows.jpg`, evidencia/herramienta local no publicada) y cuerpo del peek (`notion-database-peek-body.jpg`, evidencia/herramienta local no publicada). No cambia implementación ni datos locales de Atlas. Se comprobaron rutas y referencias locales, formato de los documentos y estado de Git. No se ejecutaron pruebas de la aplicación ni migraciones, y no se hizo commit ni push.
