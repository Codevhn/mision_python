# Auditoría visual de Aero

Objetivo: que Aero claro, Aero azul y Aero nocturno compartan los mismos
componentes y que cada componente use la paleta seleccionada.

## Primera revisión: ventanas y formularios

Corregido en los componentes compartidos `.modal`, `.modal-header`,
`.modal-body`, `.modal-footer` y `.form-group`:

- Marco con borde interior, barra glass y cierre rojo.
- Fondo y campos de la paleta activa; etiquetas y placeholders legibles.
- Botones secundarios con relieve y acción principal azul.
- Selecciones nativas visibles, foco de teclado y pestañas temáticas.
- Formulario de dos columnas que pasa a una en móvil.

Verificado con Chromium: abrir Nuevo curso, cambiar entre los tres temas,
rellenar campos, seleccionar nivel, cancelar y cerrar. También se comprobó
la ventana compartida Nueva entrada y el encaje de Nuevo curso a 390 px.
No se crearon cursos ni se modificaron datos de producción.

## Pendiente de revisión por pantalla

1. Menús contextuales, desplegables y selectores especiales.
2. Ventanas con contenido particular: importar/exportar, versiones,
   generación con IA, propiedades y vistas previas de páginas.
3. Conocimiento, cursos y lecciones: estados vacíos, edición y errores.
4. Teamspaces, páginas, tableros y biblioteca.
5. Mapas, grafo, radar y práctica.
6. Navegación de teclado y móvil en cada flujo; revisar el confinamiento
   del foco y los nombres accesibles de las ventanas antiguas.

La lluvia y los demás efectos del tiempo se revisarán después, como se acordó.
Estos pendientes no deben considerarse auditados por haber recibido estilos
compartidos: aún necesitan recorrerse en cada tema y estado.

## Segunda revisión: paneles laterales y consultas de selección

- Marcos y encabezados comunes en Cursos, Team, Conocimiento, Páginas,
  Tableros, mapas, Radar y Grafo. Fondo translúcido tintado y blur de 28 px;
  se mantiene un fondo sólido de respaldo si el navegador no admite blur.
- Explicar, Resumir, Ejemplo y Preguntar al asistente usan Asistente Atlas;
  el acceso desde el lector de Biblioteca usa el mismo asistente.
- El fragmento se muestra como adjunto desplegable y se guarda en el hilo.
  Las preguntas siguientes lo conservan mediante el historial sin reenviarlo
  como otro adjunto. Quitar el adjunto no borra mensajes ya enviados.
- Revisar ortografía conserva sus tres métodos. Ampliar, Continuar y
  Traducir conservan la vista previa y la inserción explícita; se rechaza
  insertar si se cambió de página o se editó el documento entretanto.

Comprobado en Chromium: selección real del editor, consulta y seguimiento,
historial del fragmento, borrador conservado, nueva conversación, ausencia
de cambios al editor y paneles de Conocimiento/Cursos/Team/Páginas/Tableros
en los tres temas. Revisión del asistente a 390 px y regresión de navegación,
historial y selector de modelos. Respuestas de IA simuladas en estas pruebas;
los permisos de combos OmniRoute requieren configuración del proveedor.

## Corrector integrado y movimiento

Las tarjetas de Inicio usan el glass de su variante también en los azules claros.
Se retiraron los fondos blancos heredados de Continuar estudiando y el contorno
blanco interior completo de las tarjetas; el reflejo queda limitado al borde
superior. Estadísticas, tarjetas fijadas y estados hover usan bordes del tema.

Las listas laterales de Conocimiento, Cursos, Tableros, Team, Páginas, Mapas
Mentales, Mapas Conceptuales y Radar comparten el degradado y relieve de Cursos.
Incluye categorías, temas, lecciones anidadas, fuentes y Archivados. Los botones
de navegación principal comparten la misma sombra; hover, foco y pulsación usan
tokens comunes en las tres variantes. Los elementos informativos del Grafo
conservan su presentación sin simular botones.

El menú Más utiliza el marco y los botones Aero en las tres variantes.
El editor subraya errores mediante un diccionario español local, con sugerencias
al pasar o tocar y revisión del párrafo antes de aplicar. Comprobados: conservación
de negrita, deshacer, exclusión de código y rechazo de una revisión desactualizada.

Ampliar y restaurar el asistente anima su posición y tamaño durante 280 ms, con
desaceleración suave y sin rebote ni escalado del texto. Se conserva la pantalla
completa; `prefers-reduced-motion` desactiva el movimiento. Verificado en Chromium.

## Controles del chat

Implementados: copiar respuesta con icono, reintentar usando el modelo elegido,
renombrar conversaciones, borrar con botón rojo compacto y ampliar a pantalla
completa. La búsqueda global (Ctrl+K, Cambiar tema) funciona sobre el chat
ampliado. El selector y el aviso inferior ocupan menos espacio.

Cada respuesta nueva guarda su proveedor/modelo. Los mensajes antiguos sin
esa información se muestran como modelo no registrado. El menú permite
guardar una respuesta como página o conocimiento con título/destino revisables,
descargar Markdown y copiar la conversación completa. La creación requiere
pulsar Guardar; no modifica la respuesta ni borra la conversación.

Los fallos ofrecen reintento. Una pregunta pendiente se reutiliza sin
duplicarla; reintentar una respuesta terminada conserva la respuesta anterior
y genera otro turno. Una respuesta que contiene exclusivamente las etiquetas
«User Safety: safe Response Safety: safe» se trata como fallo del modelo.

Validación: 94 pruebas del servidor y recorridos en Chromium de copiar,
renombrar, ampliar, cambiar tema desde búsqueda, reintentar, crear página y
conocimiento, selección y móvil. IA simulada; no se verificaron los servicios
externos ni los permisos de los combos desde este entorno.
