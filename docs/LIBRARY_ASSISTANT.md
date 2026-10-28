# Asistente del libro abierto

## Uso

Abrir un PDF o EPUB de Biblioteca y pulsar **Asistente**. Con **Contexto · Vista
actual** activado, la consulta usa el libro abierto y la página PDF o sección
EPUB que se está leyendo. El contexto se vuelve a capturar al enviar cada
pregunta; no se reutiliza el texto de una página oculta detrás del lector.

Ejemplos:

- «Dime los temas de este libro».
- «Lista los temas que incluyan la palabra “ritual”».
- «Explícame la página o sección actual».
- «Resume mis notas y resaltados de este libro».
- «Busca “ritual” desde la página 9» para continuar una búsqueda extensa.

Las respuestas incluyen el panel **Contenido de Atlas consultado**. Sus botones
abren la página PDF, la sección EPUB o un resaltado EPUB. Si se ha abierto otro
libro, la referencia vuelve al libro y formato de origen. La conversación puede
recuperarse por el identificador del libro, independientemente de las entradas
de Conocimiento o de los cursos.

## Contexto y extracción

`library.js` expone identidad, formato y ubicación del lector. `app.js` prioriza
ese contexto frente a editores ocultos. `assistant.py` valida el tipo `book`,
descarta títulos y extractos enviados por el cliente, y consulta exclusivamente
el registro y los archivos de ese libro en el servidor. La consulta de un libro
no incorpora notas o libros ajenos como resultados de búsqueda.

`library_context.py` prepara un índice SQLite local, desechable y reutilizable
en `DATA_DIR/library_text_index/`. No necesita embeddings, otra API ni servicios
externos. El texto seleccionado se envía únicamente al proveedor/modelo que el
usuario ya eligió para su conversación. No se manda el libro completo en cada
turno.

- PDF: PyMuPDF extrae texto por página y el índice real del documento si existe.
- EPUB: se recorren los documentos del spine, sus encabezados y sus hrefs reales.
  Sus secciones no se presentan como páginas PDF ni números de página impresos.
- Una revisión del archivo (formato, ruta, tamaño, mtime y versión del indexador)
  invalida el índice anterior. Esto incluye la sustitución del PDF tras OCR.
- Borrar un libro elimina su índice. Los archivos y las anotaciones originales
  se mantienen intactos durante una consulta.
- Las rutas resueltas deben permanecer dentro de la carpeta del libro; el nombre
  del índice es un hash del identificador, no una ruta proporcionada por el cliente.

La búsqueda es de palabras o frases literales, sin distinguir mayúsculas ni
tildes. «ritual» no coincide accidentalmente con «espiritual» ni interpreta
caracteres como expresiones regulares. No es una búsqueda semántica por sinónimos.

## Límites explícitos

El modelo recibe la ubicación actual, el índice extraído, coincidencias con
extractos, muestras para una vista general y hasta seis notas/resaltados.
Cada búsqueda informa del total de páginas/secciones coincidentes, muestra
hasta ocho extractos y proporciona la ubicación desde la que continuar. Los
extractos y el índice tienen límites de tamaño para mantener acotado el contexto.

Si no hay un índice del documento, una explicación de sus temas basada en
muestras debe identificarse como parcial, no como un temario exhaustivo.
Los PDF escaneados sin texto requieren aplicar OCR desde Biblioteca; no se
ejecuta OCR automáticamente ni se inventa el contenido de páginas ilegibles.

El indexador limita cada construcción a 3.000 unidades, 16 millones de caracteres
y unos 20 segundos entre unidades, con hasta 100.000 caracteres por unidad. Si
alcanza un límite, conserva una cobertura parcial y la comunica al modelo. Las
secciones EPUB individuales se limitan a 5 MB y los metadatos XML a 1 MB. Un archivo
corrupto, ausente o protegido produce un estado no disponible, sin utilizar texto
obsoleto del índice anterior.

## Verificación

Desde la raíz, con el Python del entorno virtual:

```bash
python -m pytest knowledge_base/tests/test_library_assistant.py knowledge_base/tests/test_assistant.py -q
```

Pruebas de extracción con archivos PDF y EPUB reales: búsquedas y páginas,
secciones EPUB, índice del documento, aislamiento entre libros, texto del cliente
no confiable, reutilización/invalidación del índice, borrado, OCR pendiente,
cobertura parcial, límites/continuación, coincidencias literales y validación
del contexto. También verifican la consulta SSE y la recuperación del hilo por libro.

Para la integración de navegador, iniciar en una terminal:

```bash
python tools/run_library_assistant_fixture.py
```

En otra, con Playwright y Chromium instalados:

```bash
node tools/check_library_assistant.cjs
node tools/check_pdf_scrolling.cjs
```

La instancia usa un directorio temporal nuevo, libros generados y un modelo
simulado que comprueba el contexto recibido. No accede a los libros del usuario
ni llama a un proveedor real. El navegador prueba los endpoints, el lector y el
asistente completos: identidad del libro, sugerencias, envío, fuentes, página
actual, retorno a otro libro y navegación de capítulos EPUB. Pasan escritorio
1440×900, tableta táctil 1480×924 y móvil táctil 412×915. La prueba existente de
desplazamiento PDF también pasa; las pantallas táctiles se emulan en Chromium.

La calidad de la redacción final depende del modelo elegido. Estas pruebas
verifican recuperación, contexto, referencias y navegación, sin atribuir al
modelo simulado una comprensión real de los libros del usuario.
