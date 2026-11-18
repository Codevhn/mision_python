# Pegado de texto de PDF

El Peek y las entradas normales usan el mismo `pasteClipboard` de BlockNote. El cambio normaliza el contenido antes de su importación nativa; no sustituye el mecanismo de selección, historial o persistencia del editor.

## Problema

El ajuste anterior solo unía dos líneas si cada una parecía prosa larga. Un PDF puede dividir una misma frase en fragmentos cortos al cambiar de tipografía (`main()`, `String`, `args[0]`). Esos fragmentos quedaban en líneas independientes. El HTML de algunos visores también representa cada fragmento con un SPAN de bloque o con posiciones absolutas.

## Corrección tras el primer despliegue

La primera versión no cubría dos formatos que el flujo real requiere. Una cabecera Windows CF_HTML (`Version:0.9`, `StartHTML`, `StartFragment`, etc.) quedaba como texto del documento. Además, la capa real de PDF.js usa estilos calculados para posiciones y fuentes, incompatibles con la reconstrucción inicial basada en valores CSS numéricos.

`clipboardEnvelope.js` separa el transporte CF_HTML del contenido. Prefiere los delimitadores de fragmento y, si no existen, interpreta los desplazamientos como bytes UTF-8, con recuperación controlada cuando el productor informa offsets inválidos. Se aplica al HTML y a sobres CF_HTML entregados por error como texto plano.

El lector ahora prepara su propia copia semántica usando los datos públicos de `getTextContent`, `textDivs` y las coordenadas del viewport de PDF.js. Solo interviene en selecciones contenidas en la capa activa del PDF, respeta los límites exactos de la selección y mantiene la copia normal en otros lugares. No depende de interpretar `calc()` ni modifica el documento PDF. Los encabezados se basan en tamaños relativos del documento; los marcadores explícitos y sus continuaciones forman listas; los ejemplos monoespaciados consecutivos forman bloques de código con sangría. Un token monoespaciado dentro de una frase sigue siendo código en línea. Ante geometría incompatible o texto rotado conserva la copia nativa.

Los exportadores externos que separan cada línea de código en un P/DIV monoespaciado se normalizan como un ejemplo multilínea, conservando su texto. Se distinguen de los párrafos que mezclan prosa y código en línea.

## Tratamiento

- Texto plano y HTML con saltos: se examinan secuencias completas delimitadas por párrafos, listas, encabezados, tablas, código y saltos explícitos. Dos fragmentos sustanciales de prosa permiten unir también los fragmentos cortos intermedios. Se conserva la puntuación sin introducir un espacio antes de una coma o un punto.
- Las viñetas tipográficas de texto plano se importan como listas. Las continuaciones de un elemento se reconstruyen sin fusionar elementos distintos. Los bloques de código conservan sus viñetas literales.
- HTML: se preservan los cambios de fuente monoespaciada como código en línea y los énfasis existentes. Las dimensiones, posiciones y fuentes del documento no fijan el ancho ni la tipografía del editor.
- Capas PDF de SPANs absolutamente posicionados: se consideran solo conjuntos planos con coordenadas compatibles, orden de lectura monotónico y suficiente prosa. Las separaciones verticales delimitan párrafos; tamaños relativos identifican encabezados y los marcadores explícitos identifican listas. El contenido HTML semántico y las geometrías ambiguas (por ejemplo, columnas con orden invertido o texto rotado) no se reinterpretan.
- Las estructuras explícitas HTML/Markdown, el portapapeles nativo de BlockNote y el pegado dentro de código conservan prioridad. No se usa IA ni una petición externa.

Durante la prueba de persistencia se detectó otro defecto: los corchetes escapados de `args[0]` se confundían con delimitadores LaTeX. El conversor ahora excluye de esa interpretación los corchetes que siguen a un identificador. Las fórmulas existentes mantienen sus pruebas.

## Verificación

`npm test` y `npm run build` en `knowledge_base/editor-src`.

`node tools/check_editor_paste.cjs` verifica el bundle compilado en Chromium con perfiles de escritorio, teléfono y tableta, usando editores normales y Peek. Comprueba fragmentos de PDF como texto plano, BR y SPANs de bloque; código en línea, puntuación y negrita; estructura posicional; viñetas y pasos; tablas y límites de párrafo; guardado/reapertura y deshacer/rehacer. Incluye las regresiones existentes de Markdown, HTML, portapapeles nativo, código literal, metadatos de VS Code, selección y solo lectura.

`node tools/check_pdf_clipboard.cjs` genera un PDF, lo renderiza con el PDF.js real de Atlas y usa Ctrl+C/Ctrl+V nativos con el bundle compilado. Verifica en perfiles de 1440 y 412 px encabezados, listas con continuaciones, prosa con cambios de fuente, código con sangría, persistencia, deshacer y selecciones parciales exactas en editores normales y Peek. Este recorrido no sustituye el portapapeles de la copia por una carga sintética.

`node tools/check_pdf_scrolling.cjs` mantiene las comprobaciones del zoom, navegación explícita, límites, progreso guardado y desplazamiento nativo del lector en escritorio, tableta y teléfono.

Las pruebas de entrada externa usan formatos de portapapeles representativos e incluyen la cabecera CF_HTML visible en la captura, en ambos tipos MIME. No se dispone del portapapeles ni del PDF externo real mostrado por el usuario. Si el visor solo entrega texto plano, se puede reconstruir el flujo y los marcadores explícitos; no se puede recuperar de forma fiable una jerarquía tipográfica que el visor omitió. No se reescriben automáticamente notas ya guardadas: se aplica al pegar de nuevo.
