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

Radar, Centro de Práctica y Biblioteca usan ahora superficies glass y marcos
azules discretos. Noticias, sesiones sugeridas, bitácora, tarjetas de libros,
Continuar leyendo y controles comparten el hover/foco/relieve de Cursos. Las
portadas, colores de categoría, estados de práctica y avisos de prioridad se
conservan; los paneles informativos no reciben hover de botón.

Team dispone de menú ⋯ para eliminar el contenedor y de Mover/Eliminar para
cada página. La confirmación del contenedor indica que borra todas sus páginas
y subpáginas; se limpian las relaciones asociadas. Mapas Mentales incorpora
Eliminar en el menú ⋯ de la lista lateral y de cada tarjeta, con confirmación.
Su selector conserva el buscador común del asistente con un botón de una línea
y 34 px de alto. Las tarjetas usan glass y el hover común en las tres variantes.

Verificado en una base aislada: cancelar conserva los datos; eliminar un Team
no afecta a los otros; borrar un mapa conserva los demás. Pruebas de backend
verifican archivos, descendientes, relaciones y autenticación. Revisión visual
y de dimensiones del selector en escritorio y a 390 px.

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

## Iconos y controles de Windows 7

La barra principal usa quince ilustraciones SVG originales con degradados,
reflejos y volumen, incluyendo el botón rojo de encendido de Salir. Se mantienen
los nombres y destinos de navegación. El buscador de comandos, la barra de
contexto de las páginas y el panel de relacionadas comparten las superficies
Aero también en el tema nocturno.

Copiar, reintentar, el menú de respuestas, modelo, contexto y ortografía tienen
relieve visible en reposo, brillo al pasar el puntero y estado presionado.
El selector compartido de modelos aparece con un fundido y desplazamiento de
5 px durante 180 ms, orientado según el lado en el que se abre; se desactiva
con la preferencia de movimiento reducido. Escape en el buscador deja abierto
el asistente.

Verificado en Chromium con los tres temas: carga de los quince iconos,
controles con degradado/borde/relieve, apertura y cierre del selector,
navegación del buscador por teclado y superficies de contexto/relacionadas.
También se verificó el selector a 390 px y movimiento reducido. La conversación
de prueba se generó con un proveedor simulado y datos aislados.

## Contexto automático del asistente

La ubicación actual estaba desactivada por defecto y se capturaba una sola vez.
Ahora está activada inicialmente y se actualiza antes de cada consulta y al
reabrir el chat. Desactivarla se respeta durante la sesión, incluso al reabrir.

Las páginas, lecciones y páginas de Team consultan su contenido guardado;
los tableros incluyen nombre, columnas y tarjetas. Los mapas mentales y
conceptuales consultan sus datos guardados. Las otras vistas envían su nombre
y una muestra del texto mostrado: Inicio, Conocimiento, listados de Cursos,
Team y Páginas, Tableros, mapas, Radar, Grafo, Práctica, Quiz, Biblioteca y lector.
La ubicación actual tiene prioridad sobre las visitas recientes y las menciones
a otras ubicaciones en turnos anteriores. La consulta general de Atlas sigue
siendo una búsqueda de contenido relevante y muestras limitadas, no una lectura
exhaustiva de todos los documentos. La captura del lector no extrae automáticamente
el texto completo de los PDF ni de los documentos alojados en iframes.

Validación: 99 pruebas del servidor, incluyendo límites/validación de las vistas,
contexto en saludos y recuperación del mapa seleccionado sin coincidencias de
búsqueda. Recorrido en Chromium con tablero → página → mapa → listado de mapas
→ Biblioteca manteniendo el asistente abierto; comprobación de las solicitudes
reales y de desactivar ambos contextos, cerrar y reabrir el asistente. Datos y
modelo de prueba aislados.

### Ortografía y contraste en superficies claras

El menú ortográfico separa la cabecera «Ortografía» y la palabra original,
las sugerencias bajo «Reemplazar por» y las acciones del párrafo mediante un
separador. Las sugerencias conservan nombres accesibles y corrección/deshacer.

Los botones laterales de BlockNote y sus SVG reciben colores de la paleta Aero;
los valores originales del editor claro dejaban los iconos casi blancos. El
editor reserva espacio para que ambos botones se vean completos en escritorio.
Aero azul usa fondos claros en las etiquetas sobre el escritorio azul; los
textos secundarios y los indicadores de Inicio tienen colores más contrastados.
El texto tenue de las superficies claras también se oscurece.

Validación: compilación del editor y sus cuatro suites, recorrido ortográfico
en Chromium (corrección individual, párrafo, deshacer, exclusión de código y
protección contra cambios concurrentes). Comprobación en los tres temas de los
iconos SVG, sugerencias y grupos del menú; contraste mínimo 3:1 en los iconos
sobre la superficie del editor y 4,5:1 en sugerencias y etiquetas de dominio
de Aero azul. Esta comprobación cubre esos componentes, no certifica toda la
aplicación.
