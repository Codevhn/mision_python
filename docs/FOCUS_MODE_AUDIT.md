# Auditoría y corrección del modo focus

## Fallos reproducidos

La prueba previa en Chromium (1440 × 900, curso con portada y tema Gris oscuro)
reprodujo el problema de las capturas sin datos personales:

| Gravedad | Hallazgo | Evidencia / consecuencia |
| --- | --- | --- |
| Crítica | El contenedor de lectura se convertía en una fila flex | Portada, contexto y artículo competían por el ancho; el artículo medido acababa en x=1698 y ancho 0 |
| Alta | Se ocultaba `sidebar`, pero no `activityBar` | La navegación actual seguía visible y se reservaban 200 px a la izquierda |
| Alta | Reglas contradictorias de anchura | Focus pedía 800 px; otra hoja lo anulaba con `max-width:none`; el lienzo no tenía una columna de lectura coherente |
| Media | Salida flotante «× exit» sin relación con el área útil | No seguía el espacio reservado al asistente y carecía de un control de lectura claro |
| Media | Sin conservación del punto de lectura | La portada y la redistribución de líneas desplazaban el párrafo visible al alternar |
| Media | Escape no respetaba los controles internos | Podía abandonar focus al manejar otro panel; el selector de lenguajes tampoco cerraba con Escape |
| Media | Márgenes de Hyprland e introducción vacía | Sus insets seguían activos; ocultar solo el contenido de la guía dejaba márgenes vacíos |

## Comportamiento resultante

- Una sola columna, dentro del editor y contenedor de desplazamiento originales.
- Focus oculta navegación, portada, contexto, propiedades, guía de la lección,
  relaciones y otras acciones auxiliares; conserva título, contenido y navegación
  anterior/siguiente de cursos.
- Barra discreta con nombre de la lección y «Salir de focus». Se actualiza al pasar
  a otra lección y permanece dentro del espacio de lectura reservado por el dock.
- Ancho de lectura de 880 px como máximo, incluido contenido multimedia; tablas y
  código conservan sus contenedores de desplazamiento horizontal. No cambia los
  tamaños tipográficos elegidos ni la estructura del documento.
- Título y prosa comparten alineación. En móvil los párrafos se leen alineados al
  inicio, evitando espacios excesivos por justificación; el formato guardado no
  se modifica.
- Al alternar se conserva el primer bloque visible y su desplazamiento respecto
  al borde de lectura, mediante una referencia al DOM, sin recrear el editor.
  Se descartan restauraciones pendientes si cambia la lección. La redistribución
  de líneas dentro de un párrafo puede variar al cambiar el ancho.
- Entrar requiere una página abierta; un Peek se cierra mediante su flujo normal
  de guardado. No se monta un segundo editor ni se añade un guardado alternativo.
- Escape deja actuar primero al diálogo, selector, Peek o asistente. El selector
  de lenguajes ahora cierra y devuelve el foco a su botón. El botón de salida
  funciona con teclado y devuelve el foco a un control visible.
- La navegación entre lecciones mantiene focus; cambiar de sección lo abandona.
- Los estilos de focus son de pantalla; el PDF conserva su plantilla editorial.

## Validación

`tools/check_focus_mode.cjs` usa el servidor desechable y comprueba a 1440 y 412 px:
Gris oscuro, Óxido, Papel, Aero Nocturno y Hyprland; ausencia de portada/navegación,
columna sin desplazamiento lateral, título alineado, mismo nodo editor, posición
del primer bloque visible, dock del asistente en columnas/filas, Escape en el
selector y en focus, navegación real a la siguiente lección, salida a Inicio y
Markdown original sin cambios.

`tools/check_code_block_surfaces.cjs` verifica aparte selección/búsqueda de lenguaje,
sintaxis en claro/oscuro, copia, ejecución simulada y apilamiento entre bloques en
página y Peek, escritorio y móvil. El bundle del editor se recompiló con Vite.

Las pruebas usan Chromium. No equivalen a una prueba en dispositivos físicos,
Safari ni a un ensayo prolongado de edición. No se modificó contenido personal.
