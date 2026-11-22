# Exportación editorial para impresión

La plantilla común de PDF y HTML imprimible usa Lora local para prosa y títulos,
Inter para metadatos y pies, y JetBrains Mono para código. Las fuentes se incrustan
como datos: la exportación no necesita descargarlas de Internet. El lector de
recursos de la exportación admite únicamente los TTF y WOFF2 registrados por Atlas.

El documento mantiene A4, papel blanco, márgenes de 22 mm a los lados, tinta oscura
y acentos cálidos discretos. Los párrafos se justifican con separación silábica
automática en español; títulos y código mantienen su alineación propia. Los títulos evitan separarse del párrafo siguiente;
se conservan las reglas de viudas, huérfanas, tablas y bloques de código extensos.
Todas las páginas incluyen su número; las siguientes a la primera llevan también
el título del documento. No se añade una portada vacía ni se modifica el Markdown.

El tamaño elegido en el diálogo sigue determinando la prosa. La jerarquía de títulos
escala con ese tamaño; «Ajustar a una hoja» conserva su cálculo real de paginación
y su rechazo cuando el documento no cabe sin recortar.

Validación: 49 pruebas de exportación, impresión y paginación. La prueba editorial
genera un PDF mediante el endpoint del diálogo y comprueba fuentes incrustadas,
código, última sección y pies de página. También se revisó visualmente una lección
real de tres páginas. El diseño se aplica a la plantilla compartida, incluyendo
páginas, selecciones, HTML imprimible y PDF de registros.
