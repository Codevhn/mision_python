# Mapas conceptuales: exploración y explicaciones

La cabecera reúne el título y el recorrido. **Volver** regresa a las ramas o al nivel anterior; **Vista general** muestra el grafo entero, con todas las relaciones. El menú **•••** contiene el modelo, el fondo, la edición y la eliminación. Editar texto es una opción de personalización, no un paso obligatorio de estudio.

Las tarjetas, conexiones, nebulosa y texto usan los colores del tema activo. Las transiciones y el relieve emplean perspectiva CSS; el texto sigue siendo seleccionable. La preferencia de movimiento reducido desactiva la animación. **Mostrar todo** solo aparece mientras se revela la explicación; no indica que su contenido haya sido verificado.

## Generación y mapas anteriores

`POST /api/concept-maps/generate` pide una `description` para cada nodo y conserva esas definiciones. Si faltan, devuelve un error recuperable y no guarda un mapa parcial. El presupuesto de salida incluye los textos y rechaza respuestas truncadas.

En mapas anteriores, abrir un concepto sin descripción consulta `POST /api/concept-maps/<map_id>/nodes/<node_id>/explanation` con el modelo seleccionado. La respuesta aparece dentro del mapa y se guarda. Las siguientes visitas reutilizan el texto sin otra consulta. Si el proveedor falla, se permite reintentar o cambiar el modelo. La consulta ya iniciada puede terminar y guardar el resultado aunque el usuario explore otra rama; su respuesta no cambia la vista actual.

El servidor vuelve a leer el mapa después de consultar la IA: conserva cambios de posición y definiciones manuales realizadas durante la espera, y no recupera nodos eliminados. El Markdown se renderiza y sanitiza en el servidor. Las instrucciones priorizan precisión, pero las explicaciones generadas no constituyen una revisión documental.

## Validación

- Suite de Python: `.venv/bin/python -m pytest knowledge_base/tests -q`.
- Navegador Chromium: explicación dentro del mapa, caché, fallo y reintento, selección del modelo, respuestas tardías, edición, movimiento reducido, móvil y cambio entre Aero Rubí, Ámbar, Claro y OpenCode.
- El selector real de modelos se comprobó dentro del menú, incluyendo búsqueda, selección, Escape y limpieza al cambiar de mapa.

[Captura de las ramas](../design/concept-map-integrated-space.png) y [captura de lectura](../design/concept-map-integrated-reading.png) muestran el código integrado con datos de prueba. Las consultas del proveedor se simularon; no se utilizaron servicios de pago ni se desplegó en Fly durante estas comprobaciones.
