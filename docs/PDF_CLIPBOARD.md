# Pegado de texto de PDF

El Peek y las entradas normales usan el mismo `pasteClipboard` de BlockNote. El cambio normaliza el contenido antes de su importación nativa; no sustituye el mecanismo de selección, historial o persistencia del editor.

## Problema

El ajuste anterior solo unía dos líneas si cada una parecía prosa larga. Un PDF puede dividir una misma frase en fragmentos cortos al cambiar de tipografía (`main()`, `String`, `args[0]`). Esos fragmentos quedaban en líneas independientes. El HTML de algunos visores también representa cada fragmento con un SPAN de bloque o con posiciones absolutas.

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

Las pruebas usan formatos de portapapeles representativos. No se dispone del portapapeles ni del PDF externo real mostrado por el usuario. Si el visor solo entrega texto plano, se puede reconstruir el flujo y los marcadores explícitos; no se puede recuperar de forma fiable una jerarquía tipográfica que el visor omitió. No se reescriben automáticamente notas ya guardadas: se aplica al pegar de nuevo.
