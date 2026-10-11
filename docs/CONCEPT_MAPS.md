# Mapas conceptuales: exploración y explicaciones

La cabecera reúne el título y el recorrido. **Volver** regresa a las ramas o al nivel anterior; **Vista general** muestra el grafo entero, con todas las relaciones. El menú **•••** contiene el modelo, el fondo, la edición y la eliminación. Editar texto es una opción de personalización, no un paso obligatorio de estudio.

Las tarjetas, conexiones, nebulosa y texto usan los colores del tema activo. Las transiciones y el relieve emplean perspectiva CSS; el texto sigue siendo seleccionable. La preferencia de movimiento reducido desactiva la animación. **Mostrar todo** solo aparece mientras se revela la explicación; no indica que su contenido haya sido verificado.

La lectura conserva un fondo transparente. El título tiene relieve y cada bloque se proyecta a una profundidad distinta, incluido el primer párrafo. La perspectiva se establece dentro del área de scroll para evitar que el navegador aplane los bloques. En escritorio, el cursor inclina suavemente la lectura; al seleccionar texto o editar, se congela su posición. En móvil y con movimiento reducido se conserva un relieve estático. Son transformaciones CSS sobre texto HTML, no letras convertidas en geometría WebGL.

En la vista general, las frases de enlace se distribuyen según las dimensiones reales de su tipografía y sus líneas. Se busca espacio sobre cada curva y, cuando está ocupado, en posiciones cercanas sin cubrir otros textos ni conceptos. Una guía discreta une las etiquetas desplazadas con su curva. Si no queda espacio cercano, se usa una columna exterior que también se incluye al ajustar el mapa a pantalla. Las curvas siempre se dibujan detrás de las etiquetas. La distribución se actualiza al cambiar la fuente, editar una frase o arrastrar conceptos, sin modificar las posiciones guardadas del mapa.

## Generación y mapas anteriores

`POST /api/concept-maps/generate` pide una `description` para cada nodo y conserva esas definiciones. Si faltan, devuelve un error recuperable y no guarda un mapa parcial. El presupuesto de salida incluye los textos y rechaza respuestas truncadas.

Si el proveedor marca la respuesta como cortada por tokens (`ai_output_truncated`), el navegador realiza **un único segundo intento compacto** con el mismo tema, material y modelo. Solicita ocho conceptos esenciales con definiciones de 15–25 palabras y hasta doce relaciones. Durante ese intento se informa del ajuste. Cada llamada conserva su propio tiempo de espera; no se reintenta automáticamente por cuota, permisos, desconexión o timeout. Si el usuario deja esa vista, una respuesta tardía no inicia el segundo intento ni abre otro mapa. Si vuelve a cortarse, se conserva la solicitud y se recomienda cambiar de modelo.

El estado de recuperación usa el marco, reflejos y controles Aero del tema activo. El modelo y el tema se pueden cambiar antes de reintentar; crear un mapa vacío queda como acción secundaria. Los detalles técnicos permanecen plegados.

En mapas anteriores, abrir un concepto sin descripción consulta `POST /api/concept-maps/<map_id>/nodes/<node_id>/explanation` con el modelo seleccionado. La respuesta aparece dentro del mapa y se guarda. Las siguientes visitas reutilizan el texto sin otra consulta. Si el proveedor falla, se permite reintentar o cambiar el modelo. La consulta ya iniciada puede terminar y guardar el resultado aunque el usuario explore otra rama; su respuesta no cambia la vista actual.

El servidor vuelve a leer el mapa después de consultar la IA: conserva cambios de posición y definiciones manuales realizadas durante la espera, y no recupera nodos eliminados. El Markdown se renderiza y sanitiza en el servidor. Las instrucciones priorizan precisión, pero las explicaciones generadas no constituyen una revisión documental.

## Validación

- Suite de Python: `.venv/bin/python -m pytest knowledge_base/tests -q`.
- Navegador Chromium: explicación dentro del mapa, caché, fallo y reintento, selección del modelo, reintento compacto limitado, respuestas tardías, edición, movimiento reducido, móvil y cambio entre Aero Rubí, Ámbar, Claro y OpenCode.
- El selector real de modelos se comprobó dentro del menú, incluyendo búsqueda, selección, Escape y limpieza al cambiar de mapa.
- Profundidad de un único párrafo, paralaje, selección y copia nativas, lectura transparente, movimiento reducido y ausencia de desbordamiento horizontal en móvil.
- Quince relaciones con ciclos y conexiones paralelas: ninguna etiqueta tapa otra etiqueta o nodo, incluso al cambiar tipografía y tema, editar una frase larga y mover conceptos. Una prueba de estrés con sesenta relaciones verifica también las posiciones exteriores. Comprobado además dentro de la interfaz real de Atlas con respuestas de prueba.

[Lectura con profundidad integrada](../design/concept-map-depth-reading.png) y [conectores distribuidos](../design/concept-map-depth-connectors.png). Los cuatro archivos del mapa forman parte de la versión de recursos estáticos para que estos cambios invaliden la caché en un despliegue.

[Captura de las ramas](../design/concept-map-integrated-space.png) y [captura de lectura](../design/concept-map-integrated-reading.png) muestran el código integrado con datos de prueba. Las consultas del proveedor se simularon; no se utilizaron servicios de pago ni se desplegó en Fly durante estas comprobaciones.
