# Exportación editorial para impresión

La plantilla común de PDF y HTML imprimible usa Lora local para prosa y títulos,
Inter para metadatos y pies, y JetBrains Mono para código. Las fuentes se incrustan
como datos: la exportación no necesita descargarlas de Internet. El lector de
recursos de la exportación admite únicamente los TTF y WOFF2 registrados por Atlas.

El documento mantiene A4, papel blanco, márgenes de 22 mm a los lados, tinta oscura
y acentos cálidos discretos. Los párrafos se justifican con separación silábica
automática en español; títulos y código mantienen su alineación propia. Los títulos evitan separarse del párrafo siguiente;
se conservan las reglas de viudas, huérfanas, tablas y bloques de código extensos.
Todas las páginas incluyen un número sencillo centrado en el pie. Las siguientes
a la primera llevan también el título del documento en la cabecera. No se añade una portada vacía ni se modifica el Markdown.

El tamaño elegido en el diálogo sigue determinando la prosa. La jerarquía de títulos
escala con ese tamaño; «Ajustar a una hoja» conserva su cálculo real de paginación
y su rechazo cuando el documento no cabe sin recortar.

Validación: 49 pruebas de exportación, impresión y paginación. La prueba editorial
genera un PDF mediante el endpoint del diálogo y comprueba fuentes incrustadas,
código, última sección y pies de página. También se revisó visualmente una lección
real de tres páginas. El diseño se aplica a la plantilla compartida, incluyendo
páginas, selecciones, HTML imprimible y PDF de registros.

## Numeración continua del curso

Al exportar una lección a PDF, Atlas recorre sus predecesoras en el mismo orden
estable del árbol del curso (número de módulo y orden de las lecciones). Solo cuenta
lecciones del mismo curso que no estén eliminadas. Incluye también las lecciones
que aún contienen únicamente su esquema; si después se desarrollan, cambia el
recuento. No depende de haber exportado antes ni altera el contenido guardado.

Cada predecesora se maqueta con el mismo tamaño, ajuste de hoja, propiedades y
política de archivos que la lección elegida. Se cuenta exclusivamente la lección,
sin añadir descendientes. El PDF descargado contiene únicamente la lección actual;
su primer número es uno más que la suma de los recuentos anteriores. El diálogo
muestra el rango y los encabezados HTTP `X-Atlas-PDF-Start-Page` / `End-Page` lo
exponen junto con el recuento local `X-Atlas-PDF-Pages`.

Los recuentos se guardan en una caché de hasta 256 entradas por proceso, identificada
por HTML completo (incluidas fuentes y estilo), recursos y opciones. Cambiar texto,
recursos, título, estilo u opciones invalida el recuento correspondiente; reordenar
lecciones cambia la suma. La primera exportación puede tardar más. Se toman las
instantáneas bajo el bloqueo de lectura; la maquetación se realiza fuera del bloqueo.
La operación admite hasta 200 predecesoras y 50 MB de Markdown agregado.

Para conservar la secuencia en papel deben usarse los mismos ajustes y una versión
estable del contenido: no se reserva numeración histórica para hojas ya impresas.
El PDF directo y el diálogo comparten este cálculo. Las páginas ajenas a cursos y
las selecciones independientes siguen comenzando en 1. El HTML y la impresión del
navegador no calculan esta secuencia: para imprimirla debe usarse el PDF descargado.

Pruebas adicionales: exportación fuera de orden, aislamiento entre cursos, cambios
de tamaño y contenido, caché, orden numérico de módulos, numeración real centrada y
ruta antigua de PDF; Chromium verifica ayuda, descarga y rango a 1440 y 412 px.
