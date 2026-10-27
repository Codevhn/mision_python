# Hyprland independiente y restauración de temas

## Problema y corrección

`cyberpunk.css`, cargado al final de la cascada en Atlas, login y Finanzas,
sobrescribía todos los temas con `data-style="aero"`. El identificador elegido
se conservaba, pero los colores, reflejos, botones, iconos y marcos recibían
siempre la misma pintura oscura. Su especificidad también desplazaba las
paletas de los lenguajes. Esto explica «Naranja Ámbar · Actual» con aspecto cian.

La capa se convierte en `hyprland.css`. Sus reglas de presentación se limitan
a `data-theme-id="hyprland"`. El registro compartido añade una entrada **Hyprland**
en **Escritorios**, con familia `data-style="hyprland"`, también disponible en el
login. Los identificadores y preferencias existentes permanecen intactos.
La paleta **Cyberpunk**, dentro de Neón creativo, conserva su identidad propia.

Hyprland usa barra flotante, separación entre ventanas, bordes discretos,
acentos cian/lavanda, controles planos e iconos lineales. Oculta exclusivamente
en su ámbito los adornos Centinela y muestra una explicación en el selector de
marcos. La preferencia de marco guardada vuelve a aplicarse al salir de Hyprland.
Los temas Aero recuperan sus colores y superficies Windows 7 de la cascada previa,
sin revertir las mejoras funcionales de ancho del editor o de bases de datos.
Finanzas sigue los cambios por el mecanismo existente de atributos del iframe.

## Iconos por familia

Aero y sus paletas de Windows 7 muestran los iconos ilustrados. OpenCode
(incluidas sus variantes claras y de editor), Notion e Hyprland usan iconos
lineales de color heredado. La visibilidad se define en los estilos compartidos:
OpenCode ya no depende de reglas que existían solo para Notion. La regla de
ocultación también evita que el estilo genérico de los SVG de navegación muestre
las dos versiones simultáneamente en Aero.

El menú táctil usa el mismo componente de iconos que la barra de PC; el
encabezado para volver al listado conserva el SVG al cambiar de nivel.
Las etiquetas de sistema generadas incluyen ambas representaciones. Los
widgets antiguos que usan un solo SVG cambian únicamente las referencias
conocidas de los sprites de Atlas, restaurando los atributos originales al
volver a Aero. No se procesan texto de notas, imágenes ni SVG subidos.

## Lectura y Galaxy Tab S9 Ultra

Los párrafos y listas del editor usan 18 px en escritorio/tableta y 17 px en
ventanas de hasta 768 px, con interlineado 1,75. Código, controles, títulos e
impresión no se amplían. Se respeta el tamaño específico de un registro cuando
este tiene configurada su propia tipografía.

La referencia de hardware de la Tab S9 Ultra es una pantalla de 14,6 pulgadas,
2960×1848 píxeles, en un cuerpo de 326,4×208,6×5,5 mm. La resolución física no
equivale al viewport CSS: con DPR 2 corresponde a 1480×924 antes de descontar
las barras del navegador; densidad, orientación, DeX y ajustes pueden cambiarlo.
Referencia del fabricante: https://www.samsung.com/global/galaxy/galaxy-tab-s9/.
La consulta de esa página fue bloqueada por el proxy de este entorno (403);
no se realizó una medición sobre una tableta física.

Antes, el menú aparecía solo hasta 1024 px. Ahora `atlas-drawer-nav` reúne esa
condición y la detección táctil existente (`maxTouchPoints`/`is-touch-device`).
Se establece antes de cargar CSS y se sincroniza al redimensionar. En tabletas
anchas, incluidas las que informan puntero fino por el S Pen, la barra lateral
queda oculta y el botón de menú abre/cierra el panel. La navegación de PC sin
pantalla táctil conserva su comportamiento. En tabletas se limita la lectura
a 960 px centrados, respetando las páginas de registro configuradas a ancho completo.

## Evidencia y reproducción

- `node knowledge_base/editor-src/test/themeRegistry.test.js`: identificador
  independiente, persistencia y vuelta exacta a la selección anterior.
- `tools/check_themes.cjs`: instancia real de Flask con datos temporales;
  los otros 66 temas tienen los mismos estilos computados con la hoja Hyprland
  activada o desactivada. Comprueba los 67 temas, tamaño del texto y del código,
  selección real, recarga, marcos, login, iframe de Finanzas y tres tamaños.
  Comprueba iconos de navegación y de sistema en todas las familias y la
  existencia de sus símbolos lineales, además de la vuelta al sprite ilustrado.
- `tools/check_tablet_layout.cjs`: seis temas en cinco configuraciones
  (1480×924, 924×1480, 1480×850, 1848×1155 y 1480×924 con detección táctil pero
  puntero fino). Comprueba menú, orientación, columna de lectura y escala 1,
  más los iconos del menú y del encabezado al entrar en un espacio. Incluye
  OpenCode oscuro y claro.
- `tools/check_sidebar_layout.cjs`: PC, media pantalla y móvil, incluida carga
  inicial y restauración de navegación al ampliar una ventana de PC.

Usar los scripts de integración solo contra un servidor local desechable.
Arranque probado desde `knowledge_base`, con el Python del entorno virtual:

```bash
DATA_ROOT="$(mktemp -d /tmp/atlas-theme-check.XXXXXX)" \
SECRET_KEY=atlas-theme-check-secret KB_PASSWORD=atlas-theme-check-password \
SECURE_COOKIES=false ENABLE_CODE_EXECUTION=false \
../.venv/bin/python -m flask --app app run --host 127.0.0.1 --port 8121
```

Desde la raíz, en otra terminal: `node tools/check_themes.cjs` y
`node tools/check_tablet_layout.cjs`. Requieren Playwright y Chromium;
`CHROMIUM_PATH` permite indicar el ejecutable. Los informes y capturas se guardan
en `/tmp/atlas-theme-evidence` y `/tmp/atlas-tablet-evidence`. Los datos de muestra
se crean solo en esa instancia temporal. Estas comprobaciones no sustituyen la
validación física en Samsung Internet/Chrome del dispositivo del usuario.
