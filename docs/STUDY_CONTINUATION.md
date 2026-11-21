# Continuación de subtemas

Después de usar **Explicar** sobre un encabezado de una página o lección, el asistente puede proponer el siguiente subtema. La propuesta se calcula localmente a partir de los bloques actuales del editor, tanto en una entrada normal como en Peek.

- Busca un encabezado posterior del mismo nivel y dentro de la misma sección principal.
- Omite apartados que ya contienen texto, código, tablas o medios; los subencabezados de una explicación no se convierten en temas siguientes.
- «Pendiente» significa que la sección está vacía. No representa progreso académico ni afirma qué ha aprendido el usuario.
- No inventa temas, no cruza a otra lección y no adivina destinos cuando la selección es ambigua o el encabezado ha cambiado.
- **Desarrollar siguiente tema** reutiliza la acción Explicar, el contexto de origen y el modelo elegido. Revalida el destino antes del envío y conserva los borradores del usuario.
- **Ahora no** descarta la propuesta. No se inicia una generación ni se inserta contenido sin pulsar la acción correspondiente.
- La inserción conserva el destino y la cola de guardado del editor activo. Navegar a otra página invalida las propuestas anteriores.

Las preguntas generales, resúmenes, ejemplos, respuestas parciales, Biblioteca y los borradores de roadmap conservan sus flujos existentes; no reciben una propuesta de este tipo.

## Navegación de cursos

Anterior/siguiente mantiene el orden y los manejadores existentes de las lecciones. La barra se fija al pie de la columna de lectura y limita su ancho para respetar el asistente y el Peek. Si los paneles cubren casi toda la columna (por ejemplo, el asistente abierto en móvil), se oculta hasta recuperar espacio. El botón para abrir el asistente queda por encima de la barra y el contenido final conserva espacio para leerse.

## Verificación

- `npm test` en `knowledge_base/editor-src`, incluida la detección de apartados vacíos, contenido anidado, títulos duplicados y anclas eliminadas.
- `tools/check_study_continuation.cjs`: página/Peek y escritorio/móvil, API real con modelo simulado, selección correcta, borrador, inserción y cambio de página.
- `tools/check_course_navigation_dock.cjs`: barra fija, temas, asistente normal/ampliado, límites del curso y navegación real.
- `tools/check_library_assistant.cjs`: regresión de consultas, selecciones y fuentes de Biblioteca.

Los scripts de navegador usan únicamente un servidor local desechable; no generan respuestas mediante proveedores externos ni usan cursos personales.
