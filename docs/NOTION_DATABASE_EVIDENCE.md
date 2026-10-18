> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Evidencia de la revisión de bases de datos de Notion

> Actualización posterior: [etapa 1 de identidad de Atlas](DATABASE_IDENTITY_STAGE1.md). Se integró esta documentación local tras actualizar main por fast-forward. Las observaciones y los intentos de conexión que siguen conservan su carácter histórico; durante la implementación no se accedió a Notion.

Fecha: 16 de octubre de 2026. Referencia privada suministrada por el usuario:
`[REFERENCIA_PRIVADA_LOCAL]`.

## Método y límites

Los extractos siguientes proceden de `getAXState`, `playwright.domSnapshot` y capturas visuales de la pestaña existente de Brave, mediante la conexión de navegador disponible. Son extractos seleccionados, no una exportación completa ni evidencia generada por REA. Los identificadores N01–N22 son referencias de este informe, no Evidence IDs de REA.

Las primeras revisiones N01–N15 fueron de lectura y apertura de editores, sin introducir valores. Posteriormente el usuario autorizó crear dos filas de prueba, completar sus columnas e inspeccionar el cuerpo de sus páginas y los controles «+»: N16–N22 documentan esas pruebas de escritura y su comprobación tras recarga. No se publicaron páginas ni se cambiaron permisos. No se inspeccionaron cookies, almacenamiento de sesión ni cuerpos de peticiones; la persistencia se comprobó en la interfaz, no mediante tráfico interno.

## R01. Intentos reales de conexión de REA

Herramienta: `mcp__rea__list_browser_targets`, restringida a `https://app.notion.com`.

| Conexión | Resultado observado |
| --- | --- |
| HTTP `http://127.0.0.1:9222`, antes de activar la depuración | `provider_unavailable`, motivo `endpoint_unreachable` |
| HTTP, después de activar la depuración | `unreadable_output`, motivo `invalid_endpoint_response` |
| WebSocket publicado en `DevToolsActivePort` de Brave | `provider_timeout`: `CDP browser-socket discovery exceeded its 10000 ms deadline.` |
| WebSocket, después de que el usuario comunicara «permitido» | El mismo `provider_timeout` de 10000 ms |

La consulta HTTP de diagnóstico con `curl` devolvió `404 Not Found` tanto en `/json/version` como en `/json/list`. La ruta WebSocket se leyó del archivo de conexión de Brave; no se reproduce su identificador en este informe. Se comprobó que no había cambiado antes del último diagnóstico. El timeout no identifica por sí solo su causa. No se reinstaló ni reconfiguró REA.

Conclusión limitada: el MCP REA estaba disponible según el diagnóstico anterior de esta conversación, pero **no se consiguió descubrir ni analizar esta pestaña de Notion con REA**. No se generó un Evidence ID de Notion con REA.

La verificación posterior encontró el [DATABASE_AUDIT.md del main remoto](https://github.com/Codevhn/mision_python/blob/1e18bcde9fe91ca6f5f0c8126ec61e7d25670403/docs/DATABASE_AUDIT.md) y su [evidencia de otra sesión](https://github.com/Codevhn/mision_python/blob/1e18bcde9fe91ca6f5f0c8126ec61e7d25670403/docs/DATABASE_AUDIT_EVIDENCE.json). Allí se declara que esa sesión no tenía REA expuesto y no analizó Notion. No contradice ni reemplaza este registro: las inspecciones N01–N22 de esta sesión se hicieron mediante navegador, y sus errores de REA son los de R01. Los ensayos de API/Chromium de Atlas y sus resultados de pruebas pertenecen al informe remoto; no se ejecutaron de nuevo aquí.

## N01. Tabla inicial y registros disponibles

Ruta: pestaña ya abierta → vista `Todo`. Lectura AX, DOM y captura visual.

```text
tab "Todo" [selected]
tab "Por estado"
tab "Terminados"
tab "📚 Libros"
tab "🎬 Películas"
tab "📺 Series"
tab "Board"
button "Título"
button "Calificación"
button "Estado"
button "Género"
button "Notas"
button "Tipo"
checkbox [disabled]
button "New page"
```

La captura de la primera revisión muestra cabeceras y una cuadrícula vacía, sin filas con título. `New page` es una acción de creación, no un registro existente. Tampoco se observaron tarjetas en `Por estado`. Esta limitación inicial se amplió después con la fila creada por el usuario: véanse N12–N15. Seleccionar y guardar valores o arrastrar tarjetas continúa fuera de lo comprobado.

## N02. Menú de propiedad y configuración numérica

Ruta: `Todo` → cabecera `Calificación` → `Edit property`. Extractos:

```text
textbox "Property name": Calificación
menuitem "Edit property"
menuitem "Change type"
menuitem "Filter"
menuitem "Sort"
menuitem "Group"
menuitem "Calculate"
menuitem "Freeze"
menuitem "Hide"
menuitem "Wrap content"
menuitem "Insert left"
menuitem "Insert right"
menuitem "Duplicate property"
menuitem "Delete property"

menuitem "Number format Number"
menuitem "Decimal places Default"
generic: Show as
button "42 Number"
button "50 Bar"
button "40 Ring"
generic: Changes apply to all views showing this property.
```

Se comprobó la presencia de acciones y ajustes, sin ejecutarlos. La última leyenda declara explícitamente el alcance compartido entre vistas de la propiedad.

## N03. Opciones de Estado

Ruta: `Todo` → cabecera `Estado` → `Edit property`.

```text
generic: To-do
button "Add an option"
menuitem "Pendiente"
generic: In progress
button "Add an option"
menuitem "En progreso"
generic: Complete
button "Add an option"
menuitem "Terminado"
```

Se observaron opciones organizadas por grupos. No se añadieron ni renombraron opciones.

## N04. Género y catálogo de tipos

Ruta: `Todo` → `Género` → `Edit property`, y después `Change type`.

```text
menuitem "Sort Manual"
generic: Options
button "Add an option"
menuitem "Acción"
menuitem "Comedia"
menuitem "Drama"
menuitem "Fantasía"
menuitem "Terror"
menuitem "Romance"
menuitem "Ciencia Ficción"
menuitem "Documental"
menuitem "Thriller"
```

La captura visual de `Change type` mostró una marca junto a `Multi-select`. El DOM del catálogo mostró, entre otros, `Text`, `Number`, `Select`, `Multi-select`, `Status`, `Date`, `Person`, `Files & media`, `Checkbox`, `URL`, `Email`, `Phone`, `Formula`, `Relation` y `Rollup`. Ver un tipo en el catálogo no verifica su funcionamiento.

## N05. Filtros y regla de Terminados

Ruta: `Todo` → `Filter`.

```text
combobox "Filter by…" [expanded]
option "Título"
option "Calificación"
option "Estado"
option "Género"
option "Notas"
option "Tipo"
menuitem "Add advanced filter"
```

Ruta posterior: vista existente `Terminados` → `Edit filters` → `1 rule` → operador `Is`.

```text
tab "Terminados" [selected]
generic: Filters
button "1 rule"

generic: Where
button "Estado"
button "Is"
button "Select an option"
button "Add filter rule"

menuitem "Is"
menuitem "Is not"
menuitem "Is empty"
menuitem "Is not empty"
```

La regla mostraba el marcador `Select an option`; no se comprobó una condición efectiva `Estado = Terminado`. No se seleccionó un valor ni se añadió una regla. El menú avanzado existe, pero no se verificaron combinaciones AND/OR ni su ejecución.

## N06. Ordenación

Rutas: `Todo` → `Sort`; después cabecera `Calificación` → `Sort`.

```text
combobox "Sort by…" [expanded]
option "Título"
option "Calificación"
option "Estado"
option "Género"
option "Notas"
option "Tipo"

menuitem "Sort low → high"
menuitem "Sort high → low"
```

No se eligió una propiedad ni dirección. No se verificaron resultados ni múltiples criterios de ordenación.

## N07. Separación visible entre vista y fuente

Ruta: `Por estado` → `Settings`.

```text
generic: View settings
textbox "View name": Por estado
menuitem "Layout Board"
menuitem "Property visibility 1"
menuitem "Filter"
menuitem "Sort"
menuitem "Group Estado"
menuitem "Sub-group"
generic: Data source settings
menuitem "Source 🎬 Base privada de referencia"
menuitem "Edit properties"
menuitem "Manage data sources"
```

La URL mantuvo la misma página `558a4d7195d142409ea497388869a7e4`, con estos valores observados de `v`:

| Vista | Identificador en la URL |
| --- | --- |
| Todo | `eac3203e9727498688cefcf178c76194` |
| Terminados | `bf06e3e3187c4a869704180d923b3dfc` |
| Por estado | `c9aea5b0c7a646d29ff4682e80a331d4` |

Esto comprueba identidad de vistas en la interfaz y separación visible entre ajustes de vista y fuente. No revela el modelo interno del servidor de Notion ni prueba aislamiento entre dos bases independientes.

## N08. Agrupación del tablero

Ruta: `Por estado` → `Settings` → `Group Estado`.

```text
menuitem "Group by Estado"
menuitem "Status by Group"
menuitem "Sort Ascending"
menuitemcheckbox "Hide empty groups"
menuitemcheckbox "Color columns"
generic: No Estado
button "To-do" [disabled]
button "In progress" [disabled]
button "Complete" [disabled]
button "Pin group"
button "Hide group"
```

Los carriles visibles correspondían a `No Estado`, `To-do`, `In progress` y `Complete`. Se consultaron controles de grupos vacíos, color, fijación y ocultación, sin accionarlos. No se comprobó mover una tarjeta ni agrupar un registro con varias etiquetas.

## N09. Propiedades visibles por vista

Ruta: `Por estado` → `Settings` → `Property visibility 1`.

```text
generic: Shown in board
generic: Título
generic: Hidden in board
generic: Calificación
generic: Estado
generic: Género
generic: Notas
generic: Tipo
```

Se leyeron las listas visibles y ocultas. No se cambió la visibilidad ni el orden de las propiedades.

## N10. Diseño y apertura de registros

Ruta: `Por estado` → `Settings` → `Layout Board` → `Open pages in Side peek`.

```text
button "Table"
button "Board" [disabled]
button "Timeline"
button "Calendar"
button "List"
button "Gallery"
button "Chart"
button "Feed"
button "Map"
menuitem "Open pages in Side peek"
menuitem "Card preview None"
menuitem "Card size Medium"

menuitem "Side peek Open pages on the side. Keeps the view behind interactive. Default for Board"
menuitem "Center peek Open pages in a focused, centered modal."
menuitem "Full page Open pages in full page."
```

En la primera revisión se verificaron el modo configurado y las alternativas del menú; no había registros existentes que abrir. La apertura real se comprobó posteriormente en N14. No se activaron otros tipos de diseño.

## N11. Propiedad Tipo

Ruta: `Todo` → `Tipo` → `Edit property`; después `Change type`.

```text
textbox "Property name": Tipo
menuitem "Sort Manual"
generic: Options
menuitem "📚 Libro"
menuitem "🎬 Película"
menuitem "📺 Serie"
```

La captura visual de `Change type` mostró la marca junto a `Select`. No se seleccionó otro tipo ni se modificaron sus opciones.

## Ampliación con una fila creada por el usuario

El usuario añadió una fila después de la revisión inicial y pidió inspeccionarla. Esta ampliación se realizó mediante la conexión de navegador, sin reintentar REA y sin introducir valores. Las cinco propiedades del registro aparecían vacías. Los extractos siguientes conservan únicamente datos necesarios para comprobar las interacciones de la base.

## N12. Registro disponible y correspondencia entre tabla y página

Nombre observado: `Pagina de ejemplo`. Identidad de página: `3fb2fd5dacb7802a83e3d3930ae702f4`.

Al comenzar, el registro ya estaba abierto en un panel `Side Peek`. El árbol AX mostró su título, una tabla `Page properties`, las filas Calificación, Estado, Género, Notas y Tipo con valor `Empty`, y una zona de cuerpo vacía con el mensaje `Press ‘enter’ to continue with an empty page, or`. No se pulsó Enter ni se creó contenido.

Al cerrar el panel, el mismo título apareció en la fila de `Todo`. La inspección DOM de esa fila identificó seis celdas `notion-table-view-cell`, con `data-row-index="0"` y `data-col-index` de 0 a 5, en el orden de las cabeceras observadas. Se usaron estas celdas para abrir sus editores sin depender de posiciones visuales.

## N13. Editores de las celdas sin introducir valores

Ruta: `Todo` → celda correspondiente de la fila → lectura del editor → Escape, sin escribir ni elegir opciones.

| Celda | Evidencia observada al abrirla |
| --- | --- |
| Calificación | `dialog` con `textbox`; lectura DOM: elemento `INPUT`, `type="text"`, `inputmode="decimal"`, valor `""`. |
| Estado | `Search for an option`; grupos To-do, In progress y Complete; opciones Pendiente, En progreso y Terminado. El selector de Estado en la página lateral mostró las mismas opciones. |
| Género | `Search for an option...`; texto `Select an option or create one`; opciones Acción, Comedia, Drama, Fantasía, Terror, Romance, Ciencia Ficción, Documental y Thriller. |
| Notas | `dialog` con `textbox [active]` y placeholder de un espacio. Se comprobó el editor de texto, sin leer la etiqueta formal del tipo en su catálogo. |
| Tipo | `Search for an option...`; texto `Select an option or create one`; opciones 📚 Libro, 🎬 Película y 📺 Serie. |
| Título | Un clic normal en `Pagina de ejemplo` abrió un `dialog` con `textbox`; no abrió directamente la página. Se cerró sin cambiar el título. |

Esto comprueba la apertura de editores y catálogos. No prueba guardado, validación de valores escritos, selección múltiple efectiva, creación de opciones ni persistencia tras editar. No se seleccionó ninguna opción.

## N14. Apertura real de la fila como página

Ruta comprobada: clic derecho sobre el título → `Open in` → flecha derecha sobre la opción enfocada → `Side peek Alt+Click`.

```text
option "Open in"
menuitem "New tab Ctrl+⇧+↵"
menuitem "Side peek Alt+Click"

region "Side Peek"
link "Open in full page"
button "Switch peek mode"
table "Page properties"
```

Seleccionar `Side peek Alt+Click` abrió realmente el registro junto a la tabla. La URL conservó la página de la base y la vista Todo, añadiendo `p=3fb2fd5dacb7802a83e3d3930ae702f4&pm=s`. Se observaron las cinco propiedades vacías y el cuerpo sin contenido.

El texto `Alt+Click` se comprobó en el menú. Un intento posterior de Alt+clic mediante la conexión de navegador abrió el editor del título; por tanto, no se considera verificado ese atajo mediante esta automatización.

Después, el enlace `Open in full page` abrió la URL `/p/Pagina-de-ejemplo-3fb2fd5dacb7802a83e3d3930ae702f4`. Se verificaron el mismo identificador, título y propiedades vacías, además del enlace de navegación de regreso a la base. Se volvió a la tabla mediante ese enlace. No se cambiaron el diseño ni las preferencias de apertura de la vista. La apertura centrada sigue comprobada sólo como opción de menú.

## N15. Agrupación de un registro sin valor

Ruta: desde Todo → vista existente `Por estado`. El DOM mostró un enlace de tarjeta al mismo identificador de página. La captura visual confirmó que `Pagina de ejemplo` aparecía bajo el carril `No Estado`; los carriles To-do, In progress y Complete no tenían tarjetas.

No se arrastró la tarjeta ni se asignó un Estado. Al disponer de una sola fila con propiedades vacías, esta revisión no verifica ordenación entre registros, filtros con valores diferentes ni agrupación de multiselección con varias etiquetas.

Al finalizar se dejó Todo sin diálogos abiertos. La lectura DOM de la fila confirmó de nuevo `Pagina de ejemplo` en la columna 0 y texto vacío en las columnas 1–5. No se modificaron título, valores, cuerpo ni permisos.

## N16. Dos filas de prueba autorizadas y guardado de valores

El usuario autorizó expresamente añadir un par de filas y completar sus columnas. Se crearon dos registros nuevos, conservando intacta `Pagina de ejemplo` y sus cinco propiedades vacías.

| Registro | ID de página | Calificación | Estado final | Género | Tipo |
| --- | --- | --- | --- | --- | --- |
| Prueba Atlas 01 — Libro pendiente | `3fb2fd5dacb78023ae22fcdad02e6c5d` | `0` | Pendiente | Fantasía, Acción | Libro |
| Prueba Atlas 02 — Película terminada | `3fb2fd5dacb7804ba644e2b6ee894920` | `8.5` | Terminado | Comedia | Película |

Notas finales guardadas:

- Primera fila: `Registro de prueba de Atlas: cero y dos géneros. Verificado desde la página.`
- Segunda fila: `Registro de prueba de Atlas: decimal y estado terminado.`

Se introdujeron título, número y texto mediante sus editores y se confirmaron con Enter. Estado y Tipo cerraron el menú al elegir una opción. Género mantuvo abierto el selector después de elegir Fantasía y permitió añadir Acción al mismo registro:

```text
combobox
  generic: Fantasía
  button "Remove token"
  generic: Acción
  button "Remove token"
  textbox
```

La primera nota se actualizó desde la propiedad Notas del peek, y se comprobó su aparición en la tabla al cerrar el panel. Después se recargó la base y se volvieron a leer todas las celdas: `0`, `8.5`, Estados, géneros, notas y tipos conservaron los valores anteriores. Esto verifica el guardado observado de esos datos válidos, no validación de entradas inválidas, concurrencia ni garantías internas del servidor.

Captura de la tabla tras recarga: filas de prueba (`notion-database-test-rows.jpg`, evidencia/herramienta local no publicada).

## N17. OPEN en la celda del título

Al pasar el puntero por la zona derecha de la celda del título se mostró `Open`. Lectura AX/DOM:

```text
button "Open in side peek Prueba Atlas 01 — Libro pendiente"
  button "Open in side peek"
    button "Open in side peek"
      text: Open
```

Se pulsó ese control y se verificó `Side Peek` con el identificador de la primera fila, las cinco propiedades guardadas y el cuerpo independiente. También se abrió la segunda fila por OPEN después de recargar. Al abrirse, el control de la fila pasó a anunciar `Close side peek`.

Queda comprobada una apertura directa desde la celda del título, sin recurrir al menú contextual. El clic normal sobre el texto del título permite editarlo. No se afirma que OPEN esté disponible en cada celda de cualquier tipo: esta comprobación se hizo en la celda del título.

## N18. Agrupación con datos y arrastre

En Por estado se observaron visualmente tres tarjetas:

| Carril | Registro |
| --- | --- |
| No Estado | Pagina de ejemplo |
| To-do | Prueba Atlas 01 — Libro pendiente |
| Complete | Prueba Atlas 02 — Película terminada |

Se arrastró únicamente la primera tarjeta de prueba desde To-do hasta In progress. Al abrirla se leyó `Estado / En progreso` en Page properties: el arrastre cambió el valor del registro. Después se restableció Pendiente desde el selector de la página. El valor final Pendiente se comprobó también tras recarga. No se arrastró ni editó el ejemplo original del usuario.

## N19. Resultado efectivo de filtros existentes

Sin cambiar sus reglas:

- La vista 📚 Libros mostró sólo `Prueba Atlas 01 — Libro pendiente`, con Tipo Libro; no mostró la película ni el ejemplo vacío.
- La vista Terminados mostró sólo `Prueba Atlas 02 — Película terminada`, con Estado Terminado; no mostró el libro pendiente ni el ejemplo vacío.

Estas comprobaciones con datos sustituyen la incertidumbre de la primera lectura de N05, que había mostrado `Select an option`. No se puede deducir la causa de aquel marcador a partir de la sesión; ahora sí quedó verificado el filtrado efectivo para este conjunto de tres registros. No se probaron AND/OR, negación, fechas o múltiples ordenaciones.

## N20. Cuerpo de página editable dentro del peek

El usuario indicó expresamente revisar el editor situado debajo de las propiedades. En la segunda fila de prueba se activó el cuerpo pulsando Enter desde su título y se abrió el menú `/`. El menú mostró, entre otros, Text, Heading 1–4, Bulleted list, Numbered list, To-do list, Toggle list, Callout, Quote, Table, Divider, Link to page, Image, Video, Audio, Code, File y vistas de base de datos. Su presencia no prueba el funcionamiento de todos ellos.

Se añadieron únicamente estos bloques al cuerpo de esa fila:

```text
Heading 1: Contenido de prueba de Atlas
Text: Esta página de prueba tiene contenido propio además de las propiedades de su fila.
Bulleted list: Verificar los valores de la fila.
Bulleted list: Verificar el contenido de su página.
```

Se cerró el peek, se recargó la base y se volvió a abrir la fila con OPEN. La lectura DOM confirmó el encabezado, párrafo y dos elementos de lista, junto con sus propiedades `8.5 / Terminado / Comedia / Película`. El cuerpo no se convirtió en otra columna ni sustituyó Notas. Captura guardada: propiedades y cuerpo dentro del peek (`notion-database-peek-body.jpg`, evidencia/herramienta local no publicada).

## N21. Los dos controles «+» y las conexiones

**Junto a las pestañas:** Add view abrió una cuadrícula con Table, Board, Gallery, List, Chart, Dashboard, Timeline, Feed, Map, Calendar, Form y New data source. No se seleccionó New data source ni otro diseño.

**Al final de las cabeceras:** el «+» abrió un selector de tipo de propiedad. Además de los tipos básicos mostró Relation, Rollup, Formula, Button y otros tipos. Seleccionar Relation abrió `Related to`, con el campo `Link to a data source…` y un inventario de fuentes existentes. Se canceló sin elegir destino y sin añadir una columna.

**Settings → Manage data sources:** se observaron las secciones Source y Linked, las acciones Add data source y Link existing data source, y la fuente actual con `7 views`. Se abrió el selector de Link existing data source, se leyó `Link to existing data source` y `Link…`, y no se seleccionó ninguna fuente externa. Ese flujo añadió automáticamente una vista Table a la fuente actual, incluso al cerrar el selector. Se retiró sólo esa vista mediante Delete view y se volvió a verificar la fuente con sus siete vistas originales.

La comprobación final mostró una sola fuente propia, siete vistas y ninguna fuente en Linked. Se conservaron las seis cabeceras originales. No se creó una relación ni un rollup ni se verificó propagación entre fuentes enlazadas.

Como contraste documental, la [ayuda oficial de fuentes de datos](https://www.notion.com/help/data-sources-and-linked-databases) distingue añadir fuentes de mostrar una fuente existente mediante vistas enlazadas. La [ayuda de relaciones](https://www.notion.com/help/relations-and-rollups) describe propiedades que vinculan registros entre bases. Estas explicaciones proceden de documentación; no se presenta su ejecución entre dos bases como comprobada en esta sesión.

## N22. Corrección de elementos provisionales y estado final

Al activar inicialmente el aviso del cuerpo vacío se abrió por error la creación de una plantilla vacía. No se añadió contenido a ella. Se retiró esa plantilla a Trash; la interfaz confirmó `Moved to Trash` y `1 block deleted`. Permanece recuperable en papelera. Se continuó la edición del cuerpo exclusivamente en el segundo registro de prueba.

La vista Table creada automáticamente al inspeccionar Link existing data source se eliminó sin borrar registros. El panel final Manage data sources confirmó la fuente original con `7 views` y sin fuentes enlazadas. La tabla mantuvo seis columnas y tres filas: el ejemplo original vacío y los dos registros de prueba autorizados. No se cambiaron filtros existentes, permisos ni publicación. Se dejó Todo sin menús abiertos.


## Continuación local de Atlas tras aprobar el diseño

El 16 de octubre de 2026 se implementó la continuación descrita en [DATABASE_WORKSPACE_STAGE2B.md](DATABASE_WORKSPACE_STAGE2B.md). Sus capturas `atlas-database-workspace-*` prueban Atlas local con registros ficticios; **no son nueva evidencia de Notion ni de REA**. No se volvió a abrir Notion ni se modificaron sus datos/permisos. Las observaciones N01–N22 y el fallo de conexión de REA conservan su significado original.
