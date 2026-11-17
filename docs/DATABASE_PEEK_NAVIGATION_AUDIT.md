# Auditoría de navegación entre subpáginas del Peek

Fecha: 2026-11-17. Base: `bec29ce`.

## Diagnóstico

El bloque `pageLink` invocaba siempre `window._loadEntryById(pageId)`, incluso
cuando pertenecía al editor del Peek. Esa función abre el editor principal y
cierra el panel. Por eso seguir ROADMAP GENERAL salía de la base de datos aunque
el usuario no hubiera elegido la acción de página completa.

El regreso posterior utilizaba el breadcrumb del editor principal, no una ruta
del Peek. Allí el título mostrado por un enlace procede del snapshot guardado en
su Markdown, mientras que el Peek ya resuelve los títulos actuales de sus hijos
por ID. Esto explica que los mismos enlaces puedan reaparecer con nombres
anteriores al cambiar de contexto. No se han inspeccionado los archivos privados
del usuario ni se afirma que sus datos contengan duplicados reales.

La prueba de integración previa incluso esperaba que el enlace del Peek abriera
el editor principal. Esa expectativa era incorrecta para el flujo solicitado y
se ha corregido, además de añadir una prueba específica del recorrido completo.

## Corrección limitada al Peek

- `context.openPage` dirige los enlaces de instancias `isPeek` al navegador local
  del panel. Los enlaces del editor principal mantienen su comportamiento.
- El panel mantiene una ruta de IDs, títulos y posiciones de lectura. Su nav
  «Ruta del Peek» permite volver al roadmap o a cualquier ancestro visitado.
  No modifica el breadcrumb global ni el historial del navegador.
- Cada regreso lee los metadatos y el cuerpo actuales. La cola de guardado se
  vacía **antes** de leer el destino, para que un regreso inmediatamente después
  de renombrar no consulte los metadatos anteriores.
- Se conserva Side/Center Peek y el ancho elegido. El editor de ROADMAPS sigue
  siendo la página de fondo. El callback de actualización de la base se conserva
  durante todo el recorrido y se ejecuta al cerrar finalmente el panel.
- La lista anterior/siguiente de registros se conserva al regresar a la raíz;
  las subpáginas no se confunden con registros hermanos de la base.
- «Abrir como página completa» sigue disponible como acción explícita para la
  página que se está leyendo.

## Protección del contenido

La carga de destino se valida antes de desmontar la página actual. Un error de
lectura deja abierto el editor original. Un fallo de guardado bloquea la
navegación y mantiene el borrador y los controles de recuperación existentes.

Un token descarta respuestas de navegaciones antiguas y evita que una respuesta
tardía vuelva a abrir un Peek que se cerró. Una revisión de edición impide
sustituir el editor si el usuario escribió mientras llegaba el destino. En ese
caso conserva el contenido actual; no fuerza el cambio de página.

El cuerpo del nuevo editor permanece inerte hasta terminar de cargar su
Markdown. La restauración de lectura se realiza después de preparar el editor y
ajustar la altura del título y completar la animación. Se desactiva el anclaje
automático del navegador solo en el cuerpo del Peek, que ahora restaura su
propia posición. El observador de tamaño reutiliza el mismo ajuste de título
para evitar desplazamientos adicionales. El mapa de títulos continúa siendo local al Peek:
no se reescriben enlaces de otros documentos ni se modifica el esquema backend.

## Pruebas reproducibles

Servidor desechable: `python tools/run_library_assistant_fixture.py`.

```bash
node tools/check_peek_navigation.cjs
node tools/check_peek_subpages.cjs
node tools/check_peek_resize.cjs
node tools/check_peek_tables.cjs
```

El nuevo checker crea una base ROADMAPS, el registro Python Profesional 2028,
una subpágina y una nieta con IDs estables y snapshots de nombres antiguos.
Comprueba ambos modos del Peek en viewports 1697×1000, 1480×924 y 412×915:

- recorrido por enlaces y regreso por la ruta local;
- renombrado seguido de regreso inmediato, y nombres actuales al volver;
- conservación del modo, ancho, posición de lectura y contenido de fondo;
- callback de cierre y apertura a página completa solo por su botón;
- errores simulados de lectura y guardado;
- en escritorio, edición y cierre durante una respuesta retrasada.

Las capturas del recorrido se guardan en `/tmp/atlas-peek-navigation-*.png`.
Las otras pruebas verifican creación, iconos, cancelación, reintento, enlaces
anidados, página completa fuera del Peek, tablas y redimensionamiento. También
se ejecutan `npm test` y la compilación del editor.

Se usan datos sintéticos y Chromium. No se consumen solicitudes de IA y los
viewports no sustituyen una prueba en hardware Samsung físico. El alcance no
incluye migrar snapshots de enlaces en páginas completas ni otros navegadores
de Atlas fuera del Peek.


## Resultado

Pasaron los tres perfiles de navegación en Side y Center Peek, incluidos los
controles de registros hermanos al regresar a la raíz. Pasaron también las
pruebas de creación/iconos/renombrado, los cuatro perfiles de redimensionamiento,
los tres perfiles de tablas con cinco temas, `npm test` y la compilación.
Los escenarios retrasados de escritorio comprobaron que escribir durante una
carga conserva el editor original y que cerrar el Peek descarta la respuesta
pendiente. La reapertura espera a que termine un cierre en curso.
