# Asistente Atlas

Abre el botón flotante **Asistente** desde cualquier sección. El panel lateral
conserva el hilo mientras navegas. La cabecera permite abrir el historial,
crear otra conversación, ampliar el panel o cerrarlo. En móvil ocupa la pantalla;
Escape cierra primero controles desplegados y después el panel. La cabecera usa
una sola fila; el cuadro de escritura empieza compacto y crece al escribir.

El selector de modelos está dentro del cuadro de escritura y abre hacia arriba
cuando falta espacio abajo. Enter envía; Shift+Enter agrega una línea.
**Detener** interrumpe la petición; una respuesta parcial no se guarda.

En **Contexto**, puedes consultar Atlas, usar la página o tablero abierto, o
conversar sin añadir datos. **Tomar la página abierta** selecciona explícitamente
el contexto actual; navegar después no reemplaza esa selección. Se usa contenido
guardado, no cambios del editor aún sin guardar. Cada consulta muestra sus fuentes.
La página seleccionada aporta hasta 8.000 caracteres y 40 subpáginas; el tablero
hasta 12 columnas con 30 tarjetas por columna. Los límites se incluyen en el contexto.

Con **Consultar Atlas** activo, cada pregunta incorpora
datos actuales de Atlas: páginas, Teamspaces y su jerarquía, actividad reciente, progreso de cursos, columnas y
tareas de tableros, notas y mapas relacionados. El desplegable **Contenido de
Atlas consultado** permite abrir las fuentes disponibles para esa respuesta.
Las notas se buscan por palabras en título y contenido. Se envían fragmentos y
muestras limitadas: esta versión no hace búsqueda semántica, no lee el contenido
de PDF/EPUB ni navega por Internet. Los saludos simples no recuperan registros de Atlas. Las instrucciones favorecen
respuestas breves y evitan listar actividad sin que se solicite.
La última visita no demuestra que una lección
esté completada. Los pendientes se interpretan según estados y columnas guardados.
El directorio incluye hasta 120 entradas, priorizando coincidencias y actividad
reciente; indica si está recortado y conserva los ancestros de cada entrada.
Los formatos reconocibles de credenciales se ocultan en el contexto recuperado;
este filtro no cubre todos los formatos posibles ni modifica notas guardadas.

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
