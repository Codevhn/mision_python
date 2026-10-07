# Asistente Atlas

Abre **Asistente** en la navegación de escritorio o móvil. Crea una conversación,
elige un modelo en **Modelo y contexto** y escribe tu pregunta. Enter envía;
Shift+Enter agrega una línea. Puedes retomar o eliminar conversaciones desde el
historial. **Detener** interrumpe la petición; una respuesta parcial no se guarda.

Con **Consultar mis notas, cursos y pendientes** activo, cada pregunta incorpora
datos actuales de Atlas: actividad reciente, progreso de cursos, columnas y
tareas de tableros, notas y mapas relacionados. El desplegable **Contenido de
Atlas consultado** permite abrir las fuentes disponibles para esa respuesta.
Las notas se buscan por palabras en título y contenido. Se envían fragmentos y
muestras limitadas: esta versión no hace búsqueda semántica, no lee el contenido
de PDF/EPUB ni navega por Internet. La última visita no demuestra que una lección
esté completada. Los pendientes se interpretan según estados y columnas guardados.

Puedes desactivar la consulta de Atlas para una conversación general. El modelo
seleccionado recibe los mensajes del hilo y, cuando está activo, el contexto de
Atlas. Los mensajes anteriores ya pueden contener información consultada.

El historial completo se guarda en `DATA_ROOT/data/assistant.db` (o en
`knowledge_base/data/assistant.db` si no hay DATA_ROOT). No necesita nuevos
servicios ni paquetes. SQLite usa versiones para evitar sobrescribir cambios de
otra sesión. Cada conversación admite hasta 1.000 mensajes; al llegar al límite
se pide iniciar otra, sin borrar los anteriores.

Cuando el historial crece, el mismo modelo resume los turnos antiguos y conserva
los recientes en contexto. El resumen no reemplaza el historial guardado y puede
omitir detalles. Resumir requiere una petición adicional al proveedor elegido.
Si el resumen falla, la respuesta no continúa con un historial recortado en silencio.

Los combos de OmniRoute necesitan que OmniRoute y su túnel sigan activos.
Los proveedores directos usan las claves existentes de Fly.io. No se requiere
configurar nuevas variables para este asistente.

Validación: `pytest knowledge_base/tests -q`. Las pruebas del asistente simulan
respuestas para comprobar persistencia, historial entre turnos, resúmenes,
recuperación de contexto, autenticación y errores sin consumir proveedores reales.
