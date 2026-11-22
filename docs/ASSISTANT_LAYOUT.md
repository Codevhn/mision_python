# Espacio del asistente

El asistente conserva su portal y sus manejadores existentes. `assistant-dock.js` mide el espacio disponible y `assistant-dock.css` reserva una columna en escritorio. En ventanas estrechas (hasta 700 px o con menos de 680 px disponibles) reserva una fila inferior; el contenido y el chat se desplazan por separado.

Abrir, ampliar, reducir, minimizar y cerrar actualizan la geometría sin reconstruir el editor ni la conversación. Al ocultarlo se recupera el espacio reservado. El Peek se ajusta al área restante y la navegación de cursos permanece al pie de la zona de lectura. Los cambios de ventana, teclado móvil y barra lateral recalculan las dimensiones mediante observadores y `visualViewport`.

La geometría se comparte entre los temas. No modifica documentos, prompts ni exportaciones. El visor PDF conserva su ajuste al ancho y vuelve a dibujar su capa de texto al cambiar el espacio disponible.

## Verificación

- `tools/check_assistant_dock.cjs`: páginas y Peek, varios temas, escritorio/móvil, ampliación, restauración, conservación del borrador y documento, jerarquía H2/H3.
- `tools/check_course_navigation_dock.cjs`: navegación real, límites de lección y separación respecto al chat.
- `tools/check_study_continuation.cjs` y `tools/check_library_assistant.cjs`: selección, explicación, inserción y fuentes con modelo simulado en servidor local desechable.
