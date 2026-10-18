> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Peek de Atlas: ajustes basados en evidencia real de REA

16 de octubre de 2026. Rama `feat/database-identity-stage1`, conservando todo el
trabajo anterior. Respaldo previo de 68 archivos y manifiesto SHA-256:
`/tmp/atlas-rea-peek-baseline-rj9j6nw0`. No se cambió de rama ni se ejecutaron
reset/pull, commit, push, despliegue o migración de datos reales.

## Referencia y diferencias atendidas

Se reutilizaron las inspecciones reales R02–R04 de
[NOTION_REA_CONNECTION.md](NOTION_REA_CONNECTION.md), sus JSON con Evidence IDs y
las capturas `notion-rea-peek.png`, `notion-rea-peek-actions.png` y
`notion-rea-page-layout.png`. Durante esta implementación no se operó Notion ni
se ejecutaron nuevas inspecciones de REA. La validación interactiva de **Atlas**
se hizo con la conexión de navegador CUA sobre el demo temporal, no con REA.

| Evidencia de Notion | Diferencia anterior de Atlas | Cambio local |
| --- | --- | --- |
| R02: cabecera compacta, controles separados del título | Dos botones de texto junto al título | Barra con iconos, tooltips y etiquetas accesibles: cerrar, página completa, modo, anterior/siguiente, copiar enlace y acciones. |
| R02: título grande que envuelve; contenido bajo propiedades discretas | Input de una sola línea y título fuera del scroll del cuerpo | Título autoajustable, márgenes y alineación de propiedades revisados; cabecera fija y título/propiedades/cuerpo en el mismo scroll. |
| R02: anterior/siguiente y selector de modo | No existían | Navegación sobre los IDs visibles y ordenados de la vista de origen; límites deshabilitados; Side Peek, Center Peek y página completa del mismo ID. |
| R03: menú de página con búsqueda, tipografía y opciones discretas | Sin menú propio del Peek | Menú portal con búsqueda, tres fuentes, copiar enlace/contenido, descargar Markdown, texto pequeño, ancho completo e iconos de propiedades. Sólo acciones implementadas. |
| R04: configuración de layout separada y aplicación a todas las páginas | No hay constructor compartido de layouts | Se documenta esa diferencia. Los ajustes nuevos de apariencia son **por registro**, compartidos con su página completa. No se presenta una réplica de Customize layout. |

Medidas como márgenes, 32 px del título y 36 px de las propiedades son decisiones
CSS de Atlas contrastadas visualmente; no valores extraídos del CSS de Notion.
No se copian los marcos azules del editor de layout a la página de uso normal.

## Funcionamiento y conservación

- `databasePeek.jsx` reutiliza los iconos y Popover del módulo. Los portales llevan
  `data-peek-owner`; Escape dentro del menú lo cierra y devuelve el foco al ancla.
  Los menús reciben foco al abrirse para que Escape no cierre accidentalmente el
  Peek. Las acciones no implementadas de Notion no se añaden como botones vacíos.
- Anterior/siguiente usa el orden y filtro de la vista al abrir el registro;
  no consulta páginas ajenas ni cruza bases. Si un registro nuevo queda fuera
  del filtro, no se inventan vecinos. Cambios posteriores del filtro requieren
  volver a abrir desde esa vista para tomar su lista actual.
- La vista conserva su modo predeterminado `side`, `center` o `page`. Cambiar el
  modo desde el Peek afecta a esa apertura; no altera silenciosamente la vista.
- Cerrar, navegar, cambiar modo o abrir la página completa espera cuerpo,
  propiedades y presentación pendientes. Se conserva el mismo BlockNote completo,
  esquema, serialización y endpoint de contenido; no se crea otro editor recortado.
- La apariencia se guarda en `database_presentation` del registro mediante su
  endpoint de fila, con validación estricta de fuentes y booleanos y actualización
  selectiva bajo el bloqueo/transacción existentes. No cambia el esquema de la
  fuente, propiedades, orden, identidad ni pertenencia de los registros.
- La cola de presentación conserva el último borrador ante errores, registra
  su flush junto a los editores de celda, muestra error/reintento y conserva copia
  en sessionStorage. La copia descargable de recuperación del Peek incorpora
  también este borrador. Una presentación pendiente impide un cierre destructivo
  y se recupera al volver a abrir en la misma sesión del navegador.
- Peek y página completa leen la misma presentación y los mismos datos del
  servidor. La clase de apariencia se retira al salir del registro, para que no
  se aplique a otras páginas. Los estilos nuevos se limitan a registros de bases
  de datos, sus menús y su integración con el editor.

## Validación

- **351 pruebas Python aprobadas**, 19 advertencias preexistentes de
  `datetime.utcnow()`. Comando: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
  DATA_ROOT=/tmp/atlas-rea-peek-full-test-bootstrap
  /tmp/atlas-stage1-venv/bin/python -m pytest knowledge_base/tests -q`.
  El primer intento restringido bloqueó sockets de tres pruebas de servidores;
  la ejecución autorizada con sockets pasó completa, sin cambiar esas pruebas.
- **33 pruebas pertinentes de API/identidad aprobadas**. La prueba nueva verifica
  apariencia persistente en fuente/página completa, aislamiento de otra fila y
  otra base, conservación de cuerpo/valores/esquema, parches parciales y rechazo
  de entradas inválidas sin escritura.
- `npm --prefix knowledge_base/editor-src test` aprobado. Se añaden contratos de
  límites de navegación, orden filtrado y compatibilidad de presentación. Se
  mantienen las pruebas de colas fallidas, identidades, vistas y Markdown.
- Compilación del editor aprobada; bundle y CSS regenerados. `node --check` de
  `static/app.js` aprobado. Las comprobaciones de espacios se limitan a las
  fuentes/documentación modificadas: el literal de proveedor ya conocido del
  bundle generado no se reescribe para ocultar su advertencia.

Comprobación visual e interactiva, sólo con los cinco registros ficticios del
demo `/tmp/atlas-database-demo-hjrjs3m0`:

1. Desde Lista, abrir Órbita de medianoche, renombrarla temporalmente con un
   título largo y pasar a La última estación; volver conserva el título y los
   registros. El título creció a dos líneas. Se restauró el nombre original.
2. Guardar Serif, texto pequeño y ocultación de iconos. El registro siguiente
   mantiene sus valores predeterminados. Recargar y abrir la página completa
   conserva la apariencia de Órbita y sus nueve propiedades canónicas.
3. Editar un párrafo de BlockNote, pasar a Center Peek y a página completa:
   el mismo contenido aparece guardado. Recargar y reabrir confirma persistencia.
   Después se retiró el marcador de prueba y se restauró el párrafo original.
4. Abrir el selector de modos y pulsar Escape: se cierra el selector y permanece
   el Peek. Seleccionar opciones del menú de apariencia tampoco lo cierra.
5. Desde el portal de Estado, cambiar a En proceso conserva el Peek. Cerrar
   exteriormente y pasar a Lista refleja el cambio. Se restauró Terminado.
6. Configurar Lista para Center Peek, esperar el guardado y recargar: el mismo
   registro abre en modo centro. Después se restauró Side Peek para el demo.
7. Copiar enlace produce una URL local `?open=<id>` del mismo registro. No se
   afirma que esta sesión haya validado el portapapeles de todos los sistemas
   ni la descarga Markdown; esta última está implementada pero no se ejercitó.
8. Revisión a 1888, 942 y 480 px. A 942 px el Peek mide 640 px y deja tabla a la
   izquierda; a 480 px ocupa el ancho disponible, sin overflow horizontal del
   panel. Se restableció el tamaño normal del navegador. No sustituye una matriz
   completa de dispositivos, temas o accesibilidad.

Capturas de Atlas local:
Peek refinado (`atlas-rea-peek-refined.png`, evidencia/herramienta local no publicada),
menú (`atlas-rea-peek-actions.png`, evidencia/herramienta local no publicada),
Center Peek (`atlas-rea-peek-center.png`, evidencia/herramienta local no publicada),
ancho 942 px (`atlas-rea-peek-narrow.png`, evidencia/herramienta local no publicada).
Son evidencia de Atlas, no capturas de Notion ni resultados de REA.

## Pendientes explícitos

Constructor de layouts compartidos con módulos, paneles y estructuras Simple /
Tabbed; visibilidad/reordenación de propiedades propia del layout de página;
comentarios, favoritos, compartir y acciones de página aún no adaptadas; paridad
fina restante de menús/vistas. Se conserva el objetivo general abierto.
Los límites de las demás vistas y tipos siguen en
[DATABASE_WORKSPACE_STAGE2B.md](DATABASE_WORKSPACE_STAGE2B.md).

La recuperación de cuerpo ante HTTP 500 se validó en la etapa anterior. Aquí
se verifican las colas y los rechazos de la nueva presentación por pruebas,
pero no se inyectó otro fallo de red/servidor durante su revisión visual.

## Revisar localmente

Demo: `http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento`, contraseña
temporal `atlas-db-demo`. Abrir una fila con OPEN; revisar iconos, título,
propiedades y cuerpo; usar anterior/siguiente, selector de modo y acciones.
Configurar el modo predeterminado desde Configuración de vista → Abrir páginas en.
Cambiar una opción de apariencia, abrir la página completa y recargar para
comprobar el mismo registro. No se requiere acceder a datos reales.

## Continuación posterior

El estado anterior se conserva como historial. Las acciones de página, favoritos,
bloqueo, historial del cuerpo, importación/exportación, layout compartido de
propiedades y corrección del menú de bloques avanzaron posteriormente en
[DATABASE_PEEK_ACTIONS_AND_BLOCKS.md](DATABASE_PEEK_ACTIONS_AND_BLOCKS.md), con
359 pruebas Python aprobadas. Allí se distingue lo completado de los módulos
libres, colaboración y otras limitaciones que siguen pendientes.
