# Roadmaps desde el asistente Atlas

«Generar con IA» utiliza el nombre del curso abierto. Las instrucciones adicionales son opcionales; no hay que repetir el título. El formulario conserva granularidad, nivel, cantidad orientativa de módulos y elección de modelo.

La generación abre una conversación del asistente y guarda la propuesta estructurada en su historial. «Revisar y aplicar al curso» abre la vista editable del importador existente: módulos, lecciones numeradas y subtemas. El botón de aplicar crea las entradas mediante la API de importación del curso. Generar una propuesta no crea lecciones todavía.

Cada propuesta conserva el identificador del curso de destino, incluso al volver a abrirla desde el historial. La revisión muestra las coincidencias con lecciones existentes. El asistente permite reintentar la generación con otro modelo sin copiar el pedido. Las respuestas normales posteriores del chat no sustituyen automáticamente la propuesta estructurada.

Los tres botones del curso vacío y el selector compacto utilizan los estilos Aero compartidos, incluyendo hover y foco de teclado.

## Validación

- Suite de `knowledge_base/tests`: 101 pruebas aprobadas; incluye nombre implícito, opciones enviadas al modelo, formato Markdown, persistencia, aplicación al curso y errores sin crear entradas.
- Chromium: generación con instrucciones vacías, historial, revisión y creación de tres lecciones en dos módulos; estilos en Aero, Aero Blue y Aero Night y formulario móvil.
- Las pruebas de generación utilizan un proveedor simulado; no evalúan la calidad de un modelo externo ni sus credenciales.
