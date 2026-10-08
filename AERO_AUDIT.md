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
