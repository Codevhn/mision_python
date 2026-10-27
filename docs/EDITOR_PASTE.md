# Pegado estructurado en BlockNote

## Diagnóstico

La versión anterior (`6a737ab834fac1d07568eea5428a62ce0eb0b6be`)
registraba en `editor-src/src/main.jsx` un listener de `paste` en fase de
captura, antes del importador de BlockNote. `src/pasteCode.js` consideraba código
un documento completo con solo dos líneas que coincidieran con palabras como
`import`, `print` o `#`, o con determinada sangría. Así, un texto con encabezados,
párrafos, listas y un ejemplo Python terminaba en un único bloque Python.

Además de ignorar el HTML y los metadatos estructurales del portapapeles, ese
listener insertaba después del bloque actual, sin reemplazar la selección.
Cancelaba el evento antes de comprobar si el destino ya era código; en ese
caso descartaba el pegado. Las pruebas antiguas verificaban la clasificación,
pero no el resultado del pegado en un editor real.

El menú restringe las conversiones que podrían destruir estructura o
reinterpretar código como Markdown (`src/blockCatalog.jsx`). No se cambia esa
protección ni se utiliza la conversión a párrafo como solución.

## Flujo corregido

Se elimina el listener de captura, el detector heurístico y sus pruebas. El
pegado se configura mediante la API oficial `pasteHandler` de BlockNote 0.51.4:

- El importador nativo conserva los bloques internos (`blocknote/html`), Markdown
  explícito (`text/markdown`), HTML y texto, usando su propia selección e historial.
- Se configura `prioritizeMarkdownOverHTML: false`: si existe HTML estructurado,
  se respeta antes que las conjeturas sobre su representación `text/plain`.
  Un comentario Python con `#` no debe convertirse en encabezado al copiar una
  página que ya lo identifica como código. Sin HTML, el importador nativo de
  Markdown sigue creando encabezados, listas, énfasis y bloques delimitados.
- Dentro de código, BlockNote conserva texto literal. El contenido del pegado
  no decide cambiar el tipo del bloque de destino.
- Imágenes/archivos siguen el flujo nativo de subida. No cambia el endpoint.
- El adaptador `src/clipboard.js` normaliza solo la intención explícita de código
  de `vscode-editor-data`. La ruta de VS Code de esta versión de BlockNote usa
  `view.pasteHTML` con código sin escapar; en la prueba el resultado quedaba en
  un párrafo. Atlas crea `pre > code` mediante `textContent` y pasa el HTML al
  importador público `editor.pasteHTML`, que sí normaliza los bloques. Se conservan
  `<`, `>`, `&`, saltos de línea, lenguaje y sangría. Los metadatos inválidos
  recurren al HTML/Markdown/texto disponible, sin descartar el contenido.

No se adivina que el texto sin formato es Python por contener ciertas palabras.
Un fragmento sin metadatos ni delimitadores puede ser ambiguo: el usuario puede
pegarlo dentro de un bloque de código o copiar Markdown con sus delimitadores.
No se reescriben entradas guardadas previamente; un bloque antiguo mal importado
requiere volver a pegar su contenido en un párrafo vacío, fuera del bloque de
código. Esto evita alterar código legítimo almacenado.

El bundle compilado está incluido en el cambio. El identificador de caché de
`app.py` ya depende de su contenido; no requiere cambiar versiones manualmente.

## Evidencia y reproducción

Fuentes concretas revisadas en la dependencia fijada `@blocknote/core@0.51.4`:

- `src/api/clipboard/fromClipboard/pasteExtension.ts`: importación, contexto de
  código, prioridad de formatos y protección de solo lectura.
- `src/api/clipboard/fromClipboard/acceptedMIMETypes.ts`: tipos admitidos.
- `src/api/clipboard/fromClipboard/handleVSCodePaste.ts`: ruta de VS Code.
- `src/editor/managers/ExportManager.ts`: normalización del importador público.

Desde `knowledge_base/editor-src`:

```bash
npm ci --no-audit --no-fund
npm test
npm run build
```

Desde la raíz, con Playwright y Chromium instalados:

```bash
node tools/check_editor_paste.cjs
node tools/check_mobile_layout.cjs
python -m pytest knowledge_base/tests/test_print_export.py knowledge_base/tests/test_document_export.py -q
```

`CHROMIUM_PATH` permite indicar el ejecutable del navegador. No hace falta un
servidor: la prueba de pegado sirve los assets locales al navegador y usa el
editor compilado, sin mocks del importador ni datos del usuario. Emite eventos
con payloads de portapapeles simulados, en escritorio 1440×900, teléfono Android
412×915 y tableta Android 1480×924. El agente Android también activa la variante
de código que Atlas usa en esos dispositivos.

Se verifican Markdown mixto y guardado/recarga, HTML con encabezados/listas/enlaces,
prioridad del HTML, MIME Markdown, copia interna generada por el propio editor,
falsos positivos de encabezados, texto literal dentro de código, metadatos de
VS Code válidos/inválidos, prosa, reemplazo de selección, deshacer/rehacer y
rechazo de pegado en solo lectura. Pasaron los tres perfiles. La suite existente
de diseño móvil pasó sus cuatro tamaños. Las pruebas Python de impresión y
exportación pasaron: **18 passed**, con 8 avisos de deprecación existentes.
También pasaron `npm test` y el build de producción.

La reproducción contra el bundle anterior falla intencionadamente en la primera
comprobación: todo el documento queda en un solo `codeBlock` Python, con las
marcas Markdown como texto. Se puede repetir incluso después de este commit:

```bash
node tools/check_editor_paste.cjs --baseline=6a737ab834fac1d07568eea5428a62ce0eb0b6be
```

## Estado de REA y comparación con Notion

En esta sesión no está disponible REA: se revisaron las herramientas expuestas
y los catálogos de habilidades cloud y executor, sin encontrarlo. Tampoco está
entre los plugins instalables ofrecidos aquí. No se accedió a Notion ni se
observaron sus eventos de portapapeles. Esta corrección se fundamenta en el
código de Atlas, el código de BlockNote y las pruebas del editor, **no en un
análisis de Notion**.

Cuando REA esté disponible, el próximo paso es observar un documento de prueba
con encabezado, párrafo con énfasis, lista y código en Notion: registrar origen,
formatos MIME disponibles y bloques obtenidos al pegar fuera/dentro de código y
sobre una selección. Esa evidencia permitiría comparar comportamientos concretos;
la equivalencia con Notion queda pendiente. La emulación Android tampoco sustituye
una comprobación física en Samsung Internet o Chrome del dispositivo.
