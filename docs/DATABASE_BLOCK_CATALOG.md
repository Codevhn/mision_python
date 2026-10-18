# Catálogo compartido de bloques

Evidencia técnica de la ronda del 16 de octubre de 2026. El seguimiento y los
criterios de aceptación se mantienen exclusivamente en [DATABASE_PLAN.md](DATABASE_PLAN.md).

`editor-src/src/blockCatalog.jsx` define nombres, iconos, categorías, orden y
compatibilidad una sola vez. `main.jsx` usa `buildInsertBlockItems` para el
controlador slash. El (+) nativo abre exactamente ese controlador; no existe una
segunda lista de inserción. `dragHandleMenu.jsx` proyecta el mismo catálogo con
`buildConversionBlockItems`. Ambas superficies conservan los componentes de menú
BlockNote/Mantine y comparten medidas y tokens mediante `blockCatalog.css`.
Las páginas normales y el Peek montan la misma implementación de `EditorView`.

## Orden y semántica

- **Bloques básicos:** Párrafo, encabezados admitidos por el esquema en orden de
  nivel, lista con viñetas, numerada, tareas, desplegable, encabezados desplegables,
  cita, página y separador.
- **Bloques avanzados:** bloque de código, tabla simple y base de datos.
- **Multimedia:** imagen, vídeo, audio, archivo y emoji.

El nombre, icono y categoría de cada tipo convertible coinciden con la inserción.
El esquema vigente permite H1–H6 y encabezados desplegables H1–H3. Los niveles se
filtran por las propiedades realmente admitidas. La búsqueda conserva los alias
nativos y añade equivalentes sin tilde donde corresponde, por ejemplo `parrafo`.

Insertar utiliza los callbacks nativos, incluidos el panel de archivos, la tabla
editable y el selector de emoji. Página conserva su diálogo y el contexto del
editor propietario; Base de datos crea una identidad persistente nueva.

Convertir modifica el bloque existente. Se limita a modelos de contenido inline
compatibles con su representación persistente. Conserva ID y texto. Tabla, archivos, multimedia,
página, separador y DB no aparecen como conversiones: cambiarles simplemente la
etiqueta podría descartar celdas, recursos, destinos o identidad. Por la misma
razón, sus menús no ofrecen convertirlos en párrafo. Esto es una diferencia
necesaria, no una opción simulada.

La compatibilidad también depende del contenido: un bloque multilínea sólo se
convierte en Párrafo o código; los demás serializadores actuales no representarían
esas líneas como un único bloque. Un bloque con hijos sólo ofrece destinos que
persisten hijos (listas y desplegables). Código con sangría o compuesto únicamente
por saltos de línea no se convierte en Párrafo porque el dialecto heredado usa la
sangría como estructura y normaliza el espacio vacío. Estas restricciones evitan
una conversión que aparentase funcionar y perdiese estructura al recargar.

Convertir código en párrafo/encabezado conserva el texto literalmente y respeta el
tipo elegido. Se retira la interpretación implícita que podía sustituir un bloque
por varios al encontrar Markdown. No cambia el importador de Markdown ni la
detección de código pegado. El historial nativo de deshacer permite recuperar el
estado anterior.

Se corrigieron dos defectos concretos del guardado: H5/H6 conservan ahora su nivel,
y los párrafos escapan los marcadores Markdown literales en vez de reinterpretar
`##`, `-`, `**` o `_` al reabrir. Las líneas vacías interiores usan `<br>` para
mantener un único párrafo. Los bloques de código y sus caracteres siguen intactos.

El asa conserva Eliminar y Color y añade Duplicar como acción real. Duplicar crea
IDs nuevos para el bloque y sus hijos; el guardado existente renueva cualquier
identidad DB copiada sin reasignar sus registros. La copia de una base no copia sus
filas. Imprimir este tema sigue disponible para encabezados.

El esquema actual no registra un bloque callout independiente. No se anuncia como
disponible; Cita sigue accesible. Añadir callout requeriría esquema, edición y
serialización compatibles antes de incorporarlo al catálogo.

## Validación

`test/blockCatalog.test.jsx` comprueba orden compartido, nombres, categorías,
iconos, niveles admitidos, callbacks de Página/DB y contexto del Peek,
conversiones incompatibles sin escritura, contenido literal de código y copia
independiente de bloques/identidades DB. Incluye una conversión contra el modelo
real de BlockNote para verificar ID, texto multilínea y conservación de hijos.

Comando aprobado: `./node_modules/.bin/vite-node --config vite.test.config.js test/blockCatalog.test.jsx`.
La revisión visual, el clic/teclado y el arrastre se registran junto con la
alineación y el cambio de tema en la evidencia de esta ronda. Esta prueba por sí
sola no demuestra fidelidad visual ni estabilidad de los controles.

Durante la revisión se detectó que el serializador propio omitía los bloques
image/video/audio/file que ya ofrecía la inserción nativa. Se corrigió mediante
Markdown estándar (imagen o enlace) y un comentario HTML `atlas-media:` con
metadatos codificados de tipo, nombre, caption y preferencias. La URL aparece
únicamente en el enlace para que exportación pueda reescribirla o excluirla.
Nombres y captions con comillas, paréntesis, corchetes, saltos de línea y texto
HTML se conservan sin introducir HTML activo. Los caracteres de URL incompatibles
con el enlace se normalizan a percent-encoding. Los placeholders sin URL conservan
su tipo y sus propiedades. No se recuperan automáticamente recursos que un
guardado anterior ya hubiese descartado.

La prueba de Markdown realiza guardar/recargar con el motor real para los cuatro
tipos, URLs vacías, nombres hostiles, preferencias y un archivo hijo de una lista;
el decoder conserva como texto la fuente con metadatos inválidos sin lanzar una
excepción. `test_database_export.py` añade inspección del ZIP con estos comentarios:
los archivos incluidos conservan bytes exactos y las cuatro referencias se
reescriben; «sin archivos» quita referencias activas y no modifica la página.
**11 pruebas de exportación aprobadas.** Audio y vídeo se exportan como enlaces
estáticos, conservando el tipo al reimportar el Markdown de Atlas; no se afirma una
reproducción multimedia dentro del PDF. No se descargaron recursos remotos.
