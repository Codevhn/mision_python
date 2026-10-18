# Dashboard configurable de bases de datos

Estado: implementación funcional y contratos automatizados; la revisión visual del demo se registra en la documentación de la ronda al terminarla.

## Referencia y alcance

Referencia funcional oficial: [Dashboards de Notion](https://www.notion.com/help/dashboards). Esta implementación usa la documentación como referencia de widgets basados en vistas y varias fuentes. La pantalla de suscripción de Notion no se utilizó como referencia del constructor. No se atribuye a REA ninguna inspección adicional del Dashboard: las observaciones REA de menús y Peek se documentan por separado.

El Dashboard deja de generar indicadores y un gráfico predeterminados. Un Dashboard nuevo empieza vacío y permite añadir las representaciones que se necesiten. Los datos y configuraciones de otras vistas se conservan.

## Funcionalidad implementada

- Modos de uso y edición. El modo de edición muestra herramientas de configuración y reordenación; el modo de uso conserva los widgets, la edición de celdas y la apertura de registros.
- Añadir widgets desde el catálogo real de fuentes canónicas de Atlas. Se pueden combinar bases diferentes, incluidas varias bases dentro de la misma página.
- Elegir una vista existente o configurar una representación propia: Tabla, Board, Galería, Lista, Calendario, Timeline, Gráficos, Feed y Mapa. No se permiten Dashboards anidados ni vistas de adorno.
- La selección de una vista copia su configuración al widget, no sus registros. Los ajustes posteriores son independientes y no alteran la pestaña original. Volver a seleccionar la vista importa su configuración actual.
- Nombre, filtros Y/O, orden múltiple, agrupación y propiedades visibles por widget. Las condiciones globales se aplican después y se intersectan con el resultado del widget, incluso cuando éste tiene condiciones O.
- Configuración pertinente por representación: apertura en Side Peek/Peek central/página, tarjetas y previsualización, columnas de Board, fechas de calendario/Timeline, medida y cálculo de gráficos, y propiedad Lugar para mapas.
- Agrupación explícita en Tabla, Board, Galería, Lista, Feed y Gráficos. Calendario y Timeline utilizan sus propiedades de fecha; Mapa utiliza coordenadas. No se ofrece una agrupación que esas representaciones no implementen.
- Mover/reordenar por arrastre del asa del widget o por botones anterior/siguiente. Tirador de redimensionado continuo y campos de ancho porcentual/altura en píxeles; flechas10px y Mayús40px. Los tamaños antiguos conservan su proporción. La distribución responde al contenedor y se apila a640 px disponibles o menos sin sobrescribir el ancho guardado. Evidencia y límites en [DATABASE_DASHBOARD_RESIZE_VALIDATION.md](DATABASE_DASHBOARD_RESIZE_VALIDATION.md).
- Duplicar y quitar widgets modifica únicamente la configuración del Dashboard. No crea, duplica, mueve ni elimina registros de las fuentes.
- Filtros globales persistentes con correspondencias expresas por fuente. No se vinculan propiedades por coincidencia de nombre. Se permiten equivalencias de texto/URL/correo/teléfono/nombre y selección/estado; los demás tipos deben coincidir. Las correspondencias incompatibles o eliminadas no se aplican. El panel muestra cuántas fuentes están vinculadas; las no vinculadas conservan sus registros.
- Las condiciones globales se pueden activar/desactivar. Se admiten texto, selección/estado, número, fecha, casilla, persona y selección múltiple; las comparaciones numéricas sólo se ofrecen para Número. Las fechas admiten coincidencia/vacío, no comparaciones cronológicas simuladas.
- Las celdas y el Board reutilizan los componentes existentes y los endpoints de su fuente. Mover tarjetas actualiza la propiedad de agrupación de la base original.
- Cada widget abre el Peek compartido con los IDs visibles de su propia fuente; no utiliza la navegación de filas de la DB que contiene el Dashboard. La página completa abre el mismo registro y cuerpo.
- Persistencia mediante `view.dashboard`, la cola existente `updateView`, revisión de esquema y respaldo del endpoint de fuentes. La configuración incluye identidad del widget, fuente, representación, filtros, orden, agrupación, propiedades, tamaño, posición y filtros globales. Los registros nunca se serializan dentro del Dashboard.
- Las fuentes se recargan al recibir `atlas:database-changed` y al cerrar el Peek. Los fallos de carga o guardado muestran un error y permiten reintentar conservando el borrador local.
- Controles de tema activo, etiquetas accesibles, foco visible, navegación nativa por teclado y controles de movimiento alternativos al arrastre. Los selectores usan fondo y texto del tema activo.

## Comprobaciones automatizadas

`knowledge_base/editor-src/test/dashboard.test.jsx` comprueba:

1. Identidad de fuentes y registros, configuración de vista independiente y ausencia de filas copiadas al duplicar widgets.
2. Reordenación, tamaños y configuración después de serializar y volver a leer.
3. Correspondencia global explícita y compatible, fuentes no vinculadas y combinación con filtros O del widget.
4. Contratos de componentes vacíos y restaurados; un Dashboard vacío no fabrica métricas ni gráficos.

Ejecución desde `knowledge_base/editor-src`:

```sh
./node_modules/.bin/vite-node --config vite.test.config.js test/dashboard.test.jsx
```

`knowledge_base/tests/test_database_dashboard.py` comprueba con almacenes temporales:

- Guardado y nueva lectura del esquema con dos fuentes, tamaños, orden, copia de widgets y filtros globales.
- Conservación exacta de otras vistas, cuerpos y propiedades de registros al configurar el Dashboard.
- Actualización canónica y rechazo de una escritura de un registro desde una fuente ajena.
- Quitar widgets sin eliminar registros ni contenido.

Resultado específico: **1 prueba Python aprobada**; prueba de modelo/componentes aprobada. La compilación y suite completa se ejecutan en la integración de la ronda.

## Revisión en el demo aislado

1. Crear o abrir una vista Dashboard. Pulsar Editar y Añadir widget.
2. Elegir una base con registros y configurar Tabla o Board. Añadir una segunda fuente y otro widget de la primera.
3. Cambiar ancho/altura, mover, duplicar y quitar widgets; recargar la página. Los IDs y cantidades de registros de cada base deben conservarse.
4. Editar una celda o mover una tarjeta en el Board. Comprobar la modificación en la pestaña normal de la misma base y en otro widget de esa fuente.
5. Crear un filtro global, vincular explícitamente sus propiedades compatibles y dejar una fuente sin vínculo. Sólo las fuentes vinculadas deben filtrarse.
6. Abrir un registro desde una fuente distinta de la DB anfitriona: Peek y navegación deben permanecer dentro de esa fuente.

## Limitaciones explícitas

- Redimensionado continuo implementado el 17 de octubre: ancho10–100 %, mínimo de presentación260px si cabe y altura160–1600px. Filas flexibles y orden persistente; no posicionamiento absoluto. Cancelación visual del arrastre en curso y táctil pendientes de verificación.
- No hay widgets de texto/imagen independientes, Dashboards anidados, formularios dentro de widgets ni publicación/integraciones externas. Los bloques normales de la página pueden acompañar a la DB Dashboard.
- Los filtros globales no convierten unidades, identificadores de personas o valores entre catálogos de opciones diferentes: se necesita correspondencia explícita y valores compatibles.
- La configuración de una vista seleccionada es una instantánea editable del widget, no un enlace vivo a todos los ajustes de la pestaña original. Los registros sí son siempre los originales y se mantienen sincronizados.
- No hay transacciones de guardado simultáneas entre fuentes: cada edición de registro utiliza el endpoint y control de pertenencia de su base. El Dashboard no traslada registros.
- La equivalencia visual completa con el constructor de Notion y las interacciones de arrastre/Peek requieren además la revisión de navegador del demo. Las pruebas de modelo y API no se presentan como esa verificación visual.

## Revisión integrada de esta ronda

Validación visual, evidencia REA, pruebas y límites finales en [DATABASE_REVIEW_ROUND.md](DATABASE_REVIEW_ROUND.md).

La continuación del 17 de octubre añade evidencia de resize, responsive y temas en [DATABASE_DASHBOARD_RESIZE_VALIDATION.md](DATABASE_DASHBOARD_RESIZE_VALIDATION.md). El seguimiento vigente sigue exclusivamente en [DATABASE_PLAN.md](DATABASE_PLAN.md).
