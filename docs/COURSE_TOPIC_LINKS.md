# Enlaces del temario a lecciones

En el Peek de una página con tablas cuyo encabezado sea «Lección», «Tema», «Subtema» o «Topic», la acción **Vincular temario con curso** permite elegir el curso y analizar sus lecciones. Detecta los títulos y apartados reales del contenido Markdown. Excluye código y otros cursos. Propone automáticamente solo coincidencias únicas, ignorando numeración inicial, mayúsculas y acentos al comparar. Las coincidencias ambiguas y nombres distintos requieren seleccionar un destino; no generan navegación por aproximación.

El usuario revisa y aplica los destinos. Los subtemas se guardan como enlaces nativos de BlockNote dentro de las celdas, conservando formato, demás columnas y subtotales. «Sin vincular» también permite quitar un enlace de temario existente. Se usa la cola de guardado normal del Peek, con recuperación del borrador y reintento si falla. Si el documento cambió durante el análisis, debe analizarse de nuevo.

Un clic abre la lección en Cursos y desplaza el contenido al encabezado concreto; los encabezados repetidos se distinguen por su posición entre los de igual texto. **Volver al temario** restaura la DB, el modo y la ruta del Peek y desplaza la tabla al subtema de origen. El contexto de regreso se conserva en sessionStorage. Los enlaces contienen identificadores y texto del apartado, y también funcionan como enlaces profundos del mismo origen. No usan IA.

Antes de abrir se comprueba que la lección sigue perteneciendo al curso y que existe el apartado. Si cambia o desaparece, se informa y debe revisarse el vínculo desde el temario. El contenido del curso no se modifica. Una respuesta tardía no puede abrir la lección si el usuario ya salió del origen. El retorno crea nuevas referencias a la DB; no reutiliza callbacks de un editor destruido. Además, la recarga de DatabaseWorkspace ignora respuestas de bloques que ya no están en el documento, evitando actualizar IDs obsoletos.

## Verificación

- `pytest knowledge_base/tests/test_course_topic_links.py knowledge_base/tests/test_database_workspace.py -q`.
- `npm test` y `npm run build` en `knowledge_base/editor-src`.
- Con el servidor desechable `tools/run_library_assistant_fixture.py`: `node tools/check_course_topic_links.cjs`. Recorre DB → Peek anidado → asociación automática/manual → apartado → regreso repetido; verifica persistencia y formato, separación de cursos y rechazo de apartados renombrados en 1697, 900 y 412 px.
- Regresión de Peek: `node tools/check_peek_navigation.cjs`.

No modifica datos existentes automáticamente: cada temario se asocia y guarda desde su propio Peek. No se han vinculado ni probado los datos personales del usuario desde este entorno.
