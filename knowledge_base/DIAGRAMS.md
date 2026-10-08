# Taller de Diagramas

Disponible en la opción **Diagramas** de la navegación. La primera versión admite diagramas de flujo y UML de clases. Otras familias UML y carriles quedan para ampliaciones del catálogo; no se presentan como disponibles.

## Recorrido

1. Crear un taller con nombre, notación y objetivo.
2. Elegir mentor socrático, construcción guiada, revisión, creación automática o edición manual.
3. Configurar experiencia, complejidad del resultado, profundidad, pistas, ritmo, enfoque e idioma. Cambiar de modo conserva documento y conversación.
4. Añadir elementos, conectarlos y editar sus propiedades. Se puede desplazar y ampliar el lienzo, centrar el contenido y editar posiciones sin arrastrar.
5. Consultar al mentor mediante respuestas, pistas, ejemplos, explicaciones o revisión. Solicitar una solución o generar el diagrama completo es una acción explícita.
6. Revisar las propuestas y su vista previa. Aplicar o descartar cada propuesta. Deshacer y rehacer guardan la nueva versión.
7. Exportar SVG o JSON. La importación JSON valida la misma notación y puede deshacerse.

El historial de decisiones registra propuestas aceptadas, incluso si posteriormente se deshacen. El documento actual prevalece para nuevas consultas. La conversación se conserva con los últimos 80 mensajes; se envían los últimos 20 al modelo junto con el objetivo, el documento, la selección, las comprobaciones y las últimas 30 decisiones.

## Notaciones

- Flujo: inicio, final, proceso, decisión, entrada/salida, documento, base de datos, subproceso y conector. Las relaciones admiten etiquetas de condiciones.
- UML de clases: clases, interfaces y notas; atributos, métodos y visibilidad; asociación, dependencia, herencia, realización, agregación y composición; multiplicidades en ambos extremos.

Las comprobaciones son orientativas: permiten guardar borradores incompletos. Detectan referencias inexistentes y datos incompatibles al validar; advierten sobre inicio/final, caminos desconectados, alternativas sin condiciones y ciclos de herencia. No sustituyen una revisión semántica del diseño.

## Persistencia y IA

`diagrams.py` registra rutas autenticadas `/api/diagrams`, `/api/diagrams/<id>`, `/assist` y `/proposals/<id>`. Se utiliza la misma base SQLite de Atlas (`atlas_diagrams`) y la misma función `_call_ai` y selector de modelos que las demás funciones de IA; no requiere nuevas claves ni dependencias.

Cada escritura compara la revisión guardada. Una respuesta lenta de IA no puede sobrescribir una edición más reciente. Las propuestas se validan antes de guardarse, permanecen separadas del documento y solo se aplican por identificador y revisión vigentes. Editar el documento invalida las propuestas pendientes. Las respuestas mal formadas o los fallos del proveedor no alteran el documento ni la conversación.

En modo socrático, el servidor limita el paso a un elemento nuevo por turno (dos en ritmo por etapas) y no admite reemplazar el lienzo sin una solicitud de solución o generación. Las acciones de pista, ejemplo, explicación e inicio no pueden proponer cambios. La calidad de las preguntas depende del modelo elegido; las reglas de aplicación y revisión se validan en el servidor.

Los documentos admiten 150 elementos y 300 relaciones. El historial de deshacer/rehacer pertenece a la sesión abierta del taller; el documento y la conversación se guardan en el servidor.

## Verificación

```bash
.venv/bin/python -m pytest knowledge_base/tests -q
node --check knowledge_base/static/diagrams.js
```

La verificación en navegador cubre creación, edición, conexión, arrastre, guardado y recarga, cambio de modo, propuestas de IA simuladas, generación, vista previa, aplicación, deshacer/rehacer, exportación, UML, errores de proveedor, temas y móvil. Las pruebas automáticas de IA usan respuestas simuladas y no consumen servicios externos.
