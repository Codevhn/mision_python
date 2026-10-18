> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Reconexión real de REA — 16 de octubre de 2026

Esta comprobación es posterior a R01 y a la implementación de Atlas. No convierte
las inspecciones históricas N01–N22 en evidencia de REA. Durante la implementación
anterior no se utilizó REA; en esta reconexión sí se ejecutaron sus herramientas.

## Instalación y conexión comprobadas

- Skill leída: `reverse-engineer-anything`, versión 42, y su referencia
  `references/runtime-observation.md`.
- `mcp__rea__binary_session` respondió: servidor `rea-agents` 6.5.0, MCP negociado
  `2025-06-18`, 207 herramientas anunciadas. El proveedor de navegador está disponible.
- Registro existente: `npx -y rea-agents@6.5.0 mcp`; no se modificó.
- Ghidra disponible; Hopper no disponible por ejecutable ausente; IDA sin configurar.
  Ninguno de esos motores es necesario para la inspección CDP realizada.
- `ss -ltnp` confirmó Brave escuchando exclusivamente en `127.0.0.1:9222`.
- Se leyó el endpoint vigente de `Brave-Browser/DevToolsActivePort`; su identificador
  WebSocket no se publica aquí. No se reutilizó un identificador histórico.

## Fallos distinguidos

1. R01 documenta `endpoint_unreachable` antes de habilitar depuración. No se
   reprodujo ahora: hay un listener local y una conexión WebSocket funcional.
2. `curl --noproxy '*' ... /json/version` devolvió HTTP 404. La llamada real a
   `list_browser_targets` con `http://127.0.0.1:9222` devolvió `unreadable_output`,
   `reason: invalid_endpoint_response`. Este modo necesita `/json/version` y
   `/json/list`, según el código instalado `dist/browser/CdpEndpoint.js`.
3. `list_browser_targets` con el WebSocket de navegador vigente funcionó. Usa
   `Browser.getVersion` y `Target.getTargets`, sin depender de esas rutas HTTP.
4. El timeout histórico de 10000 ms corresponde al plazo de descubrimiento y
   handshake que implementa REA. No hay evidencia suficiente para atribuir su
   causa anterior a permisos, a un identificador obsoleto o a otro factor.
5. `capture_browser_scenario` con el WebSocket funcional fue rechazado antes de
   ejecutar acciones: `browser.cdp_endpoint: CDP endpoint must be an explicit-port
   HTTP URL on 127.0.0.1 or ::1`. El código instalado distingue
   `browserEndpointSchema` (HTTP, usado por escenarios) de
   `browserObservationEndpointSchema` (HTTP o WebSocket, usado por inspección
   pasiva). No se volvió a intentar con HTTP conocido como no funcional.

No fue necesario reinstalar REA, modificar su configuración, reiniciar Brave,
abrir puertos adicionales ni cambiar permisos. No se sustituyó REA por CUA.

## Evidencia devuelta por herramientas reales de REA

| Herramienta | Resultado aprovechado |
| --- | --- |
| `mcp__rea__binary_session` | Identidad del servidor y disponibilidad del proveedor. |
| `mcp__rea__list_browser_targets` | Pestaña `Base privada de referencia \| Notion`, misma página solicitada y origen `https://app.notion.com`. |
| `mcp__rea__inspect_web_page` | 895 nodos DOM y 472 nodos de accesibilidad; pestañas y vista Dashboard activa. |
| `mcp__rea__capture_web_screenshot` | Captura real de 1888 × 879 de la vista Dashboard. |
| `mcp__rea__capture_browser_scenario` | Rechazo de validación del endpoint; no navegó ni pulsó controles. |

Evidence IDs completos y extractos seleccionados: NOTION_REA_CONNECTION_EVIDENCE.json (`NOTION_REA_CONNECTION_EVIDENCE.json`, evidencia/herramienta local no publicada).

La URL observada conserva la página `558a4d7195d142409ea497388869a7e4`, con la
vista `3fc2fd5dacb7804ebadf000c70c20369`; la referencia del usuario selecciona
`eac3203e9727498688cefcf178c76194`. No se cambió la vista.

Observación directa: aparecen Todo, Por estado, Terminados, Libros, Películas,
Series, varias Board, Gallery y Dashboard. Dashboard está seleccionado; el árbol
AX y la captura muestran que agregar widgets o editar su distribución requiere
el plan Business en esta sesión de Notion. Esto informa una limitación de la
referencia disponible; no establece que el Dashboard actual de Atlas sea equivalente.

## Primera captura: Peek y menús pendientes

No había un Peek ni un menú de configuración abierto en la captura. La inspección
pasiva puede leerlos cuando estén visibles, pero no abrirlos. La herramienta de
escenarios no admite el transporte WebSocket disponible en esta instalación.
Se solicita una sola acción manual: abrir por OPEN una fila existente de prueba
en Side Peek. Después se podrá capturar su estructura, controles y apariencia
con las herramientas pasivas reales de REA, sin editar Notion.

Esta comprobación no modifica la implementación de Atlas ni su base de datos.
No hubo migración de datos reales, commit, push, despliegue ni cambios de datos
o permisos de Notion. En esa primera captura todavía no se había inspeccionado el Peek.

## R02. Peek capturado después de la acción manual

El usuario abrió la fila mediante OPEN y comunicó «ya». Después se ejecutaron
`mcp__rea__list_browser_targets`, `mcp__rea__inspect_web_page` y
`mcp__rea__capture_web_screenshot` sobre el mismo endpoint WebSocket vigente.
No se utilizó CUA ni se despacharon eventos, se evaluó JavaScript o se editaron
datos de Notion. La apertura la realizó el usuario; la captura pasiva la hizo REA.

- La URL observada contiene la vista solicitada `eac3203e9727498688cefcf178c76194`,
  el registro `3fb2fd5dacb7804ba644e2b6ee894920` y `pm=s`.
- El árbol AX contiene `region: Side Peek` y `table: Page properties`.
- Registro: **Prueba Atlas 02 — Película terminada**.
- Valores leídos: Calificación `8.5`, Estado `Terminado`, Género `Comedia`,
  Notas `Registro de prueba de Atlas: decimal y estado terminado.`,
  Tipo `🎬 Película`.
- El cuerpo incluye el encabezado «Contenido de prueba de Atlas», un párrafo
  y dos elementos de lista. La presencia del cuerpo y sus estados AX editables
  no equivale a una prueba de edición o guardado en esta sesión.
- REA devolvió 1380 nodos DOM y 840 nodos AX. Los extractos guardados se limitan
  al Peek para evitar copiar el inventario completo de recursos de la página.

### Controles superiores detectados

El AX identifica `Close`, `Open in full page`, `Switch peek mode`,
`Previous page`, `Next page` (deshabilitado en este registro), `Share`,
`Copy link`, `Favorite` y `Actions`. También aparecen la sugerencia de traducción
`English` y su descarte; no deben interpretarse como controles propios de toda
base de datos. Se detecta un separador vertical ajustable mediante teclado.

En la zona del título se detectan `Add icon`, `Add cover` y `Customize layout`;
después de las propiedades, `Add a property`. Algunos controles pueden mostrarse
según contexto o hover: su presencia AX no prueba visibilidad permanente.

### Referencia visual y utilidad para Atlas

Captura real de REA: notion-rea-peek.png (`notion-rea-peek.png`, evidencia/herramienta local no publicada), viewport 942 × 879.
En este ancho el Peek ocupa la derecha y deja parte de la tabla visible. Se
observan fondo neutro oscuro, divisor vertical fino, barra superior compacta,
título grande que envuelve en dos líneas, márgenes amplios y propiedades con
etiqueta e icono a la izquierda y valor a la derecha. Los valores no parecen
inputs permanentemente expuestos; Estado, Género y Tipo son etiquetas discretas.
Hay comentarios y un separador antes del cuerpo.

Para Atlas, esto aporta evidencia real para ajustar jerarquía, alineación,
espaciado y correspondencia de iconos del Peek. El editor y las propiedades
existentes se conservan. No se afirma equivalencia funcional de navegación
anterior/siguiente, cambio de modo, configuración de layout ni acciones de página
por haber detectado sus controles en Notion. No se han implementado ajustes nuevos.

Evidence IDs y extractos completos seleccionados:
NOTION_REA_PEEK_EVIDENCE.json (`NOTION_REA_PEEK_EVIDENCE.json`, evidencia/herramienta local no publicada).
La captura no fue truncada, pero la inspección mantiene filtros de origen y
límites del intervalo de observación. No prueba el código interno, las reglas de
guardado ni el comportamiento del clic exterior.

### Próximo detalle pendiente

El menú `Actions` del Peek todavía está cerrado. La conexión pasiva funciona,
pero la herramienta de escenarios conserva la incompatibilidad HTTP/WebSocket
documentada arriba. Para inspeccionar ese menú con REA se requiere que el usuario
abra únicamente los tres puntos de la esquina superior derecha del Peek.

## R03. Menú Actions del Peek capturado con REA

Después de que el usuario abriera los tres puntos y comunicara «ya», se ejecutaron
`mcp__rea__inspect_web_page` y `mcp__rea__capture_web_screenshot`. La URL y el
registro son los mismos de R02. La inspección devolvió 1716 nodos DOM y 1124 AX.
No se seleccionó ninguna opción, se modificó Notion ni se utilizó CUA.

El AX identifica un diálogo con el buscador `Search actions…` y opciones de
lista; no lo representa simplemente como un elemento HTML `menu`. Se detectan:

- Tipografía: Default, Serif y Mono. La captura está desplazada y no muestra
  esa sección superior, aunque el AX sí contiene las opciones.
- Copy link, Copy page contents, Duplicate, Move to y Move to Trash.
- Small text, Full width, Table of contents y Customize layout.
- Lock page; Use with AI; Suggest edits y Translate.
- Import, Export, Updates & analytics y Version history.
- Notify me (Comments) y Connections (None).
- Pie con última edición y contador de 31 palabras.

La captura muestra iconos alineados a la izquierda, atajos o valores a la
derecha, separadores entre grupos, toggles discretos y una superficie vertical
con scroll. En ese instante Small text, Full width y Lock page se ven apagados,
y Table of contents encendido. Son estados visuales observados; no se activaron
ni se verificó su persistencia. `selected` en las opciones AX no debe confundirse
con el valor de estos toggles.

Esto es el menú de **la página del registro**, no el panel de filtros, ordenación
o agrupación de la vista de base de datos. Para Atlas, la evidencia sirve para
separar esos ámbitos y ajustar estructura, densidad, iconos y estados del menú.
No autoriza a presentar opciones de Atlas como funcionales sin implementarlas;
IA e integraciones externas siguen fuera del alcance acordado.

Captura real: notion-rea-peek-actions.png (`notion-rea-peek-actions.png`, evidencia/herramienta local no publicada).
Evidence IDs y extracto del diálogo (excluyendo otros diálogos de la página):
NOTION_REA_PEEK_ACTIONS_EVIDENCE.json (`NOTION_REA_PEEK_ACTIONS_EVIDENCE.json`, evidencia/herramienta local no publicada).
La inspección no informó secciones truncadas; conserva filtros de origen y
limitaciones de cobertura del intervalo. No se observó la ejecución de acciones.

Pendiente concreto: abrir `Customize layout` para conocer el panel de
configuración del registro, sin cambiar opciones. Sus controles internos no
se han inspeccionado todavía con REA. La implementación de Atlas se conserva.

## R04. Customize layout: configuración de páginas de la base

El usuario abrió `Customize layout` y comunicó «ya». Se ejecutaron únicamente
`mcp__rea__inspect_web_page` y `mcp__rea__capture_web_screenshot` para observarlo.
REA devolvió 681 nodos DOM y 538 AX; la URL conserva la página y la vista Todo,
pero ya no contiene los parámetros del Peek. Aparece un editor de layout con
la previsualización del mismo registro y controles de aplicación explícita.
No se cambió ninguna opción, se arrastraron módulos, se seleccionó guardar ni
se ejecutó `Apply to all pages`.

### Comprobado directamente

- Cabecera: nombre de la base; selector `Preview: Prueba Atlas 02 — Película
  terminada`; `Cancel`; `Apply to all pages` y `More save options`.
- La previsualización organiza Heading, Property group, Page discussions y
  Content como módulos. Hay botones `Action menu for module`, `Add page module`
  y `Add to panel`. La captura muestra un área lateral disponible para el panel.
- `Page settings` ofrece Structure con Simple (seleccionado visualmente) y Tabbed.
  No se probó la disponibilidad o comportamiento de Tabbed.
- Inline comments muestra Default. Sus opciones internas no se abrieron.
- Los switches AX y la captura coinciden en Page discussions activado,
  Property icons activado, Full width desactivado y Database templates activado.
  Sus elementos contenedores `menuitemcheckbox` informan checked=false aun cuando
  el switch hijo informa true; para documentar estos estados se usa el switch
  explícito y la captura, no el estado del contenedor.
- Las cinco propiedades y el cuerpo aparecen en la previsualización. Las
  etiquetas de propiedades se anuncian como celdas deshabilitadas en este modo.

La captura es de 942 × 879; ese ancho estrecha mucho la previsualización y corta
varios valores. No debe usarse esa envoltura extrema como diseño deseado del
Peek normal. Los bordes y rótulos azules pertenecen a este editor de layout,
no a la apariencia del registro durante su uso habitual.

### Consecuencia para Atlas y límites

Notion separa tres ámbitos visibles: configuración de la vista de la base,
acciones de la página y configuración de su layout. El botón `Apply to all pages`
aporta evidencia de un alcance compartido del diseño entre páginas de la base;
no se aplicó, por lo que su propagación o persistencia no se ha comprobado.
Atlas debe conservar esa separación de ámbitos al ampliar sus controles.
Esta observación no implica que Atlas ya tenga un constructor de layouts,
paneles configurables o todas las acciones de página equivalentes a Notion.

Captura real: notion-rea-page-layout.png (`notion-rea-page-layout.png`, evidencia/herramienta local no publicada).
Evidence IDs y extractos: NOTION_REA_LAYOUT_EVIDENCE.json (`NOTION_REA_LAYOUT_EVIDENCE.json`, evidencia/herramienta local no publicada).
REA no informó secciones truncadas; se mantienen filtros de origen y límites
del intervalo. No se abrieron submenús de módulos, comentarios o guardado.

La conexión y la inspección real de Peek, controles superiores, Actions y
Customize layout quedan demostradas. La limitación de acciones automatizadas
por HTTP/WebSocket sigue vigente; las aperturas las hizo el usuario y las
lecturas y capturas fueron de REA. No se usó CUA en esta reconexión.
La configuración local existente y la implementación de Atlas se conservan;
no hubo migración real, commit, push ni despliegue. Se indica salir mediante
`Cancel` para abandonar la previsualización sin aplicar cambios.
