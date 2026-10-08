# Roadmaps desde el asistente Atlas

«Generar con IA» utiliza el nombre del curso abierto. Las instrucciones adicionales son opcionales; no hay que repetir el título. El formulario conserva granularidad, nivel, cantidad orientativa de módulos y elección de modelo.

La generación abre una conversación del asistente y guarda la propuesta estructurada en su historial. «Revisar y aplicar al curso» abre la vista editable del importador existente: módulos, lecciones numeradas y subtemas. El botón de aplicar crea las entradas mediante la API de importación del curso. Generar una propuesta no crea lecciones todavía.

Cada propuesta conserva el identificador del curso de destino, incluso al volver a abrirla desde el historial. La revisión muestra las coincidencias con lecciones existentes. El asistente permite reintentar la generación con otro modelo sin copiar el pedido. Las respuestas normales posteriores del chat no sustituyen automáticamente la propuesta estructurada.

Los tres botones del curso vacío y el selector compacto utilizan los estilos Aero compartidos, incluyendo hover y foco de teclado.

Al pulsar Generar, el asistente muestra inmediatamente el pedido completo:
nombre del curso, granularidad, nivel, módulos orientativos e instrucciones
adicionales. La bienvenida desaparece; un indicador en la conversación muestra
la preparación, la generación con el modelo seleccionado o el error. El pedido
guardado en el historial mantiene el mismo formato legible. El servidor obtiene
el nombre del curso de sus datos, independientemente del título enviado por el
cliente. No hace falta volver a pulsar Enviar para iniciar la generación.

## Validación

- Suite de `knowledge_base/tests`: 101 pruebas aprobadas; incluye nombre implícito, opciones enviadas al modelo, formato Markdown, persistencia, aplicación al curso y errores sin crear entradas.
- Chromium: generación con instrucciones vacías, historial, revisión y creación de tres lecciones en dos módulos; estilos en Aero, Aero Blue y Aero Night y formulario móvil.
- Las pruebas de generación utilizan un proveedor simulado; no evalúan la calidad de un modelo externo ni sus credenciales.
- Recorrido con respuesta retrasada: pedido visible antes de la respuesta y sin bienvenida; éxito sin indicador atascado; error visible y reintento conservando las opciones.
