# Auditoría de integración del Peek de registros

Fecha: 2026-11-17. Base: `2f6f0d5`. Correcciones verificadas, preparadas para publicar.

## Qué editor utiliza

`app.js::_openPagePeek` crea una instancia real de `BlockEditor.create` en
`#pagePeekEditor`. `main.jsx::createInstance` monta el mismo `EditorView`, esquema,
BlockNoteView, catálogo de bloques y importador que las páginas completas. El
Peek tiene instancia, contexto de página y cola de guardado propios. Los fallos
reproducidos pertenecen a la integración del panel con los temas, el diálogo de
subpáginas y las operaciones sobre enlaces; no a un editor de texto alternativo.

## Hallazgos y correcciones

1. **Paleta fija en el Peek.** `database-preview.css` incluía el overlay en un
   grupo con variables oscuras fijas y volvía a imponer `#202020 !important` al
   panel. `database-peek.css` también imponía blanco en temas claros. Se retira
   esa paleta del Peek y se usan las variables del tema en panel, barra,
   separadores y propiedades. Las tablas de base de datos y sus popovers fuera
   del Peek conservan sus reglas. Hyprland y Notion mantienen las superficies
   específicas que sus propias hojas definen para el panel.

2. **Diálogo debajo del panel.** `pageNameOverlay` y el Peek comparten nivel de
   modal, pero el Peek aparece después en el DOM. Marcar el diálogo con
   `data-peek-owner` evitaba cerrar el panel al interactuar con él, pero no lo
   elevaba. En Chromium, con Peek ancho, `elementFromPoint` sobre el botón Crear
   página devolvía un elemento del panel y la prueba fallaba. Se eleva únicamente
   el diálogo de nombre que pertenece al Peek. Tras la corrección devuelve
   `pageNameConfirm` y el botón es accesible sin cerrar el Peek.

3. **Enlaces anidados no actualizados/eliminados.** `updatePageBlock` y
   `removeBlock` solo buscaban en `editor.document.find`, es decir, en los bloques
   raíz. En las instancias marcadas `isPeek`, ahora usan `editor.getBlock(blockId)`,
   que encuentra también los hijos. Las demás conservan su búsqueda original.
   Se verifica un enlace realmente anidado dentro de un desplegable, no solo
   texto con apariencia de lista. El contrato de ambas funciones no cambia.

4. **Creación y guardado.** El diálogo se cerraba antes de terminar el POST. Ante
   un fallo no conservaba un flujo de reintento claro. El flujo específico `confirmPeekPageCreate` conserva el nombre
   hasta recibir éxito, impide solicitudes duplicadas durante la operación y
   actualiza el enlace en la instancia de origen. En Peek espera su cola de
   guardado antes de anunciar la finalización. Un fallo al guardar conserva el
   mecanismo de borrador/recuperación existente; no implica repetir el POST.

5. **Cancelación y cierre.** Escape en el diálogo se consume allí para no cerrar
   también el Peek. Cerrar un Peek con un nombre pendiente cancela su placeholder
   antes de guardar; si la creación está en curso, bloquea el cierre hasta que termine. No se deja un diálogo trabajando sobre una instancia
   destruida.

6. **Recuperación de placeholders antiguos.** Dentro del Peek, un `pageLink` con `pageId` vacío
   era inerte. Al pulsarlo se vuelve a abrir el diálogo sobre ese mismo bloque y
   contexto. No se modifica automáticamente ningún documento del usuario.

7. **Nombre temporal después de renombrar.** El bloque `pageLink` mostraba
   directamente `props.title`, una copia del nombre escrita al crear el enlace.
   El título real sí se guardaba en los metadatos del hijo. Ahora `_openPagePeek`
   consulta en paralelo los metadatos de sus hijos y entrega un mapa de títulos
   a esa instancia. Solo el renderer con `context.isPeek` usa ese nombre actual.
   Al reabrir el Peek se actualiza la etiqueta sin reescribir el Markdown del
   padre. Si falla la lectura de hijos, se conserva el título del enlace como
   respaldo; no se impide abrir el contenido. No hay solicitudes por palabra ni
   por enlace, ni consultas nuevas desde el editor de página completa.

El contexto del registro ya se transmitía desde el catálogo al diálogo. No se
atribuyó el problema a un `parent_id` incorrecto sin evidencia: la prueba
comprueba que el hijo pertenece al registro y que el Markdown de la página de
fondo no recibe ese enlace.

## Verificación reproducible

Usar únicamente el servidor desechable `tools/run_library_assistant_fixture.py`.
No utiliza libros personales ni realiza consultas a modelos de IA.

```bash
python tools/run_library_assistant_fixture.py
# En otra terminal:
node tools/check_peek_subpages.cjs
node tools/check_peek_tables.cjs
node tools/check_peek_resize.cjs
```

`check_peek_subpages.cjs` utiliza el botón (+) real y el menú nativo del editor.
Comprueba capas con hit testing del navegador, creación con la API real, padre
correcto, guardado y reapertura, navegación al hijo, cancelación con Escape,
reintento tras un 503 simulado, recuperación de un placeholder antiguo y edición
de un enlace dentro de un desplegable. Para este último llama al handler React
del chip con el desplegable cerrado; los demás pasos de creación usan el diálogo
visible. También crea y abre una subpágina desde el editor de página completa
para comprobar el flujo compartido fuera del Peek. Comprueba cambios de tema en caliente con Aero Ámbar, Aero claro,
OpenCode, Hyprland y Notion Native. Guarda una captura de prueba en
`/tmp/atlas-peek-audit-amber.png`.

La prueba también introduce texto en el Peek de una subpágina, cambia allí su título,
guarda, vuelve al Peek del padre y comprueba el nombre definitivo. Confirma que
el cuerpo del padre conserva su enlace original y que el contenido pegado y el
título del hijo están guardados.

Las comparaciones de tablas cubren tres tamaños y cinco temas. El checker de
redimensionamiento cubre escritorio, ventana partida, tablet táctil y teléfono.
También se ejecutan `npm test`, la compilación de producción y las 27 pruebas
backend de acciones de registro y workspace. Los perfiles son de Chromium;
no son comprobaciones sobre hardware Samsung físico.

Resultado: pasaron la nueva prueba de integración, los tres perfiles de tablas,
los cuatro perfiles de redimensionamiento, `npm test`, la compilación y las
27 pruebas backend indicadas.

## Alcance

No se cambia el esquema de datos, las rutas backend, el motor BlockNote ni el
modelo de guardado. Se mantienen los controles existentes del Peek y su
redimensionamiento. Las dos funciones de enlaces y el diálogo son compartidos
con otros editores: sus cambios están condicionados por `context.isPeek` y el
flujo de creación original fuera del Peek se conserva. Los mapas de títulos son
locales a cada instancia del Peek; no se instala una caché global de nombres. No se hizo una auditoría general de toda la aplicación ni
se afirmó haber inspeccionado una sesión de Notion.


## Selector de iconos del diálogo (seguimiento)

Se reprodujo que el selector existía en el DOM, conservaba `data-peek-owner`,
pero su `z-index:9500` quedaba por debajo del diálogo de nombre (`11000`).
El hit testing sobre el buscador devolvía otro elemento; la prueba fallaba antes
de corregirlo. Se eleva únicamente `.icon-picker-popover[data-peek-owner]` a
`12001`. Los selectores fuera del Peek conservan su nivel original.

La prueba de integración ahora abre el selector desde el diálogo con nombre ya
escrito, comprueba que el buscador recibe interacción, selecciona `lucide:book-open`,
verifica que conserva el nombre y el Peek abierto y comprueba que el icono
seleccionado se guarda en los metadatos de la subpágina. La regla reside en
`style.css`, que ya participa en la invalidación de caché de los assets.


La navegación a subpáginas y el regreso por breadcrumb se auditan y corrigen en
[DATABASE_PEEK_NAVIGATION_AUDIT.md](DATABASE_PEEK_NAVIGATION_AUDIT.md). Ese cambio
sustituye la expectativa anterior de salir a página completa al pulsar un enlace
dentro del Peek.
