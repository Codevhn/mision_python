# Revisión del lector de Biblioteca

Problemas encontrados: el EPUB podía mantener el papel blanco al cambiar a
texto claro; controles no accesibles por teclado; navegación situada en los
extremos y tapada por el asistente flotante; ajustes de letra que solo recorrían
valores; PDF sin ajuste al ancho; progreso EPUB interpretado sin considerar
el capítulo; errores de apertura sin salida clara.

Cambios:

- Papel y tinta sincronizados en HTML, cuerpo, contenedor e iframe EPUB,
  incluyendo cambios de tema y capítulos posteriores. Ventana con controles Aero.
- Apariencias automática, papel, sepia y noche; tamaño, interlineado y una o dos
  páginas para EPUB. Preferencias guardadas en este navegador.
- Columna de lectura de hasta 720 px y márgenes adaptados al móvil.
- Anterior/siguiente agrupados con posición y progreso. Los botones funcionan
  por teclado, y las flechas navegan al leer sin interferir con campos o texto seleccionado.
- Índice navegable con subsecciones, botones con nombres accesibles y foco visible.
- Asistente accesible en la barra del lector; se oculta su botón flotante durante
  la lectura. La nota rápida queda por encima de la navegación.
- Lectura sin distracciones opcional; Escape permite salir. Ajustes con cierre y
  animación breve que respeta movimiento reducido.
- PDF ajustado inicialmente al ancho, zoom manual y botón Ajustar. Atenuación
  opcional del papel; este filtro también modifica los colores de las ilustraciones.
- Guardado de progreso con el identificador del libro capturado y envío pendiente
  al salir. El porcentaje EPUB se marca como aproximado por capítulo/página;
  la posición guardada es un CFI para retomar la lectura.
- Apertura fallida con Reintentar y acceso a Biblioteca. Destrucción de la
  presentación EPUB anterior al reabrir; protección contra renders PDF atrasados.

Validado en Chromium con archivos EPUB y PDF de prueba reales, servidos por
rutas simuladas en datos aislados: tres temas, texto/fondo dentro del iframe,
preferencias, índice, flechas, anterior/siguiente, asistente, modo de lectura,
PDF al ancho a 390 px, atenuación, guardado de progreso, preferencias después
de recargar y recuperación de un PDF inválido. No se modificaron libros del usuario.

Los PDF conservan su diseño fijo y sus limitaciones originales de texto/OCR;
los ajustes de tipografía y distribución corresponden a EPUB.

## Desplazamiento del PDF con zoom

La rueda intentaba decidir cuándo pasar de página consultando `scrollTop`,
`clientHeight` y `scrollHeight` de `.pdf-scroller`. Ese elemento no es el dueño
del desplazamiento: lo es `#readerPage`. Por eso interpretaba que ya se había
llegado al borde y consumía la rueda para cambiar de página, en vez de recorrer
la página actual. Los eventos sobre los márgenes sufrían el mismo problema.

En PDF, rueda, trackpad y gestos táctiles recorren ahora la página y se detienen
en sus extremos. Las flechas y las acciones explícitas de navegación siguen
cambiando de página. La preferencia de paginación con rueda se conserva solo
en los ajustes de EPUB. El contenedor del papel mantiene su ancho completo al
ampliarlo, sin encogimiento flex ni un borde izquierdo fuera del rango de scroll.
Al cambiar de página se reinician ambos ejes; un render de zoom de la misma
página no se trata como navegación.

Prueba reproducible desde la raíz, con Playwright y Chromium instalados:

```bash
node tools/check_pdf_scrolling.cjs
```

El script genera un PDF real de tres páginas y usa el pdf.js vendorizado,
el código completo de Biblioteca y el HTML/CSS del lector. Solo simula las rutas
de archivos, metadatos y progreso; no accede a libros personales ni necesita
un servidor. `CHROMIUM_PATH` permite indicar otro ejecutable de Chromium.

Resultado: pasan escritorio 1440×900, tableta 1480×924 y móvil 412×915, cada
uno con ajuste al ancho, 30 % y 300 %. Se comprueban rueda nativa, extremos
verticales/horizontales, permanencia en la página al llegar a los bordes,
anterior/siguiente, inicio arriba de cada página, límites del libro, ajustes y
guardado de progreso. Los perfiles táctiles usan gestos y pulsaciones nativas
emuladas mediante Chromium; no sustituyen la validación física en el dispositivo.
No se detectan errores JavaScript. También pasan `node --check` y
`git diff --check`.

La misma prueba contra el código anterior falla intencionadamente porque la
rueda no desplaza la página actual:

```bash
node tools/check_pdf_scrolling.cjs --baseline=086846d
```
