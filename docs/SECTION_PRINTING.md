# Impresión por tema y PDF limpio

En el menú de puntos de un encabezado aparece **Imprimir este tema…**.
La vista nueva ofrece **Imprimir / Guardar como PDF** (diálogo del navegador)
y **Descargar PDF** (generación del servidor).

- Un encabezado plegable incluye sus hijos aunque estén colapsados.
- Un encabezado normal incluye los bloques siguientes hasta el próximo título
  del mismo nivel o de uno superior, dentro del mismo padre.
- Se usa la versión actual del editor, incluidos los cambios aún sin guardar.
- Los demás temas de la entrada quedan fuera. La impresión completa sigue
  disponible mediante la exportación existente.

La salida usa papel A4, fondo blanco, fuente Inter de 10.8 pt, márgenes y títulos
con jerarquía, listas y tablas. Los encabezados plegables se expanden para papel;
las marcas internas `:::toggle` desaparecen. Las marcas escritas dentro de un
bloque de código se conservan como código. El PDF completo y el HTML exportado
usan la misma conversión. La impresión individual omite el índice general.
La fuente Noto Emoji se incluye con licencia OFL y la imagen de despliegue añade
Noto Color Emoji para evitar símbolos ausentes en el servidor. Los símbolos se
separan tipográficamente de los números y del texto normal.

El menú de bloques se monta en una capa fuera del marco decorativo, conservando
el contexto React del editor. Su posición sigue el botón y se limita al área
visible debajo de la barra de navegación; se puede desplazar cuando falta altura.
Los marcos y el colapso del editor ya no lo atraviesan ni lo recortan.
La capa conserva los botones con relieve, los reflejos Aero, el indicador del
tipo activo y el foco de teclado; todos siguen la paleta seleccionada.

Validación local: 307 pruebas del servidor, pruebas del editor (incluida selección
de temas anidados y límites de encabezados) y build de producción. Chromium
verifica el menú real con todos los encabezados plegados, su posición por encima
del marco, la vista previa, la exclusión de otros temas, ambas descargas PDF y
el ajuste del menú a una pantalla de 412 × 820. Se revisó visualmente el PDF
rasterizado y se extrajo su texto. La nueva imagen Docker no se construyó en esta
verificación; la dependencia de fuentes se instalará durante `fly deploy`.

Ejemplos con datos de prueba: [menú](../design/atlas-section-menu.png) y
[PDF de un tema](../design/atlas-section-print.pdf).
