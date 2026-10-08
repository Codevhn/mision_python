# Asistente Atlas

Abre el botón flotante **Asistente** desde cualquier sección. El panel lateral
conserva el hilo mientras navegas. La cabecera permite abrir el historial,
crear otra conversación, ampliar el panel o cerrarlo. En móvil ocupa la pantalla;
Escape cierra primero controles desplegados y después el panel. La cabecera usa
una sola fila; el cuadro de escritura empieza compacto y crece al escribir.

El selector de modelos está dentro del cuadro de escritura y abre hacia arriba
cuando falta espacio abajo. Enter envía; Shift+Enter agrega una línea.
**Detener** interrumpe la petición; una respuesta parcial no se guarda.

En **Contexto**, puedes consultar Atlas y seguir la vista abierta, o desactivar
ambas opciones. La ubicación se actualiza al enviar cada consulta. En el editor,
se incorpora hasta 8.000 caracteres del texto mostrado, incluyendo cambios sin
guardar. Si hay una selección, el extracto se centra en ella y su entorno. Ese
texto visible tiene prioridad sobre el extracto guardado cuando difieren; el
curso, módulo, título y jerarquía proceden de los registros de Atlas. Las vistas
ajenas al editor, los tableros y los mapas mantienen sus límites de consulta.
La página aporta hasta 40 subpáginas; el tablero hasta 12 columnas con 30 tarjetas
por columna. Los límites se incluyen en el contexto.

Con **Consultar Atlas** activo, cada pregunta incorpora
datos actuales de Atlas: páginas, Teamspaces y su jerarquía, actividad reciente, progreso de cursos, columnas y
tareas de tableros, notas y mapas relacionados. El desplegable **Contenido de
Atlas consultado** permite abrir las fuentes disponibles para esa respuesta.
Las notas se buscan por palabras en título y contenido. Se envían fragmentos y
muestras limitadas: esta versión no hace búsqueda semántica, no lee el contenido
de PDF/EPUB ni navega por Internet. Los saludos simples no recuperan registros de Atlas. Las instrucciones evitan listar actividad sin que se solicite.
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

## Estilo académico y continuidad

Las instrucciones de sistema exigen definiciones formales, explicaciones
completas y ejemplos pertinentes, sin preámbulos de chat, elogios, disculpas,
metacomentarios sobre el «fragmento», cierres automáticos ni «En resumen».
Una síntesis solicitada se entrega como contenido principal. Los títulos y
selecciones se interpretan como conceptos o temas en su lección; no se afirma
que un título ya contenga una definición. Estas instrucciones se aplican también
al continuar conversaciones antiguas y evitan imitar su estilo anterior.

La acción Explicar envía un pedido académico. El historial conserva las
selecciones y respuestas anteriores; la compresión pide preservar las relaciones
entre conceptos y lecciones. El contexto del editor se obtiene nuevamente en
cada envío, con prioridad para la vista actual al cambiar de tema. Las respuestas
antiguas no se reescriben. El cumplimiento lingüístico depende del modelo; no se
borran párrafos automáticamente mediante coincidencias de texto.

Validación adicional: 120 pruebas de backend y Chromium con selección real,
consulta posterior, otra selección al final de un documento largo, contexto
visible sin guardar, reintentos de mensajes antiguos y controles móviles. Las
pruebas usan respuestas simuladas y comprueban las instrucciones y el contexto
enviados; no acreditan el estilo de salida de un proveedor real.

## Insertar una explicación en la lección

Cada respuesta normal incluye «Insertar debajo del concepto», fuera del menú
secundario. La selección conserva el identificador de la página y el bloque de
origen. Insertar agrega bloques nativos de texto, títulos, listas, tablas y código,
sin sustituir el concepto. Los títulos se ajustan bajo el nivel del destino y un
título inicial idéntico al concepto no se duplica. El cambio se guarda mediante
el autoguardado del editor y puede deshacerse con sus controles habituales.

Cuando una respuesta antigua no tiene un bloque asociado, se elige el encabezado
mediante un diálogo. No se inserta en otra página por accidente. Tras recargar,
se recupera el concepto si su texto identifica un solo bloque; un destino que
cambió o es ambiguo exige volver a seleccionarlo. El menú de respuesta se cierra
al pulsar fuera y con Escape.

Las instrucciones también prohíben cierres equivalentes, como «Conclusión
técnica», y encabezados genéricos como «Definición formal». Una definición empieza
por su contenido, sin anunciar su categoría. La verificación usa proveedor
simulado: comprueba inserción, estructura, guardado, recuperación desde historial,
elección de destino y cierre del menú; no certifica el estilo de un modelo externo.
