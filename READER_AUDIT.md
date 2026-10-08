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
