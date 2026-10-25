# Editor de código y selector de modelos en dispositivos táctiles

## Diagnóstico

- El selector usaba `innerHeight`, que en Android puede seguir incluyendo el
  área cubierta por el teclado. Enfocaba el buscador al abrirse y no escuchaba
  cambios de `visualViewport`.
- El asistente solo seguía la altura visible en algunos tamaños de móvil.
  En tabletas y al ampliar el panel podía quedar detrás del teclado.
- El código recibía estilos generales del editor. Se fija un fondo grafito
  uniforme para `pre`, `code` y el contenido editable, con anchura limitada y
  desplazamiento horizontal interno. Se conserva el resaltado de sintaxis.

## Corrección y verificación

El selector respeta los límites y desplazamientos de `visualViewport`, se
reposiciona al abrir/cerrar el teclado y no enfoca automáticamente el buscador
en dispositivos táctiles. La búsqueda se activa tocándola. En escritorio se
mantiene el enfoque automático. Los listeners se retiran al cerrar el menú.

Ejecutar `node tools/check_mobile_layout.cjs` con Playwright y Chromium
disponibles (`CHROMIUM_PATH` permite indicar otro ejecutable).
`ATLAS_SCREENSHOTS=/tmp/atlas-mobile-check` guarda capturas opcionales.

La prueba carga el editor compilado y los estilos reales, y ejecuta el código
del selector de producción con datos ficticios, sin consultar datos personales.
Comprueba centrado, fondo en claro/oscuro, líneas largas, enfoque táctil,
búsqueda, selección, Escape y límites del panel normal/ampliado con una
reducción y un desplazamiento simulados del viewport visual. Tamaños:
412×915, 800×1280, 1280×800 y 1440×900.

`--baseline` carga los archivos de HEAD: antes de incorporar esta corrección
falla la comprobación del fondo interno del código, reproduciendo la regresión.
Esto verifica el componente en Chromium; no sustituye una comprobación física
con el teclado Samsung en S24 Ultra y Tab S9 Ultra, que queda pendiente tras
desplegar los cambios.

## Navegación a media pantalla

JavaScript ya usaba 1024 px como límite del modo compacto, pero CSS mantenía
la barra de espacios y el árbol de navegación visibles entre 769 y 1024 px.
En ese intervalo tampoco aparecía el botón de menú. Se unifica la navegación
en un panel desplegable hasta 1024 px: ambos paneles quedan ocultos al reducir
la ventana y el contenido recupera el ancho disponible. El botón abre el árbol
actual, permite volver a la lista de espacios y mantiene accesible cerrar sesión.
Se limpian los estados de ocultación de escritorio al pasar al panel compacto.
El fondo para cerrar el menú queda por encima del activador lateral del índice.

`node tools/check_sidebar_layout.cjs` carga la plantilla y los estilos reales,
incluidos los marcos Centinela, y ejecuta las funciones de navegación sin datos
de producción. Verifica 944, 1024, 769, 768 y 412 px, apertura, cierre al pulsar
fuera o seleccionar una entrada, navegación interna y restauración a 1025 px.
También comprueba la carga inicial a 944 px. Antes de incorporar la corrección,
`--baseline` reproduce el fallo: la barra de espacios sigue visible a 944 px.
