# Ancho ajustable de Side Peek

Los registros abiertos en Side Peek se pueden redimensionar arrastrando su borde
izquierdo. El ancho se guarda en el navegador y se reutiliza al abrir otro
registro o recargar Atlas; no es una propiedad del registro ni modifica su texto.

- Arrastrar a la izquierda amplía el panel; a la derecha lo reduce.
- El borde puede recibir foco: flechas izquierda/derecha ajustan 20 px, con Shift
  50 px; Inicio/Fin llevan a los límites.
- Escape cancela un arrastre en curso. Doble clic restaura el ancho inicial.
- En ventanas amplias la base reserva exactamente el ancho del panel, conservando
  espacio para trabajar con ella. El límite tiene en cuenta la barra lateral.
- En pantallas de hasta 650 px el Peek ocupa la pantalla completa y no muestra el
  tirador. Al ampliar de nuevo se recupera el ancho elegido, con límites actuales.
- Center Peek y página completa mantienen sus controles y geometría propios.

`static/peek-resize.js` controla la geometría con Pointer Events y captura de
puntero, compatible con ratón y táctil. Agrupa los movimientos mediante
requestAnimationFrame. Un ResizeObserver reajusta la altura del título al cambiar
el ancho. Solo observa atributos del overlay y cambios geométricos concretos;
no recorre ni reconstruye el contenido del editor.

`static/peek-resize.css` limita el cambio a Side Peek de bases de datos. Los assets
se cargan desde index.html y participan en `_build_id()` para invalidar la caché.
No hace falta reconstruir el bundle de BlockNote para este cambio.

## Validación

Con una instancia local desechable:

```bash
python tools/run_library_assistant_fixture.py
# En otra terminal, desde la raíz:
node tools/check_peek_resize.cjs
```

El checker admite `ATLAS_TEST_URL`, `ATLAS_TEST_PASSWORD` y `CHROMIUM_PATH`.
Crea una base y registros mediante las APIs reales. Verifica escritorio 1697×1000,
media pantalla 1300×944, tablet táctil 1480×924 y teléfono 412×915. Comprueba
arrastre, persistencia entre registros y recarga, límites, teclado, cancelación,
restablecimiento, ajuste del título, cambio de viewport, Center Peek, página
completa y conservación del texto. En escritorio comprueba Aero, OpenCode,
Hyprland y Notion; la tablet incluye un arrastre táctil mediante CDP.

Las medidas se toman una vez finalizada la animación de apertura del modal para
no confundir su escala transitoria con el ancho persistido. Estos perfiles no
sustituyen una prueba en hardware físico.

Pasaron los cuatro perfiles y las 27 pruebas backend de acciones y workspace de
bases de datos. No se utilizaron servicios de IA ni datos personales.

## Apariencia de tablas en Peek (2026-11-17)

El editor lateral no tenía la clase `entry-body`. Por eso las reglas de fondos
alternos y celdas de `style.css`, y los bordes suaves de `editing-surface.css`,
solo se aplicaban en página completa. El Peek heredaba los bordes de BlockNote.
Además, su paleta oscura local sobrescribía los colores del tema activo.

Las tablas de contenido ahora comparten las reglas de presentación en página
completa, Side Peek y Center Peek. Los colores de tabla se resuelven en el tema
raíz para que la paleta local del Peek no los sustituya; las celdas mantienen
bordes de 1 px con contraste suave (9 %). El cambio conserva los datos y permite
que cada vista adapte el ancho a su espacio disponible. `editing-surface.css`
forma parte del identificador de caché de los assets.

Verificación: `node tools/check_peek_tables.cjs` contra el servidor desechable
anterior. Pasaron 1697×1000, 1480×924 y 412×915, cada uno con Aero, OpenCode,
Hyprland, Notion Native y el alias claro `light`. Se comparan los estilos
calculados de las seis celdas del mismo contenido en los tres modos: los cuatro
bordes, fondos, color de texto, padding, tamaño y peso de fuente. También se
comprueba que el Markdown guardado no cambia. No se usaron consultas a IA ni
datos personales. Son perfiles de Chromium, no dispositivos Samsung físicos.
