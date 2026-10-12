# Auditoría de integración visual: Finanzas y meta

Revisión del 10 de octubre de 2026, a partir de las capturas del sistema publicado. Se revisaron Inicio, Finanzas, sus cuatro formularios y los selectores compartidos de las ventanas de Atlas.

| Problema observado | Corrección |
| --- | --- |
| Barras horizontal y vertical en un formulario que cabía en pantalla | Los adornos sobresalían tres píxeles y generaban desbordamiento. El marco permanece fuera del área desplazable; solo el cuerpo del formulario puede desplazarse verticalmente cuando falta altura. |
| Menús de Moneda y Cuenta con selección azul del navegador | Reutilización de los selectores de Atlas, incluidos Tipo y Cuenta de destino. Conservan los valores del formulario, validación y eventos. |
| Mes y Fecha con calendario del navegador y textos en inglés | Calendarios con colores de Atlas y textos en español, operables con ratón y teclado. |
| Menús flotantes que podían desplazarse respecto al campo dentro del cristal | Los menús usan la capa superior del navegador para evitar que el efecto del marco altere sus coordenadas. |
| Acciones como «Cuenta» y «Presupuesto» demasiado pequeñas | Botones con superficie Aero, borde, altura y respuesta al foco/hover coherentes con el resto de controles. |
| Espacios vacíos altos y ahorro con indicaciones repetidas | Estados vacíos compactos, indicación única para empezar y barras de comparación vacías cuando no existen importes. |

La comprobación en Chromium cubre Meta, Cuenta, Movimiento y Presupuesto; selectores en Inicio y Finanzas; selección de mes y fecha; Tab, flechas y Escape; alineación de menús; temas claro, ámbar y esmeralda; y pantallas estrechas o bajas. También se verificaron los selectores compartidos de otros diálogos con cinco temas, opciones deshabilitadas y retirada del menú al cerrar la ventana.

Se repitió el recorrido de Finanzas para comprobar guardado, transferencias, presupuestos y gráficos después de sustituir los controles. Esta revisión cubre las superficies indicadas; no representa una auditoría completa de todos los espacios de Atlas.

Capturas de la implementación:

- [Meta y selector de moneda, sin barras del marco](../design/atlas-finance-goal-polished.png)
- [Calendario y estados vacíos de Finanzas](../design/atlas-finance-calendar-polished.png)

La revisión posterior de [Centinela en todo Atlas](ATLAS_CENTINELA.md) amplía la integración a navegación, espacios, ventanas y diálogos. Se verificaron la persistencia independiente del marco, los colores, las pantallas estrechas, los selectores y la ausencia de barras añadidas por la decoración. No altera las correcciones de desplazamiento y menús documentadas arriba.
# Títulos de lecciones en Cursos

Los subtemas del árbol de Cursos admiten hasta dos líneas, con elipsis para los títulos más largos. Se compactaron las sangrías de curso y módulo sin ensanchar el panel ni reducir la tipografía. El atributo `title` conserva el nombre completo al pasar el cursor. Los módulos abiertos ya no tienen un límite de altura que oculte lecciones al aumentar el alto de las filas; el desplazamiento sigue perteneciendo al árbol del curso.

Verificado en cinco temas, con 22 lecciones, apertura y cierre de módulos y viewport móvil sin desbordamiento horizontal. [Captura de la integración](../design/atlas-course-titles.png).

## Copiar una entrada completa

Se añadió una acción discreta al final del documento para copiar el título y el contenido actual del editor en Markdown, incluidos los bloques de código y las ediciones pendientes de guardado. La acción queda fuera del editor y no copia botones, navegación ni relaciones. Muestra confirmación de copia o un mensaje si el navegador deniega el portapapeles. Verificado con el portapapeles real en navegador, cinco temas y pantalla móvil.

## Lectura táctil y alineación en móvil

Las tablas permiten desplazamiento vertical de la página y horizontal del contenedor con gestos iniciados sobre sus celdas. Se retiró la restricción `touch-action: pan-x` y el cambio móvil a `display: block`. En dispositivos táctiles se usa distribución automática de columnas, con texto largo limitado a 320 px por celda y saltos para cadenas largas; el contenedor conserva las columnas accesibles horizontalmente. Una tabla de prueba de cinco columnas pasó de filas de 270 px a 76 px sin ocultar texto.

Los párrafos de las entradas se justifican en pantallas pequeñas y dispositivos con puntero táctil, incluida tablet en horizontal. Se conserva la alineación de títulos, código y tablas. En teléfonos, Inicio centra el saludo y el clima, da dos líneas al título del estudio y coloca la acción Continuar debajo. Las tarjetas secundarias usan dos columnas completas. El acceso centra la identidad y da al formulario todo el ancho de su ventana.

Verificado con Chromium táctil emulado: gestos reales enviados al navegador en ambos ejes, acceso al final de la entrada, tamaños de 320, 412, 960 y 1480 px sin desbordamiento horizontal, centrado del acceso y botón de visibilidad de contraseña. El escritorio sin entrada táctil conserva la alineación anterior del texto. No se ha probado en hardware Samsung físico. Capturas de la integración: [tabla](../design/atlas-mobile-table.png), [Inicio](../design/atlas-mobile-home.png), [acceso](../design/atlas-mobile-login.png).

## Optimización completa del acceso

El login reduce la bienvenida y elimina el avatar redundante en teléfonos, manteniendo el cristal Aero y los marcos Centinela. La cabecera participa en el flujo normal; el formulario usa todo el ancho disponible y la página conserva desplazamiento vertical. El campo, la acción de mostrar contraseña y el botón de acceso tienen objetivos táctiles de al menos 48 px. Se retiró el autofocus en móvil para no abrir el teclado antes de tiempo; el escritorio con ratón conserva el foco inicial.

La API VisualViewport compacta la bienvenida al detectar reducción de altura mientras la contraseña tiene foco. El botón de visibilidad conserva ese foco. Los tamaños horizontales bajos también compactan la bienvenida. Se mantiene autocomplete de contraseña, se añade enterkeyhint go y se desactivan autocapitalización y corrección ortográfica del campo. El build incluye login.css y login.js para renovar la caché al desplegar.

Comprobado en navegador a 320×568, 412×820, 600×360, 960×1280 y 1480×924: centrado, ausencia de desbordamiento, botón visible en retrato, controles, persistencia de tema y autenticación real correcta/incorrecta sobre datos locales de prueba. Las 10 pruebas de autenticación pasaron. La reducción de VisualViewport por teclado fue simulada; falta validación con teclado Samsung en dispositivo físico. [Captura móvil](../design/atlas-login-optimized-phone.png) y [tema claro](../design/atlas-login-optimized-light.png).
