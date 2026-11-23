# Profundizar en Conocimiento y nombres del sidebar

## Sugerencias contextuales

Al terminar una explicación de al menos 80 caracteres en una entrada de
Conocimiento, el asistente puede mostrar hasta tres sugerencias para profundizar.
Se generan con el mismo proveedor/modelo a partir del título real, consulta,
respuesta y propuestas anteriores. El generador auxiliar recibe datos separados,
pide JSON limitado y valida longitud, tipos y duplicados. Su error no impide
mostrar ni guardar la explicación principal. Es una llamada adicional al modelo;
no se usa para cursos, libros, respuestas cortadas, saludos ni revisiones.

Las sugerencias se guardan como metadatos de la respuesta, separados de su
Markdown: no aparecen al copiar, descargar o insertar la explicación. La interfaz
avisa que al elegir una se desarrollará y añadirá al final de la misma entrada.
La conversación conserva su contexto. El servidor acepta índices de una propuesta
ya guardada, comprueba su entrada original y construye la petición a partir de esa
propuesta; el cliente no puede sustituirla por otra ni dirigirla a otra página.

La ampliación completa se añade bajo un H2 con su título mediante el editor activo
y su cola de guardado. Conserva el contenido y los bloques existentes. Una copia
idéntica permite reintentar guardar sin duplicarla; un encabezado igual con otro
contenido requiere revisión. Las respuestas truncadas quedan como borradores y no
se insertan automáticamente. Si cambia la página durante la generación, la
respuesta permanece en el chat, con «Añadir a esta entrada» para volver a la
original e insertarla. Se respetan páginas bloqueadas y eliminadas.

## Alias del sidebar

En el menú de acciones de una entrada de Conocimiento o Team aparece «Renombrar». Este campo edita `sidebar_label` (máximo 160 caracteres), sin
cambiar `title`, la ruta, el identificador, Markdown, referencias ni el título
abierto. Dejarlo vacío vuelve a mostrar el título real. La actualización usa una
transacción de metadatos y respeta bloqueo/papelera; los guardados ordinarios del
título o contenido conservan el alias. Los árboles lo exponen como campo aparte.

## Verificación

- Pruebas de backend: sugerencias opcionales (JSON inválido y proveedor caído),
  asociación a entrada/propuesta guardadas, límites de modelo, respuestas
  truncadas, preservación de contenido y ruta, alias persistente, limpieza,
  validación de campos y bloqueo/papelera.
- Suite existente de asistente y guía de lecciones: conserva los flujos de cursos.
- `tools/check_knowledge_followups.cjs`: navegador con servidor desechable,
  renombrado mediante el menú real y recarga, sugerencias con respuestas simuladas,
  inserción/guardado en la página original sin crear otra, navegación durante la
  generación y recuperación manual, en escritorio y móvil.

Las comprobaciones no llaman a proveedores reales ni utilizan contenido personal.
La pertinencia de cada propuesta sigue dependiendo de la respuesta del modelo.
