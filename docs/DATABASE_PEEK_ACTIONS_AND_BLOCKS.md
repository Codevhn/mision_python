> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Peek: controles de bloques y acciones de página

16 de octubre de 2026. Rama `feat/database-identity-stage1`. Continuación sobre
los cambios locales existentes; respaldo previo de 77 archivos y manifiesto:
`/tmp/atlas-peek-actions-baseline-cl0funh3`. Sin cambio de rama, reset, pull,
commit, push, despliegue ni migración de datos reales.

## Referencia y evidencia

Se reutilizaron las inspecciones REA R02–R04 y las capturas ya guardadas de
[Notion](NOTION_REA_CONNECTION.md). **Esta continuación no ejecutó REA ni operó
Notion.** Las observaciones nuevas y las capturas siguientes corresponden a
Atlas, mediante la conexión de navegador CUA y datos ficticios en `/tmp`.

El parpadeo de (+) y seis puntos se explica por la selección geométrica de
BlockNote 0.51.4: `SideMenuView.findClosestEditorElement` elige el primer editor
cuando las distancias empatan. El editor principal y el del Peek se superponen.
Se comprobaron ambos rectángulos en el DOM del demo; dentro del Peek la distancia
al editor de fondo también podía ser cero. El método es un campo de instancia,
no un método del prototipo: se adapta la fábrica de vistas del plugin nativo.
`editorHitTesting.js` usa el elemento situado delante y el propietario del portal
para elegir el editor del Peek. Fuera de esa superficie conserva el algoritmo
nativo. No se modificaron dependencias ni se sustituyó el editor de páginas.

**Comprobación directa:** (+) abrió el selector completo sin escribir `/`; se
eligió Encabezado 2 y se escribió «Validación de bloques» en una copia descartable.
Los seis puntos abrieron el menú de conversión/color/eliminación sin cerrar Peek.
Los controles permanecieron utilizables entre ambas operaciones.
Captura final de controles (`atlas-peek-block-controls-final.png`, evidencia/herramienta local no publicada) y
menú ampliado (`atlas-peek-actions-complete.png`, evidencia/herramienta local no publicada).

## Funciones añadidas

| Acción | Comportamiento y conservación |
| --- | --- |
| Duplicar | Nuevo ID y UID; conserva propiedades, apariencia y cuerpo. Renueva identidades de bases embebidas en el cuerpo para evitar vincular accidentalmente la copia. No copia filas hijas de esas bases. |
| Mover a otra base | Selección explícita de destino, diagnóstico previo y comprobación de revisión. Vincula propiedades por nombre y tipo compatibles. Los valores sin equivalencia exigen confirmación y siguen accesibles en «Propiedades conservadas del traslado». Conserva ID, UID y cuerpo; asigna posición al final del destino. |
| Recuperación del traslado | Antes de escribir guarda metadatos antes/después, ambos esquemas y Markdown en `DATA_ROOT/database_transfers/<id>/record.json`. «Deshacer último traslado» restaura sólo si no hubo cambios posteriores; abrir la página no cuenta como modificación. No sobrescribe ediciones recientes. Los resultados calculados sin equivalencia se conservan como instantánea junto a su definición. |
| Mover a la papelera | Confirmación y eliminación lógica mediante la papelera existente de la base. El archivo y las propiedades se conservan para restauración. |
| Favoritos | La estrella guarda el atributo `starred` del registro. |
| Bloquear página | Persiste `database_locked`; título, cuerpo BlockNote, celdas y botones de acción dejan de editarse. API de registros y rutas generales de contenido/propiedades/edición/restauración rechazan escrituras bloqueadas. Es protección de edición accidental, no un sistema nuevo de permisos. |
| Historial de versiones | Lista y previsualiza los snapshots existentes de contenido, incluidos sus timestamps con microsegundos. Restaurar exige revisión vigente, conserva una copia previa y modifica sólo el cuerpo, sin retroceder propiedades o pertenencia. |
| Importar Markdown | Archivo local o texto pegado, máximo 2 MB. Añade bloques mediante el mismo editor completo al final del cuerpo, sin sustituirlo. Las bases importadas reciben identidad nueva. |
| Exportar | Descarga HTTP autenticada de Markdown o JSON con cuerpo, registro proyectado y esquema. No publica ni comparte datos. |
| Tabla de contenido | Índice de encabezados del editor actual; navegación al bloque y actualización al editar. Ajuste persistente por registro, también disponible al abrir su página completa. |
| Añadir propiedad en Peek | Reutiliza el selector de tipos y la API canónica de esquema. La propiedad pertenece a la base y aparece también en las vistas. |

`database_record_actions.py` usa escrituras selectivas de SQLite bajo el bloqueo
compartido. Las copias se escriben antes de trasladar o restaurar. Restaurar cuerpo
revierte el archivo si falla la escritura SQL durante la misma petición. Esto no
convierte SQLite y el sistema de archivos en una transacción atómica ante cortes
de energía; los respaldos conservados permiten la recuperación manual.

## Diseño compartido de páginas

«Personalizar diseño» permite previsualizar sin guardar y aplicar a todas las
páginas de **esa base**:

- Estructura Simple o con pestañas Propiedades / Contenido.
- Orden de propiedades y ubicación en página, panel lateral u ocultas.
- Iconos predeterminados de propiedades; la apariencia específica del registro
  puede prevalecer cuando ese registro ya tiene una preferencia explícita.

Se guarda en `schema.page_layout`, separado de las configuraciones de cada vista
y de `database_presentation` por registro. Los cambios concurrentes de layout
producen conflicto. El editor de la página contenedora incorpora la versión
canónica del esquema para evitar que su autoguardado lo revierta. Cambiar la
pestaña interna oculta el editor sin desmontarlo ni perder el borrador.

Los menús se reposicionan al cambiar de tamaño y reciben foco incluso cuando
cargan controles de forma asíncrona. Escape cierra el submenú y permite seguir en
Peek. El clic exterior conserva la ruta de guardado y cierre existente.

## Validación

- **359 pruebas Python aprobadas**, incluidas ocho nuevas de duplicación,
  traslado, valores sin equivalencia, reversión protegida, cálculos archivados,
  bloqueo, layout compartido, historial y descargas. Se conservan las pruebas
  anteriores de aislamiento, persistencia, migración, conversión y recuperación.
- **`npm test` aprobado**: Markdown, identidades, colas, vistas, navegación,
  presentación, compatibilidad de layouts y selección del editor en primer plano.
- **`npm run build` aprobado**, bundle y CSS regenerados; `node --check` aprobado
  para `knowledge_base/static/app.js`. Comprobación de espacios en fuentes y
  documentación. Permanecen 19 advertencias de deprecación previas de Python.
- No se modificaron Notion ni datos reales. Demo reanudado con
  `--resume-demo /tmp/atlas-database-demo-hjrjs3m0`; se conservaron las filas
  añadidas por el usuario. No se volvió a generar el fixture.

Comprobaciones nuevas mediante interfaz:

1. Duplicar Órbita de medianoche y conservar sus nueve propiedades y cuerpo.
2. Insertar un encabezado mediante (+), abrir el menú de seis puntos y activar
   el índice. Bloquear/desbloquear y comprobar `contenteditable`/título de lectura.
3. Guardar layout con pestañas y Estado en panel; recargar y abrir la página
   completa: mismos valores y encabezado de prueba. Después volver al diseño
   Simple con todas las propiedades en página.
4. Importar Markdown pegado y comprobar el contenido anterior más el añadido.
   Previsualizar y restaurar una versión anterior: desaparece sólo lo importado,
   permanecen propiedades y encabezado de prueba.
5. Trasladar la copia a base B y abrir sus valores conservados, incluido el
   resultado 17; deshacer y regresar a la base original con mismo registro.
6. Guardar favorito y comprobar su persistencia tras recargar. Descargar JSON y
   leer el archivo: formato, mismo ID, fuente, nueve propiedades y Markdown.
7. Abrir configuración de diseño: panel dentro del viewport y foco propio;
   Escape lo cierra y deja Peek abierto. Clic en Board fuera del Peek lo cierra;
   volver a Tabla conserva los registros.
8. Archivar exclusivamente la copia creada para estas pruebas. La tabla termina
   con sus diez registros activos anteriores. La copia y su contenido de prueba
   siguen recuperables en la papelera. No se alteraron las filas en blanco del
   usuario. Las bases A/B conservan sus filas originales tras deshacer el traslado.

Hubo una desconexión del servidor temporal durante acciones: Atlas conservó el
Peek y mostró «Failed to fetch» con posibilidad de reintentar. Se reanudó el mismo
almacén; no se restauró un respaldo encima de las filas actuales.

## Límites y pendientes explícitos

- «Mover a» cubre bases de datos de Atlas. No implementa el traslado arbitrario a
  cualquier página, espacio o workspace de Notion.
- El layout incluye propiedades, panel y pestañas; **no es** el constructor libre
  de módulos/widgets y pestañas personalizadas de Notion.
- El historial es de contenido Markdown; no pretende ser historial completo de
  cambios de propiedades, autores o esquema. La recuperación de un traslado
  modificado posteriormente requiere revisar su copia en disco; no hay una
  interfaz de fusión manual de esos respaldos.
- La importación por archivo no pudo ejercitarse: Brave rechazó `setFiles` por
  faltar «Allow access to file URLs» de la extensión. No se cambió ese permiso.
  Sí se ejercitó la entrada pegada y su persistencia mediante BlockNote.
- Descarga JSON comprobada hasta el archivo local. Markdown devolvió HTTP 200 y
  pasó sus pruebas de contenido/cabeceras; la automatización no confirmó el
  archivo descargado. No se afirma que se haya validado ese último paso visual.
- No se probó arrastrar físicamente un bloque en esta continuación; se mantiene
  el arrastre nativo y se validó la selección del editor y apertura del menú.
- Comentarios colaborativos, compartir/publicar y permisos por usuario requieren
  un modelo multiusuario que esta instalación no tiene. No se añaden controles
  que aparenten resolverlo. Se mantienen fuera las integraciones externas e IA.
- Las adaptaciones y pendientes de vistas/tipos siguen en
  [DATABASE_WORKSPACE_STAGE2B.md](DATABASE_WORKSPACE_STAGE2B.md). La paridad total,
  las pruebas de volumen/dispositivos/temas y la preparación de datos reales
  permanecen abiertas; esta etapa no cierra el objetivo general.

## Revisión local

Abrir `http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento`; contraseña
`atlas-db-demo`. OPEN → mover el cursor por el cuerpo → (+) / seis puntos.
En (...) revisar acciones y Personalizar diseño. Para probar cambios de cuerpo,
traslados o restauraciones, duplicar primero un registro; la copia utilizada en
esta validación está en la papelera y se puede recuperar.

Si el demo no está en ejecución:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --resume-demo /tmp/atlas-database-demo-hjrjs3m0
```
