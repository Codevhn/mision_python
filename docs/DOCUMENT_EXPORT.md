# Exportación e impresión con opciones

## Auditoría

Había dos recorridos distintos. El Peek de un registro llamaba a `database_export.py`, que añadía siempre una tabla de propiedades y empaquetaba siempre el resultado en ZIP con `manifest.json`. La exportación de una entrada normal usaba los endpoints GET de documento y descargaba directamente un archivo, con otro diálogo y otras opciones. El exportador del registro añadía además un título Markdown y el generador PDF/HTML imprimía otro título desde la plantilla.

## Comportamiento

El diálogo compartido se usa desde el Peek de DB, un registro abierto como página completa, una subpágina dentro del contexto Peek y una entrada normal. PDF es el formato inicial.

- **Incluir propiedades de la página** está desactivado. Al activarlo se añade la tabla de propiedades (por ejemplo, Estado); las tablas del cuerpo se conservan siempre.
- **Descargar como ZIP** está desactivado. Se devuelve directamente PDF, HTML, Markdown o JSON con su nombre, MIME y extensión correctos.
- Las subpáginas y sus carpetas requieren elegir ZIP explícitamente. El servidor rechaza una petición contradictoria en lugar de cambiar silenciosamente el tipo de descarga.
- **Imprimir página** abre el contenido preparado para impresión con la misma opción de propiedades. El ZIP no tiene acción de impresión. Se abre la ventana dentro del gesto del usuario; se espera al guardado, las fuentes y las imágenes antes de invocar la impresión. Si falla el guardado/exportación se cierra la ventana vacía y se permite reintentar.
- El HTML individual incorpora los recursos disponibles como data URI después de la sanitización, únicamente para los recursos que ya obtuvo el exportador. Los PDF incorporan las imágenes y, para enlaces a archivos disponibles, adjuntos PDF. Markdown/JSON incorporan los recursos como data URI. El ZIP conserva los recursos separados y su manifiesto.
- Las omisiones siguen mostrándose en el diálogo; el ZIP incluye los detalles completos. Se conservan los límites de recursos, tamaño, tiempo y ámbito, sin recorrer la base padre ni sus otros registros.
- Se elimina el título inicial repetido del documento, también cuando una importación lo dividió en dos líneas que juntas coinciden exactamente con el título. No se modifica la entrada guardada.

## API y compatibilidad

`POST /api/databases/<parent>/<source_id>/rows/<row_id>/export` y `POST /api/export/<entry_id>/document` comparten opciones y generador. El segundo también resuelve la proyección de propiedades si la página es un registro de DB.

Las nuevas opciones booleanas son `include_properties` y `archive`, ambas `false` por defecto. Los consumidores que requieran el paquete anterior completo deben enviarlas como `true` explícitamente. Se mantienen `format`, `database_view`, `include_content`, `include_subpages` y `folders`.

Los endpoints GET existentes `/api/export/<id>/{md,html,pdf,json}` y la exportación de temas individuales conservan su contrato. La interfaz normal pasa por el nuevo diálogo compartido. Se esperan las colas de guardado antes de solicitar el documento y se conserva la identidad de la entrada de origen.

## Verificación

- `pytest knowledge_base/tests/test_document_export_options.py knowledge_base/tests/test_database_export.py knowledge_base/tests/test_document_export.py knowledge_base/tests/test_print_export.py -q`: inspecciona PDF reales, HTML, Markdown, JSON, ZIP/manifiestos, imágenes, adjuntos PDF, propiedades optativas, separación del ámbito, títulos y conservación de las fuentes.
- `npm test` y `npm run build` en `knowledge_base/editor-src`.
- `node tools/check_export_options.cjs` con `tools/run_library_assistant_fixture.py`: descargas reales desde Peek, registro a página completa y entrada independiente, en 1440/900/412 px. Comprueba las opciones iniciales, propiedades, ZIP con hija, tablas del cuerpo, impresión en una ventana preparada, títulos y fallo de guardado/reintento. La llamada a `window.print()` está instrumentada; no imprime en hardware.

Todas las pruebas usan datos desechables. No exportan ni alteran las entradas del usuario.

## Tamaño de texto y ajuste a una hoja

El PDF configurado ofrece **Tamaño del texto del PDF** (9, 10, 10,5, 12 y 14 pt) y **Ajustar a una hoja**, desactivado por defecto. Son parámetros de exportación; no modifican el tamaño del editor ni el Markdown guardado.

La opción `pdf_layout: "one_page"` mide la paginación real de WeasyPrint en A4. Si el documento ya cabe, conserva el diseño normal. Si ocupa varias páginas, prueba una composición más compacta (márgenes de 14 mm, interlineado y espacios reducidos), empezando por el tamaño elegido y bajando hasta 9 pt de texto principal. No crea una hoja de altura arbitraria, rasteriza, recorta ni elimina contenido. Se limita a seis composiciones; si el documento normal supera cuatro páginas no repite intentos de compactación.

Si no logra una sola hoja, el servidor responde 422 con `code: "pdf_one_page_unavailable"` y un aviso para elegir paginación normal. No entrega un PDF parcial ni cambia silenciosamente la restricción. Para ZIP, el ajuste se mide por separado para cada PDF incluido; un documento que no cabe impide descargar un paquete incompleto.

`pdf_font_size` acepta un número finito entre 9 y 14, con 10,5 como valor predeterminado. El tamaño elegido se aplica a la paginación normal o sirve como máximo para el ajuste. El resultado informa del número de páginas y tamaño de texto realmente usados (`X-Atlas-PDF-Pages` y `X-Atlas-PDF-Font-Size`). El manifiesto ZIP guarda esas medidas por documento.

El HTML de impresión normal admite el tamaño elegido. Para imprimir el ajuste exacto de una hoja se descarga el PDF ajustado y se imprime ese archivo: la paginación HTML de los navegadores puede diferir de la de WeasyPrint. El diálogo lo indica y evita iniciar una impresión HTML ordinaria mientras está activa la opción de una hoja.

Pruebas adicionales: `pytest knowledge_base/tests/test_pdf_page_layout.py -q` inspecciona PDFs reales (A4, recuento de páginas, posiciones de texto, conservación de todos los pasos, tamaños reales de fuente, ZIP y fallo seguro). `node tools/check_pdf_fit.cjs` prueba los controles, descargas y reintento desde Peek y entrada normal en perfiles de 1440 y 412 px. La suite conjunta de exportación e impresión reúne 74 pruebas.
