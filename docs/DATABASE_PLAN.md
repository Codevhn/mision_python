> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Seguimiento único de bases de datos y editor de Atlas

Actualizado: 18 de octubre de 2026. Rama `feat/database-identity-stage1`. Esta es la **única lista principal de seguimiento**: los informes enlazados conservan evidencia y contexto histórico, pero no constituyen planes paralelos ni sustituyen estos estados. Se conserva la dirección visual aprobada y todo el trabajo previo. La ronda del 16 de octubre consolidó el alcance, corrigió editor/catálogos y añadió Notion Native. La continuación del 17 de octubre implementó resize continuo y comprobaciones responsive. La ronda MENÚS posterior pulió Tabla/Peek y separó contratos verificados de comprobaciones abiertas. La continuación FUNC prioriza guardado, propiedades, tabla/vistas, exportación y Dashboard; conserva las inconsistencias visuales para revisión final y no amplía móvil/táctil ni colaboración.

## Prioridad vigente: primera versión funcional — Tabla, Peek y documentos

Esta decisión del usuario **sustituye las siguientes tareas históricas** de las
rondas anteriores (incluido Timeline). No se seguirá ampliando el módulo tras
validar esta entrega. La columna **Ámbito de primera entrega** clasifica cada
ID sin borrar su estado ni evidencia. «Mejora futura» es aplazamiento explícito,
no función terminada ni retirada. El compromiso histórico C no implica trabajo
inmediato cuando esta columna indica futuro.

- **Necesario:** Tabla/Peek, edición y recuperación de registros/columnas,
  BlockNote completo, navegación, guardado/borradores/reintento, filtros/orden
  básicos, aislamiento y exportación/descarga de documentos desde páginas,
  registros y el flujo existente de Cursos. Se conservan todas las funciones
  avanzadas ya implementadas; no se vuelve a auditarlas exhaustivamente.
- **Mejoras futuras:** ampliar/validar exhaustivamente otras vistas; fórmulas,
  rollups, relaciones inversas, dependencias, colaboración, móvil/táctil, carga
  prolongada, importación de archivo y opciones avanzadas de exportación.
  Cancelación intermedia de resize y Timeline no bloquean esta entrega.
- **Decisiones pendientes:** DB-SPACE-05 (semántica/ubicación de referencias).
  Cualquier ampliación futura sin contrato concreto se conserva como tal; no
  se convierte en un requisito nuevo de la primera entrega.

DB-VIEW-04, DB-PROP-02, DB-VIS-05 y DB-CHECK-06 permanecen **verificados**, con
sus funciones intactas. DB-TABLE-01/DB-VIS-01/DB-PEEK-04 y DB-SPACE-02 pueden
seguir parciales por pulido/matriz pendiente, sin impedir la entrega cuando su
flujo funcional descrito abajo está comprobado. Los temas y Notion Native se
conservan; sólo se corrigen visuales que impidan esos flujos.

Aceptación acotada (resultados en FUNC, sección «Primera entrega V1»; sin otro plan):

| Flujo | IDs aplicables | Comprobación de esta entrega |
| --- | --- | --- |
| Crear DB y reabrir; columnas habituales, nombre/orden/ocultar/eliminar | DB-ID-01/02, DB-PROP-01/02/03/04/11, DB-TABLE-01/02/03 | Verificado en QA V1: creación UI de dos DB, nombre/orden/ocultar/eliminar columna; recarga y aislamiento. Propiedades suplementarias sembradas por API, edición habitual en UI. |
| Registros y celdas; papelera/restauración | DB-SAVE-01/02/04, DB-PAGE-09 | Verificado QA V1: mismo ID, ocho valores, cuerpo A/C/H1 y orden tras papelera/restauración. |
| Peek→título/propiedades/cuerpo→(+)/asa/slash/drag→completa→recarga | DB-PEEK-01/02/03/04/05, DB-CHECK-06 | Verificado QA V1: (+), slash, clic del asa y drag real; página completa/recarga; controles H1 alineados a 0,41 px. Se reutiliza evidencia previa de scroll/temas/errores. |
| Guardado, error/borrador/reintento y cierre/navegación | DB-SAVE-03, DB-VIEW-03/04 | Reutilizar evidencia suficiente; sólo repetir si un cambio/fallo real lo justifica. |
| Página/registro/documento de Cursos exportado conserva contenido/original | DB-EXP-01/02/03/04/05/06, DB-CHECK-02 | Verificado: 8 contratos temporales+8 artefactos de curso/registro en cuatro formatos+ZIP con propiedades, sin DB padre; PDF abierto/renderizado y originales intactos. Se conservan medios/avisos previos. |
| Descarga y apertura desde navegador | DB-CHECK-02 | Verificado para PDF de Documento QA descarga V1: el usuario confirmó descarga, apertura, marcador ATLAS-CURSO-V1-7319, código, tabla y listas. Otros formatos no tienen confirmación manual. |

Respaldo antes de esta ronda: `/tmp/atlas-v1-baseline-tpyx1sow`, 204 archivos y 30
entradas del demo con SQLite, Markdown e historial. Sin migración real, commit,
push o despliegue. Los pendientes futuros no bloquean salvo fallo de integridad.

Resultado V1: flujo funcional Tabla/Peek comprobado y generación de documentos comprobada. **Entrega de Tabla, Peek y exportación de documentos concluida**, con confirmación manual del usuario para la descarga y apertura del PDF de Cursos (17 de octubre de 2026). Esta validación no se extiende a otros formatos ni a todos los flujos de descarga. Se detiene la ampliación de funciones. Los estados parciales por pulido, otras vistas y ampliaciones permanecen abiertos con su evidencia. Los 30 registros previos, Markdown e historial se conservan exactamente; el demo suma 35 entradas por los nuevos ejemplos QA.

## Preparación de integración con Atlas habitual (17 de octubre de 2026)

La primera entrega permanece concluida, incluido DB-CHECK-02 limitado al PDF
confirmado. La preparación posterior no reabre mejoras futuras ni modifica sus
estados. Ver [procedimiento y reversión](DATABASE_INTEGRATION.md),
[evidencia del ensayo](ATLAS_DATABASE_INTEGRATION_VALIDATION.json) y
captura QA aislada (`atlas-integration-rehearsal.png`, evidencia/herramienta local no publicada).

Se verificó Atlas habitual activo en Fly y DATA_ROOT=/data, distinto del demo.
Copia de lectura estable de6852 archivos;1150 entradas conservadas en el ensayo;
3 DB migradas,6 filas inequívocas asignadas y6 entradas no confirmadas sin tocar.
Migración repetible y restauración ensayadas; Tabla/Peek/recarga y exportadores
funcionan en copia con2 workers. Integración real **no ejecutada**. Antes de
integrar: respaldo final con escritores detenidos, conservación explícita de
portadas fuera del volumen y autorización de la ventana/intervención. Limitaciones
concretas y respaldos privados documentados en el procedimiento; no se sustituyen
por los datos ficticios ni se marca paridad adicional.

### Preparación final validada — 18 de octubre de 2026

Persistencia de portadas resuelta en `DATA_ROOT/data/covers`, manteniendo sus URL,
con inventario por hash y separación de36 dañadas históricas frente a daño/pérdida
nuevos. Contexto limpio129 archivos e imagen OCI final por digest preparados.
Ensayo dentro de la imagen: migración repetible,1150 originales conservados,
Tabla/Peek/recarga/exportación y reversión con la imagen anterior exacta aprobados.
45 pruebas dirigidas; tiempos y límites en
[procedimiento actualizado](DATABASE_INTEGRATION.md) y
[evidencia final](ATLAS_DATABASE_RELEASE_VALIDATION.json).

No quedan los dos bloqueos de preparación. Sigue sin autorizar/ejecutar publicar
la imagen, mantenimiento, migración real o activación. Controles finales del estado
vivo y respaldo offline siguen siendo condiciones de la intervención. No se
reabren ni cierran por esto otros IDs, mejoras futuras o decisiones pendientes;
DB-CHECK-02 mantiene exclusivamente su confirmación manual PDF anterior.

### Activación autorizada y completada — 18 de octubre de 2026

La autorización posterior del usuario permitió publicar la **misma imagen
congelada** `sha256:2facd34be5202eb39f21d3906788b06e3d1f89308a98a068136e3a3491053d82`,
respaldar offline, preservar portadas, migrar y activar en Atlas habitual.
Interrupción26min37s, aceptación antes del límite30min y acceso público reabierto.
1150 originales conservados; tres DB identificadas/seis pertenencias inequívocas;
seis entradas antiguas no confirmadas sin asignar.36 portadas conservadas por hash,
incluidas36 dañadas históricas sin daño nuevo. Secretos y Tailscale conservados.
Tabla/Peek/BlockNote/cierre/recarga/guardado e aislamiento comprobados en la página
QA nueva; ZIP de registro y PDF de Cursos inspeccionados. Lectura pública posterior
confirma el guardado tras reiniciar. No se amplía DB-CHECK-02 a otra descarga manual.

[Resultado, respaldo e incidencias](DATABASE_INTEGRATION.md) y
[evidencia de activación](ATLAS_DATABASE_ACTIVATION_VALIDATION.json).
Los párrafos anteriores describen preparación histórica, no el estado de operación
actual. Sin reconstrucción, mejoras nuevas, commit, merge ni push de Git.
**No se cambia el estado ni evidencia de ningún ID por esta activación**:
las mejoras futuras y decisiones pendientes siguen aplazadas o abiertas.

Publicación Git autorizada después de la activación: sólo código, pruebas y
documentación revisados; capturas/trazas privadas y demos permanecen locales.
421 pruebas de servidor y suite del editor aprobadas;129 archivos del contexto
coinciden con el artefacto desplegado. Ver la revisión de versionado en
[DATABASE_INTEGRATION.md](DATABASE_INTEGRATION.md). No cambia el estado de los IDs.

## Cómo interpretar y actualizar la lista

- Los IDs son estables: no se renumeran, borran ni reutilizan al resolver un requisito. Una corrección posterior actualiza su fila y añade evidencia fechada.
- Estados permitidos: **pendiente**, **parcial**, **implementado sin verificar**, **verificado**. Verificado se limita al criterio y evidencia citados, nunca a una paridad visual general implícita. Pruebas automatizadas, lectura de código y revisión visual se distinguen.
- Compromiso **C**: sigue comprometido; una limitación de implementación no lo aplaza. **D**: decisión o ampliación por definir; se conserva visible sin asumir autorización o equivalencia. **A**: aplazado/excluido explícitamente por el usuario. Colaboración y ampliación del lenguaje de fórmulas siguen parciales, ahora aplazadas explícitamente por el usuario para esta entrega; no se marcan terminadas.
- Base de consolidación: lectura de todos los informes DATABASE/NOTION y contraste con `DatabaseWorkspace.jsx`, `databaseViews.jsx`, `DatabaseDashboard.jsx`, `databaseViewConfig.jsx`, `databasePropertyConfig.jsx`, `databasePeek.jsx`, `database_api.py`, `database_export.py`, `main.jsx`, `dragHandleMenu.jsx`, `theme-registry.js` y hojas de edición. Las comprobaciones históricas del demo se conservan identificadas; no se presentan como ejecución nueva de esta ronda.
- Línea base histórica: 370 pruebas Python. Resultado nuevo NATIVE: 371 pruebas Python, suite frontend y build aprobados; revisión visual/interactiva separada. Los requisitos se reabren si fallan aunque las pruebas pasen.

## Evidencia e informes de referencia

| Clave | Documento y alcance de la evidencia |
| --- | --- |
| AUD | [Auditoría original](DATABASE_AUDIT.md) y [evidencia](DATABASE_AUDIT_EVIDENCE.json): defectos del código original, no descripción vigente de todo el módulo. |
| REF | [Comparación y propuesta originales](DATABASE_NOTION_REFERENCE.md), [N01–N22](NOTION_DATABASE_EVIDENCE.md): conexión de navegador, **no REA**; escrituras antiguas autorizadas se distinguen de la inspección actual de lectura. |
| ID | [Identidad/migración](DATABASE_IDENTITY_STAGE1.md): contratos API, 23 pruebas nuevas, respaldo/restauración/WAL y navegador A01–A04. |
| PRO | [Prototipo aprobado](DATABASE_REDESIGN_STAGE2.md): historia de la dirección visual, no autorización pendiente ni cierre de las vistas. |
| WS | [Workspace, tipos y vistas](DATABASE_WORKSPACE_STAGE2B.md): API/modelo y recorridos visuales expresamente enumerados. La descripción antigua del Dashboard fue sustituida por DASH. |
| PEEK | [Refinamiento](DATABASE_PEEK_REA_REFINEMENT.md) y [acciones/bloques](DATABASE_PEEK_ACTIONS_AND_BLOCKS.md): evidencia por etapa, con límites que la revisión posterior puede resolver. |
| REA | [Conexión y R02–R04](NOTION_REA_CONNECTION.md), conexión JSON (`NOTION_REA_CONNECTION_EVIDENCE.json`, evidencia/herramienta local no publicada), Peek (`NOTION_REA_PEEK_EVIDENCE.json`, evidencia/herramienta local no publicada), acciones (`NOTION_REA_PEEK_ACTIONS_EVIDENCE.json`, evidencia/herramienta local no publicada), layout (`NOTION_REA_LAYOUT_EVIDENCE.json`, evidencia/herramienta local no publicada): herramientas reales, transporte y limitaciones. |
| ROUND | [Revisión anterior](DATABASE_REVIEW_ROUND.md) y evidencia REA (`NOTION_REA_REVIEW_ROUND_EVIDENCE.json`, evidencia/herramienta local no publicada): menú desplazado, exportación, arrastre físico y Dashboard en el demo; responsive estrecho no validado en esa ronda. |
| SPACE | [Superficie y Relacionadas](DATABASE_EDITING_SURFACE.md): implementación y conservación de datos; resultado visual integrado en ROUND. |
| EXPORT | [Exportación](DATABASE_EXPORT_OPTIONS.md): diez contratos que inspeccionan ZIP/CSV/HTML/PDF y limitaciones. |
| DASH | [Constructor Dashboard](DATABASE_DASHBOARD_BUILDER.md): modelo/API; interacción visual integrada en ROUND. |
| NATIVE | [Validación de esta ronda](DATABASE_NATIVE_EDITOR_VALIDATION.md), [medidas CUA](ATLAS_NATIVE_EDITOR_VALIDATION.json), [tema](DATABASE_NOTION_NATIVE_THEME.md), [catálogo](DATABASE_BLOCK_CATALOG.md), REA real (`NOTION_NATIVE_REA_EVIDENCE.json`, evidencia/herramienta local no publicada): resultados, procedencia y límites. |
| FOLLOW | [Resize y revisión Native del 17 de octubre](DATABASE_DASHBOARD_RESIZE_VALIDATION.md), [medidas CUA](ATLAS_DASHBOARD_RESIZE_VALIDATION.json): pointer/teclado, persistencia, responsive, intento REA sin conexión y nuevo demo duradero. |
| FUNC | [Validación funcional](DATABASE_FUNCTIONAL_VALIDATION.md): guardado, propiedades y demás etapas aprobadas; sin ampliar visual/móvil/colaboración. |
| MENUS | [Validación de menús](DATABASE_MENU_VALIDATION.md), [medidas/inventarios CUA](ATLAS_DATABASE_MENU_VALIDATION.json): aceptación DB-MENU-01–09, evidencia REA reutilizada, foco, teclado, scroll y cuatro variantes de tema en demo QA. |

Las capturas Notion y Atlas conservan sus nombres y procedencia; una captura de Atlas no es evidencia de una medición de Notion. Los valores CSS elegidos por Atlas no se describen como medidas extraídas de Notion si no existe ese resultado.

## Identidad, conservación y guardado

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-ID-01 | Dos DB independientes de una página conservan IDs propios al guardar/recargar y no comparten filas. | verificado | ID/ROUND y NATIVE: regresión backend completa aprobada; 19 IDs previos conservados, A/B aisladas. V1: dos DB creadas mediante slash, IDs distintos y filas 2/1 después de recargar; filtro de A no afecta B. | No migrar datos reales; conservar límites del corpus heredado. | C | Necesario |
| DB-ID-02 | Todas las vistas de una DB usan los mismos IDs, propiedades y cuerpos; crear/cambiar vista no duplica filas. | verificado | ID/WS/DASH; NATIVE: Tabla/Board/Galería/Lista/Dashboard recorridos con fuentes conservadas; suite identidad/modelo aprobada. | Paridad visual de vistas avanzadas no se infiere de estos recorridos. | C | Necesario |
| DB-ID-03 | Migración inventaría, respalda SQLite/Markdown/historial, conserva IDs/valores/cuerpos/orden y se repite/reanuda/restaura. | verificado | ID: SQLite/JSON, WAL, journal, conflicto, interrupción y restauración en almacenes temporales; `migrate_database_identity.py`. | Requiere todos los escritores detenidos; no transacción atómica entre SQLite y archivos. | C | Mejora futura |
| DB-ID-04 | Filas antiguas ambiguas siguen accesibles; sólo un mapa explícito las asigna, sin inferencia arbitraria. | verificado | ID: `unresolved`, `orphan_identity`, mapa revisado, navegador A03. | Resolver corpus real sigue pendiente y fuera de esta ronda. | C | Mejora futura |
| DB-ID-05 | Copiar base/página independiente renueva identidad; mover contenedor la conserva; desvincular fila preserva página. | verificado | ID: contratos de copia/movimiento y reparaciones frontend; PEEK: duplicación de registro. | Copiar un contenedor no clona toda su jerarquía de filas; ampliar copia jerárquica necesita contrato. | C | Mejora futura |
| DB-ID-06 | Fuentes enlazadas fuera del Dashboard referencian una DB existente sin copiar registros y con vistas independientes. | parcial | REF: propuesta; DASH implementa referencia canónica en widgets. | No hay interfaz general de bloques/vistas enlazadas entre páginas ni gestión completa de fuentes. No confundir con propiedades Relación. | C | Mejora futura |
| DB-SAVE-01 | Esquema canónico por propiedad y escritura selectiva evitan renombrado divergente y pérdida entre filas. | verificado | WS: contratos API y revisión de esquema; `database_api.py`, `databaseUI.jsx`, integración de propiedades. FUNC etapa1: regresión de lectura que borraba filas corregida;12 pruebas workspace,8 escritores/24 registros/5 ciclos; casilla423 conserva borrador/bloquea cambio de vista/reintenta y persiste al recargar en Board. | Endpoints heredados de Atlas no están todos reescritos; no afirmar atomicidad universal. | C | Necesario |
| DB-SAVE-02 | Cero, falso, vacío y valores heredados sobreviven edición y recarga. | verificado | WS: prueba API y Formulario con número 0; ID: conservación en migración. | Ruta heredada sin identidad mantiene limitaciones auditadas; no borrarla antes de migración revisada. | C | Necesario |
| DB-SAVE-03 | Error/conflicto retiene borrador y permite reintentar/descargar; cerrar no destruye cambios pendientes. | verificado | WS: HTTP 500 real aislado y reintento; PEEK: borradores y colas; ROUND: flush exportador. FUNC etapa1: regresión de lectura que borraba filas corregida;12 pruebas workspace,8 escritores/24 registros/5 ciclos; casilla423 conserva borrador/bloquea cambio de vista/reintenta y persiste al recargar en Board. FUNC etapa5: configuración Dashboard fallida también se conserva/registra y bloquea navegación hasta reintento. V1: exportación de página/curso espera colas; fallo conserva diálogo y permite reintento (pageExport.test.js). | Recuperación de sesión depende de conservar esa sesión; no sustituye respaldo de servidor. | C | Necesario |
| DB-SAVE-04 | Cambios de esquema conservan snapshot/revisión; eliminación de propiedad/fila es recuperable sin perder valores. | verificado | WS: recuperación, conflicto, archivos/propiedades archivados y papelera; `database_api.py`. | Corte de proceso entre archivos e índice puede requerir revisión del snapshot `prepared`. | C | Necesario |
| DB-SAVE-05 | Volumen y concurrencia del módulo no pierden datos ni degradan interacciones de manera inaceptable. | parcial | AUD: riesgo heredado; WS/ID: conflictos y pruebas deterministas. FUNC etapa1:360 peticiones mixtas con8 escritores/24 filas en pruebas temporales sin pérdida; lectura ya no reescribe índice. FUNC etapa9: medición21 filas+2rollups redujo lecturas del esquema85→2 por petición; caché no cruza peticiones. | Sigue abierto volumen prolongado en frontend. El ensayo acotado no acredita carga ilimitada ni todos los endpoints heredados. No cubre edición simultánea del mismo cuerpo por varios clientes. | C | Mejora futura |

## Propiedades, tabla y configuración de vistas

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-PROP-01 | (+) de columnas permite nombre, búsqueda y selector con iconos; crea propiedad real persistente. | verificado | WS: creación URL, búsqueda, renombrado y recarga; `TypePicker`/API canónica. | Creación/persistencia ya verificadas; revisión de portal separada en DB-CHECK-03. | C | Necesario |
| DB-PROP-02 | Texto, Número, URL, Teléfono, Correo y Fecha validan/guardan valores y distinguen vacío. | verificado | WS: contratos por tipo; código validadores/editores. FUNC etapa2: borradores1e/Infinity no se envían como null; decimal8,5 persiste8.5; fecha01:10:05+03:00 mantiene día/zona al editar y recargar. FUNC etapa14: rangos start/end explícitos, fin inválido400 conserva borrador/valor, confirmación al retirar fin; formatos local/ISO/largo y12/24h cambian presentación sin tocar valores. CUA crea18–20 con horas/zona, mueve21–23, rechaza fin20 y cancela, guarda ISO/12h y recarga. API/artefactos y pruebas compartidas. | Contrato cerrado para formatos enumerados y validadores existentes; no implica catálogo completo de zonas/formatos de Notion. Strings heredados no se convierten; conversiones a texto conservan ambos extremos y respaldo. Teléfono sigue texto libre, sin normalización nacional inventada. | C | Necesario |
| DB-PROP-03 | Selección, multiselección y Estado administran opciones/colores; Estado administra grupos. | verificado | WS: opciones, renombrado y grupos en API/demo; `databasePropertyConfig.jsx`. | Retirar opción conserva valores antiguos. Gestión verificada; reordenación ahora verificada por separado en DB-CHECK-07 (FUNC). | C | Necesario |
| DB-PROP-04 | Casilla guarda booleano; ID y cuatro campos automáticos reflejan identidad/autor/fechas reales. | verificado | WS: pruebas API; `TYPES`/`COMPUTED` y proyección del servidor. | ID usa prefijo+UID, no contador secuencial; autor es propietario local, fechas ausentes no se inventan. | C | Necesario |
| DB-PROP-05 | Persona representa usuarios reales de la arquitectura y persiste selección válida. | parcial | WS: propietario `owner` y rechazo de usuarios inexistentes. | Sólo propietario local; directorio/multiusuario depende de modelo de cuentas. | C | Mejora futura |
| DB-PROP-06 | Archivos y multimedia adjuntan/descargan bytes locales y previsualizan imágenes. | verificado | WS: contratos de archivos; EXPORT: comparación de bytes. | Máximo 20 MB/archivo; bibliotecas externas aplazadas por DB-EXCL-01. | C | Necesario |
| DB-PROP-07 | Relación referencia IDs de fuente explícita; cambios de título no rompen vínculo. | parcial | WS: selección, API y rechazo de fuente incorrecta. FUNC etapa8: diagnóstico missing/deleted/wrong_source/source_missing sin borrar IDs; añadir vínculo válido conserva enlace en papelera; CUA restaura Destino X desde selector y suma18 persiste. | Gestión explícita de referencias implementada; relación inversa automática sigue abierta por contrato de esquema/recuperación. No se infiere equivalencia completa con Notion. | C | Mejora futura |
| DB-PROP-08 | Rollup calcula conteo/suma/promedio/mínimo/máximo de propiedad relacionada. | verificado | WS: contratos de relación/rollup y cálculo servidor. FUNC etapa8: regresión de papelera corregida; rollup informa conjunto incompleto en lugar de contarlo silenciosamente; restaurar mantiene IDs y suma18 tras recarga. | Ampliación de operadores/casos anidados de Notion sigue pendiente. | C | Mejora futura |
| DB-PROP-09 | Fórmulas evalúan dependencias con errores visibles y sin ejecución arbitraria; ampliar capacidades sin pérdida. | parcial | WS: intérprete AST, aritmética, `prop`, `concat`, `round`, `length`, `ifelse`, ciclos. | Lenguaje de Notion completo no implementado; funciones/fechas/listas y editor avanzado pendientes. | C | Mejora futura |
| DB-PROP-10 | Botón ejecuta acción local configurada y validada; Lugar guarda nombre/latitud/longitud. | verificado | WS: contratos; configuración y validadores actuales. | Botón no es motor de automatizaciones; Lugar sin geocodificación ni proveedor cartográfico. | C | Mejora futura |
| DB-PROP-11 | Conversión diagnostica incompatibles y conserva originales/recuperación; nunca descarta silenciosamente. | verificado | WS: HTTP 409, aceptación explícita, valores originales y restauración condicionada. | Restaurar después de cambios posteriores exige descarga/revisión manual. | C | Necesario |
| DB-TABLE-01 | Tabla compacta con edición directa, OPEN aparte, selección y estados de hover/foco legibles. | parcial | PRO aprobado; WS/ROUND: recorridos y capturas reales. FUNC etapa3: flechas/Home/End entre celdas visibles y Enter edita; Nota B actualizada aparece en Galería/Lista y recarga. | Navegación básica comprobada. Selección por rangos/pegado matricial carece de contrato concreto y no se añade por la expresión avanzada; fidelidad visual queda para revisión final. | C | Necesario |
| DB-TABLE-02 | Encabezado ofrece renombrar/configurar/tipo, filtrar/ordenar/agrupar/calcular/congelar/ocultar/ajustar/insertar/duplicar/eliminar. | verificado | WS: contratos y menú actual en `DatabaseWorkspace.jsx`; URL renombrada/oculta en demo. | Acciones existentes verificadas en sus contratos; recorrido visual/teclado por tipos separado en DB-CHECK-04. | C | Necesario |
| DB-TABLE-03 | Visibilidad, anchos, ajuste, congelación, cálculo y orden de propiedades afectan sólo a la vista. | verificado | WS: ocultación por vista, persistencia y código de configuración. FUNC etapa3: columnOrder por vista, controles accesibles y arrastre físico Nota antes de Hecho; recarga conserva orden y Board conserva esquema/orden propio. API/modelo/CSV usan columnas ordenadas sin alterar filas. | Título permanece primero. Navegación/selección adicional sigue en DB-TABLE-01; estilos no urgentes se revisan al final. | C | Necesario |
| DB-VIEW-01 | Toolbar usa iconos y estados; configuración presenta Diseño/Propiedades/Apertura/Agrupar/Filtrar/Ordenar según tipo. Cierra con DB-MENU-01/02/07/08 verificados. | verificado | ROUND/FOLLOW: funcionalidad y configuración existentes. Al inicio de MENÚS: matriz de aceptación abierta indicada abajo. MENUS: criterios aplicables DB-MENU verificados mediante UI/medidas y pruebas. | Alcance cerrado: los controles y menús enumerados. Los límites funcionales de otras filas permanecen abiertos; adaptaciones a Notion explícitas en MENUS. | C | Necesario |
| DB-VIEW-02 | (+) de pestañas ofrece once diseños reales, preview inmediata, nombre/configuración y pestaña persistente. | verificado | WS: once renderers diferenciados y creación de Agenda/restantes vistas; código `VIEW_TYPES`. | No equivale a cierre de las once vistas; ver DB-VIS-01–11. | C | Mejora futura |
| DB-VIEW-03 | Cada pestaña conserva tipo, filtros, orden múltiple, grupo, visibles y ajustes tras recargar. | verificado | WS: API/modelo y Agenda; ROUND: ajustes y Dashboard. | Búsqueda de toolbar es temporal por diseño; configuración de widgets es independiente. | C | Necesario |
| DB-VIEW-04 | Filtros por tipo y AND/OR, orden múltiple y agrupación son proyecciones sin alterar registros/orden manual. | verificado | WS: contratos, filtros y orden guardados; `databaseModel.js`. FUNC etapa3: grupos multiselección sin duplicar tarjetas y vacío separado de opciones Sin Estado; arrastre físico a Sin Estado especial y Sin Estado persiste sin vaciar la propiedad. FUNC etapa6: operadores/campos compartidos por tipo; fecha con hora coincide por día, numéricos finitos y etiquetas exactas;17 casos comunes JS/Python y CUA con recarga/Board independiente. FUNC etapa7: arrastre transaccional sobre etiquetas actuales, protección de otras pertenencias y origen obsoleto409;17 pruebas de modelo/API y CUA A→C conserva B/C. FUNC etapa12: grupos AND/OR recursivos y fechas relativas con zona guardada, semana lunes–domingo, límites explícitos;38 casos comunes JS/Python,39 pruebas API/export y CUA de Tabla/widget con recarga. | Contrato funcional cerrado con8 niveles/100 nodos por vista, sin reescribir registros. Board conserva adaptación multiselección documentada; su revisión visual sigue DB-VIS-02. Rangos filtran/ordenan por inicio, decisión de Atlas verificada en corpus final42 casos; no se atribuye a Notion. Fechas relativas se recalculan al renderizar/recargar/exportar, sin temporizador de medianoche. | C | Necesario |
| DB-VIS-01 | Tabla conserva cuadrícula editable, cálculos y desplazamiento horizontal sin comprimir columnas. | parcial | WS/ROUND: tabla amplia y scroll con Peek; código `adb-table-scroll`. | Ver DB-TABLE-01–03 y DB-SPACE-03. | C | Necesario |
| DB-VIS-02 | Board comparte registros; mover tarjeta actualiza grupo; configuración pertinente de tarjetas y apertura persiste. | parcial | WS: arrastre real y cambio de Estado; opciones icono/ajuste/color/preview/tamaño/compacto-lista. FUNC etapa3: grupos multiselección sin duplicar tarjetas y vacío separado de opciones Sin Estado; arrastre físico a Sin Estado especial y Sin Estado persiste sin vaciar la propiedad. FUNC etapa7: teclado y drag físico de orden dentro de carril, colapso/expansión y recarga; crear al pie C asigna C; configuración por vista/widget sin cambiar orden canónico. | Parte funcional de orden/colapso implementada y probada; comparación visual fina pendiente. Vaciar varias etiquetas exige edición explícita, adaptación de Atlas no observada en Notion. Orden explícito tiene prioridad; CSV no replica orden visual por carriles. | C | Mejora futura |
| DB-VIS-03 | Galería muestra tarjetas reales, propiedades editables y preview de contenido/imagen. | verificado | WS/ROUND: edición/restauración. FUNC etapa11: selección de propiedad de archivos concreta, sólo portada o fallback heredado; recortar/imagen completa efectivos (objectFit cover/contain); preview de cuerpo, apertura desde imagen al mismo Peek y recarga. Pruebas databaseCardModel y captura atlas-gallery-property-preview.png. | Criterio funcional cerrado; fidelidad visual global permanece en DB-QA/DB-THEME. Propiedad ausente no sustituye silenciosamente la portada elegida. | C | Mejora futura |
| DB-VIS-04 | Lista comparte registros y editores; opciones de visibilidad/apertura se conservan. | verificado | WS: edición/apertura sincronizadas. FUNC etapa11: mínimos compacta30/normal38/cómoda48px; CUA mide30 y48 en filas simples, contenido complejo crece sin recorte. Propiedades en línea/debajo y densidad persisten; edición de Nota Dos aparece en Galería; Peek conserva Cuerpo Uno. Captura atlas-list-layout-persisted.png. | Criterio funcional cerrado; medidas visuales de referencia y cobertura global de temas permanecen en DB-QA/DB-THEME. No incluye táctil/móvil. | C | Mejora futura |
| DB-VIS-05 | Calendario muestra mes por fecha, navegación/creación y acceso a registros sin fecha. | verificado | WS: Agenda creada, persistida y recargada con fechas. FUNC etapa10: drag físico18→20 persiste con01:11:00+03:00, mismos IDs/cuerpo/etiquetas/enlaces/suma18; API rechaza origen obsoleto409, fecha inválida400 y mantiene última hora/zona. FUNC etapa14: Semana persistente y navegación, intervalos inclusivos con mismo ID; CUA arrastra18–20→21–23 conservando horas/+03:00/cuerpo/otras propiedades, recarga y abre Beta desde22. | Criterio funcional cerrado para Mes/Semana/intervalos. Drop define nuevo día de inicio y conserva duración de calendario; no agenda horaria ni táctil. Día de navegación temporal, configuración Semana persistente. | C | Mejora futura |
| DB-VIS-06 | Timeline muestra intervalos y abre registros compartidos. | parcial | WS: renderer, contratos y captura Timeline. FUNC etapa14: reutiliza start/end de la misma propiedad cuando no hay columna final separada; CUA y SSR conservan intervalo21–23 sin aparecer también en Sin fecha. | Arrastre/resize de barras, zoom temporal y dependencias pendientes. | C | Mejora futura |
| DB-VIS-07 | Gráficos representan agregaciones reales y permiten acceder a registros de cada grupo. | parcial | WS: regresión de conteo y suma; renderer de barras. | Tipos de gráfico/ejes/opciones avanzadas pendientes. | C | Mejora futura |
| DB-VIS-08 | Dashboard es constructor persistente de widgets, no métricas fijas ni tabla decorativa. | parcial | DASH/ROUND: constructor implementado y revisión física. | Requisitos desglosados DB-DASH-01–07. | C | Mejora futura |
| DB-VIS-09 | Feed muestra cronología/extracto y abre los mismos registros. | parcial | WS: renderer diferenciado y vista persistida. | Reacciones/comentarios/cronología colaborativa dependen de DB-PAGE-10. | C | Mejora futura |
| DB-VIS-10 | Mapa representa lugares reales con apertura por teclado/Peek. | parcial | WS: cuatro coordenadas y captura; proyección local. | Mapa de calles, zoom, geobúsqueda y clusters pendientes; sin equivalencia completa de Notion. | C | Mejora futura |
| DB-VIS-11 | Formulario usa propiedades de la fuente y crea un registro compartido sin duplicar los existentes. | parcial | WS: creación con 0 y bloque de verificación; contrato API. | Formulario interno autenticado; publicación externa/lógica condicional/diseño avanzado pendientes, sin publicación autorizada. | C | Mejora futura |

## Peek, páginas y editor compartido

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-PEEK-01 | Exterior/cerrar/Escape cierran guardando; clics dentro de selectores/portales/diálogos propios no cierran accidentalmente. | verificado | WS: selector Estado/Escape/error500; ROUND: menús del asa/color y cierre persistente. V1 CUA: clic exterior oculta Peek; Escape del menú conserva Peek; ver FUNC primera entrega. | Guardado/cierre y portales ensayados conservan evidencia; cobertura de otros portales actuales en DB-CHECK-06. | C | Necesario |
| DB-PEEK-02 | Peek y página completa reutilizan BlockNote completo y muestran idénticos cuerpo/propiedades con guardado sincronizado. | verificado | WS/PEEK/ROUND y NATIVE: mismo EditorView; H1–H6, inserciones y orden final C,A,B iguales en Peek reabierto y página completa. V1 CUA: navegación A→B→A, página completa y recarga; título/propiedades/cuerpo conservados. | La persistencia de ID de registro no implica ID estable de bloque al reconstruir Markdown. | C | Necesario |
| DB-PEEK-03 | Barra superior con cerrar/completa/modo/anterior/siguiente y enlace/favorito/acciones; título y propiedades alineados. Cierra con DB-MENU-05/07/08 verificados. | verificado | REA R02 y PEEK/NATIVE/FOLLOW: modos/navegación y capturas existentes. MENUS: criterios aplicables DB-MENU verificados mediante UI/medidas y pruebas. | Alcance cerrado: los controles y menús enumerados. Los límites funcionales de otras filas permanecen abiertos; adaptaciones a Notion explícitas en MENUS. | C | Necesario |
| DB-PEEK-04 | Asa y (+) corresponden a la primera línea visible en h1–h6 compatibles, párrafo y multilínea con scroll/zoom/tema. | parcial | NATIVE: DOM Range/Floating UI; H1–H6/párrafo con error absoluto <0.4px; multilínea, scroll, temas y escala CSS125/150% comprobados. | Zoom nativo del navegador no establecido: Ctrl+plus no cambió viewport/DPR. No confundir con CSS zoom. Falta matriz de todos los temas. | C | Necesario |
| DB-PEEK-05 | (+) inserta, asa abre acciones y arrastre físico reordena; cursor/menu estables y orden persiste al reabrir/completa. | verificado | NATIVE: (+) insertó, asa abrió acciones/Color y drag físico produjo C,A,B; cierre exterior/reapertura y página completa conservan orden. | Inserción, acciones y drag físico verificados; cobertura de otros portales en DB-CHECK-06. Táctil no es alcance aprobado adicional. | C | Necesario |
| DB-EDITOR-01 | Un catálogo compartido da mismos nombres/iconos/categorías/orden a (+), slash y conversión; Párrafo primero. | verificado | NATIVE/Catálogo: definición compartida de 25 entradas; (+) abre slash y Convertir proyecta compatibles. Párrafo primero; suite catálogo y UI aprobadas. | Las opciones incompatibles se omiten por contenido/estructura, no se simulan conversiones. | C | Necesario |
| DB-EDITOR-02 | (+)/slash insertan y Convertir modifica bloque existente; incompatibles no se fuerzan ni pierden contenido. | verificado | NATIVE: inserción real, H1→H2 con mismo ID montado y deshacer; modelo real prueba contenido literal/hijos y rechazo de conversiones destructivas. | Convertibles limitados al dialecto que conserva estructura; código sangrado/vacío y destinos no inline mantienen restricciones documentadas. | C | Necesario |
| DB-EDITOR-03 | Página, DB, código y demás bloques personalizados siguen disponibles donde sean compatibles; menús comparten estilo en Peek/página. | parcial | NATIVE/Catálogo: Página/DB conservan callbacks y contexto, multimedia y H5/H6 ahora persisten; tests modelo/serialización y revisión visual de imagen/encabezados. | No hay callout en esquema actual; faltan recorridos visuales de inserción de todos los personalizados. Multimedia exporta audio/video como enlaces estáticos. | C | Necesario |
| DB-PAGE-01 | Menú de registro conserva búsqueda, fuentes, acciones reales y preferencias, con orden/grupos definidos; cierra con DB-MENU-06/07/08 verificados. | verificado | REA/ROUND: menú completo observado y funcionalidades previas; conservar evidencia histórica. MENUS: criterios aplicables DB-MENU verificados mediante UI/medidas y pruebas. | Alcance cerrado: los controles y menús enumerados. Los límites funcionales de otras filas permanecen abiertos; adaptaciones a Notion explícitas en MENUS. | C | Necesario |
| DB-PAGE-02 | Serif/Mono, pequeño/ancho completo/iconos/índice son preferencias de registro, persistentes y compartidas con página completa. | verificado | PEEK y acciones: presentación por registro, recarga/completa/índice; `databasePresentation.js`. | No convertir preferencias de página en opciones globales del tema. | C | Necesario |
| DB-PAGE-03 | Favorito y bloqueo persisten; bloqueo impide edición en frontend/API, sin fingir permisos multiusuario. | verificado | PEEK acciones: pruebas API y navegador lectura/guardado. | Bloqueo contra accidentes; no control de acceso. | C | Necesario |
| DB-PAGE-04 | Duplicar conserva cuerpo/props con nuevo ID; mover entre DB conserva contenido y valores sin equivalencia con recuperación. | verificado | PEEK acciones: traslado, reversión protegida, duplicación y conservación. | Mover arbitrariamente a cualquier página/workspace no implementado; no copia jerarquía completa. | C | Mejora futura |
| DB-PAGE-05 | Historial previsualiza/restaura cuerpo con revisión sin retroceder pertenencia/propiedades. | verificado | PEEK acciones: tests y restauración en copia demo. | No historial completo del esquema/autores/propiedades; fusión manual pendiente. | C | Mejora futura |
| DB-PAGE-06 | Importar Markdown añade al editor completo sin reemplazar contenido; bases importadas reciben identidad nueva. | parcial | PEEK acciones: pegado y persistencia comprobados. FUNC etapa13: filechooser real abierto; setFiles rechazado explícitamente por permiso de la extensión. Se canceló sin importar. | Bloqueo externo: en Brave, Detalles de extensión ChatGPT → Allow access to file URLs. No se activó ni se eludió ese permiso; falta importar archivo real y validar renovación de IDs/persistencia. Pegado no cierra este criterio. | C | Mejora futura |
| DB-PAGE-07 | Diseño de registros separado de vista: Simple/Tabbed, orden/ubicación/visibilidad de props aplicados a toda la DB. | verificado | PEEK acciones: API/layout y demo recarga/completa; REA R04 referencia. | Funcionalidad parcial de layout completo: ver DB-PAGE-08. | C | Necesario |
| DB-PAGE-08 | Constructor de layout permite módulos/paneles/pestañas personalizadas y capacidades pertinentes de la referencia. | parcial | REA R04: módulos observados; Atlas sólo propiedades/panel/simple-tabs. | Constructor libre de módulos/widgets aún pendiente; no fue aplazado explícitamente por usuario. | C | Mejora futura |
| DB-PAGE-09 | Eliminar registro usa papelera recuperable y añadir propiedad desde Peek edita esquema de esa DB. | verificado | WS y PEEK acciones: API/papelera, selector canónico. V1 CUA: papelera→restaurar Registro V1 A revisado mantiene ID, 8 valores y orden A/C/H1. | Contratos de papelera/esquema ya verificados; presentación y uso en Native separados en DB-CHECK-05. | C | Necesario |
| DB-PAGE-10 | Colaboración, comentarios, compartir/permisos y actividad representan capacidades reales y no botones simulados. | parcial | WS/PEEK: propietario único y omisión de acciones ficticias. | Modelo multiusuario/ACL/comentarios no existe. Dependencia arquitectónica abierta; no publicar ni pedir acceso externo en esta ronda. | C | Mejora futura |

## Superficie de edición, referencias y Dashboard

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-SPACE-01 | Centro sin marco ni espacios ornamentales; prosa legible y bloques amplios usan ancho disponible/scroll propio. | verificado | SPACE/ROUND: página1658px, DB1578px a1888px; CSS de superficie y decorador. | Debe conservarse en todos los temas, sin restaurar marco central al salir de Notion Native. | C | Necesario |
| DB-SPACE-02 | Apertura/cierre de sidebar/Peek redistribuye ancho sin recorte ni pérdida de configuración. | parcial | ROUND/NATIVE/FOLLOW: contenedor responde al Peek; Dashboard adapta filas según espacio; configuración estrecha deja canvas316 px en vez de86px. | Falta matriz completa sidebar/Peek, todas las vistas y temas; distribución móvil es adaptación de Atlas. | C | Necesario |
| DB-SPACE-03 | Editor, DB, menús y Peek funcionan en pantallas estrechas con márgenes y scroll adecuados. | parcial | NATIVE/FOLLOW: anchos efectivos390–1200 px; menú móvil348 px sin desbordamiento; configuración encima de vista y foco/Escape comprobados. | Táctil, todos los portales y vistas avanzadas siguen pendientes. Cambios se basan en fallos reproducidos, no sólo CSS. | C | Mejora futura |
| DB-SPACE-04 | Retirar Relacionadas preserva datos/API y no reserva columna lateral ni crea falsos backlinks. | verificado | SPACE: análisis de recomendaciones; ROUND: DOM y evidencia Notion. | Relaciones explícitas y Referenciado por se conservan. | C | Necesario |
| DB-SPACE-05 | Resolver necesidad de referencias mediante semántica comprobada, sin confundir sugerencias, menciones, backlinks y relaciones. | parcial | REA/ROUND: No backlinks; docs oficiales y API Atlas por coincidencia de título. | Índice canónico de menciones aún sin diseño; ubicación futura sólo si hay equivalencia útil. | D | Decisión pendiente |
| DB-DASH-01 | Uso/edición y añadir widgets desde fuentes canónicas/vistas existentes o nuevas sin copiar filas. | verificado | DASH/ROUND: tabla A+galería B, API/modelo y demo; widgets sin registros embebidos. | Seleccionar vista copia configuración, **no enlace vivo** a futuros ajustes; registros sí vivos. | C | Mejora futura |
| DB-DASH-02 | Widgets persisten orden, mover/arrastrar, duplicar y quitar sin tocar registros. | verificado | ROUND: flechas y drag físico; dos recargas y pruebas API/SSR. FUNC etapa5: fallo sin conexión reproducido; borrador de configuración en sesión, navegación bloqueada, reintento y recarga conservan widget; pruebas de cola/errores/recuperación y ausencia de espera recursiva con celdas. | Posición en cuadrícula, no lienzo absoluto. | C | Mejora futura |
| DB-DASH-03 | Redimensionado libre con tiradores modifica y persiste distribución de widgets. | verificado | FOLLOW: tirador físico791→654px/400→313px; teclado y recarga664/363; campos libres47.3%/487 px; modelo y API conservan medidas no predeterminadas. FUNC etapa5: flecha y drag físico guardan445px; campo47.3% y recarga conservan ambos. | Tamaño continuo verificado con límites documentados; cancelación física abierta en DB-CHECK-01. Táctil es ampliación sin aprobación para esta ronda. | C | Mejora futura |
| DB-DASH-04 | Filtro/orden/grupo/visibles propios por widget y globales con correspondencia explícita compatible. | verificado | DASH: AND tras OR y compatibilidad; ROUND: filtro Alfa A=1/B=0 tras recarga. FUNC etapa5: mayor que2, Número→Valor,2/2 fuentes explícitas; tabla y galería muestran1 registro cada una tras recarga. | Sin conversión de unidades/catálogos; fuentes no vinculadas no se filtran. | C | Mejora futura |
| DB-DASH-05 | Widgets abren Peek con fuente/IDs correctos y ediciones actualizan las otras representaciones. | verificado | ROUND: `beta-sólo-b`, 8.5→9→8.5, conservación A/B; código listener canónico. FUNC etapa5: Hijo visible abre el mismo ID desde galería; Detalle Visible confirmado aparece en widget al cerrar y recargar, sin crear registros. | No transacción única de escrituras entre distintas fuentes. | C | Mejora futura |
| DB-DASH-06 | Widgets muestran opciones pertinentes sin sustituir diseños distintos por tabla ni controles decorativos. | parcial | DASH: nueve tipos disponibles y configuración específica. | Dashboard anidado, formularios y widgets libres de texto/imagen no implementados. | C | Mejora futura |
| DB-DASH-07 | Dashboard se adapta a anchos estrechos y conserva distribución sin recortes de herramientas. | parcial | FOLLOW: dos fuentes con Tabla/Galería a1200/900/640/390 px; apilado por contenedor,390 px documento=390 y widgets=316; ancho guardado intacto. | Faltan las demás representaciones, táctil y combinaciones avanzadas de herramientas/filtros. No generalizar dos widgets a todas las vistas. | C | Mejora futura |

## Exportación

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-EXP-01 | Única entrada Exportar… abre diálogo real con formato/vistas/contenido/subpáginas/carpetas dependientes. | verificado | ROUND: UI y REA; `databaseExport.jsx`, `databaseControls.jsx`. | ZIP en todos los formatos; explicar claramente alcance y omisiones. | C | Necesario |
| DB-EXP-02 | MD&CSV/HTML/PDF/JSON producen documentos reales con propiedades/cuerpo; inspeccionar artefactos, no sólo descarga. | verificado | EXPORT: ZIP/CSV/HTML/PDF abiertos, PyMuPDF y bytes; ROUND: artefacto POST inspeccionado. FUNC etapa9: MD/CSV,HTML,PDF yJSON conservan diagnóstico de relaciones/cálculos incompletos; manifiesto property_issues y aviso en diálogo, sin ampliar alcance. V1: 8 contratos temporales página/curso MD/HTML/PDF/JSON; 8 artefactos reales de curso/registro y ZIP de registro inspeccionados, originales intactos. | Artefactos y formatos verificados por inspección; DB-CHECK-02 acredita descarga/apertura manual sólo del PDF de Cursos, sin extenderla a otros formatos. | C | Necesario |
| DB-EXP-03 | Exportar registro incluye sólo él y DB/descendientes contenidos elegidos, nunca toda DB padre ni hermanos. | verificado | EXPORT: aislamiento, relaciones sin ampliar alcance, fences/inline preservados; ROUND: copia B,C,A,D. | Límite200páginas/5000filas por DB/50MB; contenido activo depende de opciones. | C | Necesario |
| DB-EXP-04 | Everything incluye archivos locales; excluir los retira realmente de cuerpo/propiedades/CSV/HTML/PDF. | verificado | EXPORT: igualdad de bytes locales y presencia/ausencia en PDF/ZIP. | Recursos remotos requieren DB-EXP-05; archivos ausentes/rutas no reconocidas constan como omisión. | C | Necesario |
| DB-EXP-05 | Recursos remotos solicitados se incorporan realmente o se ofrece resolución explícita con errores recuperables. | verificado | FUNC etapa4: ZIP del demo contiene PNG público8090 bytes idéntico al origen; exclusión no descarga ni incluye recurso;23 pruebas export/remote con límites, redirecciones, DNS privado, TLS y escritor concurrente. | Sólo HTTP(S) público sin sesión, puertos estándar,20 intentos/20s totales/5s por recurso/20MB por archivo y50MB por ZIP. URL y motivo en manifiesto para bloqueados/fallidos; corregir enlace y reintentar. | C | Necesario |
| DB-EXP-06 | Subpáginas/carpetas cambian estructura y cuerpos incluidos; nombres únicos/enlaces relativos coherentes. | verificado | EXPORT: artefactos con/sin carpetas, títulos iguales y enlaces. | No paquete de restauración total de Atlas; se conserva alcance solicitado. | C | Necesario |
| DB-EXP-07 | Current/Default aplican vista, filtros, orden y visibles; semántica de adaptación se declara. | parcial | REA observó dos opciones; EXPORT compara artefactos de ambas. FUNC etapa4: Current usa Detalle/Valor y sólo Hijo visible; Default incluye ambos hijos y carpetas elegidas. FUNC etapa6: el motor Python comparte17 casos de fechas/números/casillas/etiquetas con el modelo frontend. | Default=primera vista guardada es adaptación **no demostrada de Notion**; CSV/HTML no reproducen visualmente Board. Orden Unicode puede diferir del navegador español. | C | Mejora futura |

## Catálogo, temas y validación de esta ronda

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-TRACK-01 | Este documento contiene cada requisito previo/nuevo con ID, aceptación, estado, evidencia y límites; informes sólo enlazan evidencia. | verificado | Consolidación de esta ronda y contraste documental/código descritos arriba; IDs de esta tabla. | Actualizar al terminar cada etapa; no cerrar un criterio de interacción con sólo SSR/API. | C | Necesario |
| DB-THEME-01 | Añadir Notion Native al selector existente conservando todos los temas y mecanismo de persistencia. | verificado | NATIVE: selector oscuro/claro, IDs antiguos intactos, prueba real de aplicación/persistencia y cambio UI con retorno a Ámbar. | Preferencia explícita de tema de curso conserva prioridad contextual existente. | C | Necesario |
| DB-THEME-02 | Tokens/componentes compartidos cubren presentación global. Parte menús Tabla/Peek: DB-MENU-08; resto de módulos mantiene cobertura abierta. | parcial | NATIVE/FOLLOW: tokens globales y recorridos ya realizados, conservados. MENUS: Tabla/Peek verificados en Native oscuro/claro y Ámbar/Porcelana; DB-MENU-07/08. | Parte de menús cerrada. Cobertura global y demás módulos/plugins siguen abiertos; no se acredita revisión visual exhaustiva de todos los temas. | C | Mejora futura |
| DB-THEME-03 | Notion Native oscuro aproxima referencia; variante clara integrada al mecanismo existente con estado explícito. | parcial | NATIVE: oscuro contrastado con captura REA real; claro integrado y menú legible observado. | Notion claro no inspeccionado; cobertura visual de todas las vistas en ambas variantes pendiente. | C | Mejora futura |
| DB-THEME-04 | Tema, contraste, foco y teclado en portales. Parte menús Tabla/Peek: DB-MENU-07/08; resto de tooltips/plugins permanece abierto. | parcial | NATIVE/FOLLOW: portales comprobados. DB-CHECK-03/04/05 separan revisión abierta de contratos previos verificados. MENUS: Tabla/Peek verificados en Native oscuro/claro y Ámbar/Porcelana; DB-MENU-07/08. | Parte de menús cerrada. Cobertura global y demás módulos/plugins siguen abiertos; no se acredita revisión visual exhaustiva de todos los temas. | C | Mejora futura |
| DB-THEME-05 | Cambiar/recargar/volver de tema conserva página, pestaña, contenido y cambios pendientes; recupera tema anterior. | verificado | NATIVE: oscuro→Ámbar→claro→oscuro con Peek y título editado; contenido y preferencias intactos, recarga conserva Native y vista Todo. Prueba de registro preserva atributos. | Sin remontaje del editor; no equivale a validación de cada módulo externo. Preferencias explícitas por curso se respetan. | C | Necesario |
| DB-THEME-06 | Serif/Mono/pequeño/ancho siguen siendo preferencias de página y funcionan dentro de cada tema. | verificado | NATIVE: Serif Georgia y Mono SFMono-Regular/Consolas; Serif+pequeño+ancho sobreviven claro→oscuro. Preferencias restauradas en copia; contratos de presentación aprobados. | Matriz visual exhaustiva de cada combinación de preferencias y tema sigue DB-QA-01/02. | C | Necesario |
| DB-THEME-07 | Ornamentación Centinela se retira por sistema de tema en Native; otros conservan identidad y centro siempre libre. | verificado | NATIVE/Tema: ornamentación desactivada mediante familia, marco guardado intacto; al volver a Ámbar recupera identidad. Centro sigue libre por editing-surface.css. | No se borran preferencias de marco ni se rediseñan módulos funcionales. | C | Necesario |
| DB-QA-01 | Clic, insertar/convertir, arrastrar, guardar, navegar y exportar son funciones comunes entre temas. | parcial | NATIVE/FOLLOW: resize por puntero/teclado, persistencia, Native claro/oscuro y Naranja Ámbar, fuente de Peek y acciones del asa. Comportamiento común por componentes compartidos. | Matriz completa de temas/funciones pendiente; cancelación de resize en DB-CHECK-01. Táctil requiere aprobación adicional; no queda autorizado por responsive. | C | Mejora futura |
| DB-QA-02 | Revisión comparativa visual y medidas efectivas prueban primera línea, scroll/zoom/tema, foco y varios anchos. | parcial | NATIVE/FOLLOW: medidas y capturas,390–1200 px, CSS125/150%, scroll y foco. H1 de Peek sigue alineado339 px/339 px tras cambios de distribución. | Ctrl+equal no cambió innerWidth/DPR: zoom nativo sigue sin verificar. No equipararlo con CSS zoom ni medir Notion con datos de Atlas. | C | Mejora futura |
| DB-QA-03 | Suite pertinente de identidad/migración/editor/export y build pasan después de cambios, con evidencia de la ronda. | verificado | FOLLOW:371 pruebas Python/41 warnings en 8.84 s tras reintento fuera de restricción de sockets; npm test y build1128 módulos aprobados, revisión visual separada. MENUS:371/41 warnings en8.91s; frontend con navegación compartida y build1129 aprobados. FUNC final:390 pruebas Python/41 avisos en12.25s; npm test completo y build1134 módulos en10.58s; py_compile/node --check aprobados. FUNC continuación7–10:401 Python/48 avisos en13.61s, npm test completo y build1136 módulos/11.62s; pruebas visuales independientes. FUNC etapa11: npm test completo con modelo de tarjetas y build1138 módulos/9.47s; frontend únicamente, suite Python401 se conserva. FUNC etapa12/13:403 Python/48 avisos en11.22s;21 export tras caso heredado inválido; npm test completo y build1139/10.43s. CUA independiente de suites. FUNC etapa14:408 Python/55 avisos en11.98s; npm test completo y build1139/9.20s. Prueba de conservación de exportación consulta índice antes de un segundo GET que actualiza last_viewed_at. | Avisos datetime/WeasyPrint previos. Suite no cierra fidelidad visual ni pendientes funcionales. | C | Necesario |

## Uso de REA y límites operativos permanentes

| ID | Criterio de aceptación / resultado esperado | Estado | Evidencia de validación | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-REA-01 | Confirmar herramienta real, transporte correcto y objetivo; no confundir MCP configurado con inspección. | verificado | REA/ROUND: `binary_session`, `list_browser_targets`, `inspect_web_page`, `capture_web_screenshot` con Evidence IDs. | Estado de conexión/proveedores puede cambiar: verificar endpoint vigente al usarlo de nuevo. HTTP404/escenario HTTP no se arreglan repitiendo URLs inválidas. | C | Necesario |
| DB-REA-02 | Consultar evidencia primero; inspecciones nuevas concretas en lectura, WS vigente sólo127.0.0.1; atribuir REA/CUA por separado. | parcial | NATIVE: inspección previa verificada. FOLLOW: endpoint vigente leído y list_browser_targets real devolvió provider_timeout10000 ms; no hubo nueva observación Notion. MENUS: reutilización de evidencia existente; ninguna nueva llamada REA ni operación Notion. FUNC: correcciones basadas en fallos de Atlas y evidencia guardada; CUA sólo demo, sin nuevas llamadas REA ni observación nueva de Notion. FUNC etapa7: conexión vigente leída de DevToolsActivePort; list_browser_targets e inspect_web_page reales devolvieron Notion con1119 DOM/804AX, sin acciones. | Evidencia actual de tabla, no arrastre de multiselección de Notion. Se reutilizó evidencia anterior. CUA operó Atlas; no sustituye ni demuestra conexión REA. Causa concreta del timeout no establecida. | C | Necesario |
| DB-OPS-01 | Conservar rama/cambios/demo; respaldo reversible; no sembrar de nuevo ni tocar datos reales. | parcial | FOLLOW:140 archivos locales respaldados y presentes. Al empezar ya no existía el demo temporal anterior; fixture nuevo conserva10 IDs/7 registros y se reanudó en local-demo ignorado por Git. MENUS:149 archivos respaldados y presentes;10 documentos, historial y metadatos originales del demo iguales al respaldo; QA separada. FUNC:161 archivos iniciales presentes;13 IDs originales con metadatos, Markdown e historial iguales al respaldo;5 IDs nuevos de QA, total18. FUNC continuación: respaldo180 archivos y18 entradas, todas intactas (meta/Markdown/historial);7 IDs QA nuevos, total25. FUNC etapa12/13: respaldo194 archivos y25 entradas; metadata/Markdown/historial idénticos,5 IDs QA nuevos, total30. | Registros del demo anterior no recuperados: no se afirma conservación de un almacén ausente. Carpeta nueva duradera no sustituye respaldo externo; entorno Python aún temporal. | C | Necesario |
| DB-OPS-02 | No migrar real, editar Notion/permisos/publicación, ni commit/push/desplegar en esta ronda. | verificado | Restricción explícita del usuario; informes previos y trabajo local. | Autorización para prueba local no autoriza publicación; mantener Notion sólo lectura. | C | Necesario |
| DB-EXCL-01 | Google Drive, Figma, GitHub PR, Zendesk y autocompletado IA permanecen sin integración ni botones ficticios. | verificado | Exclusión explícita original; WS/PEEK/ROUND. | **Aplazados/excluidos por el usuario**, no requisitos omitidos. | A | Mejora futura |
| DB-EXCL-02 | Preparación/migración de datos reales y publicación quedan detenidas hasta autorización expresa posterior. | pendiente | Requisito operativo de esta ronda y procedimiento ID conservado. | **Aplazado expresamente**; no intentar cerrarlo para completar esta lista. | A | Mejora futura |


## Ronda MENÚS: aceptación acotada y comprobaciones separadas

Alcance histórico de la ronda MENÚS: pulir menús compartidos de Tabla/Peek y los componentes de tema que utilizan. Se conserva el catálogo de bloques y todos los temas. No incluye móvil/táctil, colaboración, nuevos diseños ni otras funciones. Las comprobaciones responsive anteriores no autorizan esas ampliaciones. Las referencias a táctil en filas históricas se conservan como limitación de evidencia, no como compromiso de implementación aprobado.

Los estados verificados previos acreditan su contrato concreto, no las revisiones abiertas que se separan abajo. La evidencia histórica no se borra. Los IDs padre sólo se cierran cuando todos sus criterios de esta ronda aplicables tengan evidencia; DB-THEME-02/04 permanecen parciales si únicamente se verifica su parte de menús.

| ID | Resultado y criterio concreto de aceptación | Estado | Evidencia | Limitaciones y dependencias | Compromiso | Ámbito de primera entrega |
| --- | --- | --- | --- | --- | --- | --- |
| DB-MENU-01 | Toolbar Tabla: pestañas primero; Filtrar/Ordenar/Buscar/Configuración/Más/Nuevo a la derecha, iconos16px y botones28–30px, tooltip/nombre accesible y estado activo correcto; abrir/cerrar no modifica datos. | verificado | MENUS: toolbar30px/iconos16, orden/etiquetas/estados y menús sin creación accidental; capturas/JSON. | Las funciones adicionales siguen en DB-VIEW-04; no añadir controles sin implementación. | C | Necesario |
| DB-MENU-02 | Configuración de vistas existentes: índice con entradas y chevron; cada entrada abre sólo su sección; volver/Escape devuelve al nivel anterior y foco al disparador; ajustes de vista no editan esquema ni otras pestañas. | verificado | MENUS: Diseño/Agrupar/filtros por niveles, Escape/foco y altura mediana persistente sólo en Tabla QA; captura y esquema QA. | No crea vistas ni amplía sus capacidades. | C | Necesario |
| DB-MENU-03 | Encabezados Título/Texto/Número/Estado: inventario y orden de acciones, restricciones de Título, configuración/cambiar tipo/filtrar/calcular como subniveles; diferenciar esquema compartido y opciones sólo de vista; foco y retorno conservados. | verificado | MENUS: inventarios cuatro tipos en dos Native, acciones/recuperación y esquema frente a vista; capturas/JSON. | Validar acciones destructivas sólo en fuente QA aislada; recuperación existente. | C | Necesario |
| DB-MENU-04 | Selector/configuración de propiedades: búsqueda y nombres/iconos existentes legibles, opciones por tipo; abrir/volver/Escape no pierde nombre ni dispara conversión; cambios explícitos se guardan y valores incompatibles siguen protegidos. | verificado | MENUS: URL/Casilla creadas, Estado/formatos persistidos, nombre cancelado/borrador al volver y409 con originales conservados. | No incorpora tipos o conversiones adicionales. | C | Necesario |
| DB-MENU-05 | Peek: controles superiores en dos grupos, iconos16–18px/botones28px, tooltip y estados deshabilitados; título32px y propiedades con etiquetas/valores alineados; side/center/completa y navegación usan mismo registro/cuerpo. | verificado | MENUS: Peek28px/iconos16/título32; límites de navegación, Side/Center/completa y cuerpo/propiedades del mismo ID. | Fuentes/tamaño/ancho son preferencias de página; no invadir el cuerpo BlockNote. | C | Necesario |
| DB-MENU-06 | Acciones Peek: búsqueda fija, Default/Serif/Mono, grupos de copia/duplicar/mover/papelera, preferencias/diseño/bloqueo, importar/exportar/historial y pie. Sin separadores vacíos al buscar; todos los elementos se alcanzan por scroll; paneles tienen volver sin perder búsqueda/foco. | verificado | MENUS: fuentes/copias/bloqueo/papelera, búsqueda sin grupos vacíos, regreso de paneles; scroll98px con búsqueda fija y pie visible. | Orden de acciones exclusivas de Atlas es adaptación; no simular acciones ausentes de Notion/Atlas. | C | Necesario |
| DB-MENU-07 | Teclado en menús aplicables: Arriba/Abajo/Home/End recorren acciones habilitadas; Enter/Espacio activa, Derecha abre subnivel e Izquierda/Escape vuelve; inputs/selects mantienen edición nativa; cierre restaura foco. Portales propios no cierran Peek. | verificado | MENUS: pruebas de teclado/formulario/IME y CUA: flechas/Home/End/Enter/Espacio/volver/Escape, foco y portales propios. | Comprobar Tabla/configuración/encabezado/selector/Peek; catálogo BlockNote no se modifica. | C | Necesario |
| DB-MENU-08 | Tema de estos controles: Native oscuro/claro con mismos tamaños, agrupación, iconos y foco; superficies/texto/campos heredan tokens también en portales. Comparar con Ámbar y Porcelana, probar cambio reversible sin perder vista, registros ni borrador. | verificado | MENUS: Native oscuro/claro y regresión Ámbar/Porcelana; tokens/contraste, geometría igual, vista y título pendiente conservados. | No cierra resto de módulos de DB-THEME-02/04. Notion claro es adaptación, no observación nueva. | C | Necesario |
| DB-MENU-09 | Matriz final enlaza cada control/acción con resultado, captura/medida y prueba cuando proceda; REA observado, evidencia reutilizada y adaptaciones Atlas separados; no cerrar padres por build o pruebas API solamente. | verificado | MENUS: matriz de aceptación, capturas, JSON medido, pruebas y procedencia REA histórica/CUA actual separadas. | Medidas de Atlas no se atribuyen a CSS de Notion. | C | Necesario |
| DB-CHECK-01 | Verificar físicamente cancelación de resize en curso: Escape/pérdida de captura revierten preview sin escribir; conservar evidencia de resize básico verificado en DB-DASH-03. | implementado sin verificar | FOLLOW conservado. FUNC etapa5 revalida drag completado y teclado, pero no la interrupción después de mover durante la captura activa. | El control nativo disponible ejecuta drag como operación completa; falta producir y observar la cancelación intermedia real. FUNC etapa13 confirma limitación del API nativo actual: drag completo, sin mouseDown/move/up independiente para interrumpir tras preview. No se sustituye por Escape posterior ni eventos sintéticos. Táctil fuera del alcance actual. | C | Mejora futura |
| DB-CHECK-02 | Confirmar descarga guardada desde UI y apertura del PDF de Documento QA descarga V1 accesible desde Cursos; conservar inspección de artefactos de otros formatos en DB-EXP-02 sin atribuirles validación manual. | verificado | EXPORT/ROUND conservados. FUNC etapa4: UI muestra ZIP preparado; evento download volvió a agotar18s.3 ZIP obtenidos del API real del demo e inspeccionados. FUNC etapa13: UI Exportación preparada, nuevo evento download timeout12000ms sin ruta; no hay ZIP Alfa nuevo en Downloads. Causa de la falta de evento no establecida. V1: documento abierto por Cursos→curso→lección, PDF 1 página legible; waitForEvent(download) agota12s. El intento automático no acreditó guardado/apertura. Confirmación manual posterior del usuario (17 de octubre de 2026): descargó y abrió el PDF; contiene ATLAS-CURSO-V1-7319, código, tabla y listas. FUNC: cierre manual V1.  | Cierre limitado al PDF de Cursos comprobado por el usuario. Otros formatos y descargas de registros no tienen verificación manual; se conservan sus pruebas de generación/artefactos y quedan para mejoras futuras. Los timeouts históricos del conector se conservan como evidencia de observación limitada. | C | Necesario |
| DB-CHECK-03 | Revisar portal (+) de propiedades en Native claro/oscuro, foco/teclado y persistencia explícita; conservar contrato de creación DB-PROP-01. | verificado | WS conservado. MENUS: (+) URL QA y Casilla desde Peek, dos Native, búsqueda/End/scroll y recarga. | En esta ronda, sólo UI y comportamiento existente. | C | Necesario |
| DB-CHECK-04 | Recorrer acciones actuales de encabezados Título/Texto/Número/Estado con teclado y dos variantes Native, verificando alcance vista/esquema en fuente QA. | verificado | WS conservado. MENUS: cuatro inventarios por Native, teclado y acciones representativas sobre QA; misma fila/esquema y vista independiente. | No amplía opciones ni conversiones. | C | Necesario |
| DB-CHECK-05 | Revisar añadir propiedad y papelera desde Peek en Native sin pérdida de cuerpo ni valores; mantener evidencia API de DB-PAGE-09. | verificado | WS/PEEK conservados. MENUS: propiedad desde Peek, papelera/restauración del mismo ID con cuerpo y valores protegidos. | Únicamente registros QA recuperables. | C | Necesario |
| DB-CHECK-06 | Completar matriz de portales actuales de BlockNote en Peek: formato, enlace, slash, asa y color; conservar cierre/guardado y drag ya verificados. | verificado | PEEK/NATIVE/FOLLOW: asa/color/slash comprobados parcialmente. FUNC etapa13: selección por teclado→Negrita; portal Crear enlace aplica URL sin cerrar; slash inserta H2; asa abre Color y aplica azul; exterior guarda, reapertura y página completa conservan marcas/enlace/H2/color y valores0/A/B. Color visible en Native oscuro/claro, Ámbar y Porcelana tras corregir defaults CSS. V1 CUA: (+) inserta párrafo, slash H1, asa abre acciones y drag real deja A/C/H1, persistente tras reinicio/recarga/papelera; alineación H1 0,41 px. | Matriz de los cinco portales actuales cerrada; drag físico conserva evidencia NATIVE, no se simula una repetición en esta etapa. Zoom nativo y cobertura global siguen abiertos; sin plugins nuevos ni táctil. | C | Necesario |

| DB-CHECK-07 | Reordenar opciones de Selección/multiselección/Estado y conservar su orden tras recargar sin alterar valores existentes. | verificado | FUNC etapa2: flechas ordenan opciones sin cambiar ID/color/grupo; recarga conserva Hecho/Pendiente/En curso, fila sigue Pendiente. Test API y modelo guardan valores/cuerpo. | Reordenación por controles de teclado/puntero; no incorpora arrastre táctil. | C | Necesario |

## Orden de ejecución y registro de esta ronda

Respaldo histórico del 16 de octubre: `/tmp/atlas-native-round-baseline-hx5_1xtm` (112 archivos y copia del demo). Al retomar el 17 ya no estaba disponible. Respaldo de los 140 archivos locales de esta continuación: `/tmp/atlas-followup-baseline-g6row_q6`. FOLLOW explica la conservación del nuevo demo en disco persistente.

1. **Consolidación terminada antes de implementar:** se revisaron informes/evidencia y código, se preservó el alcance anterior y se reabrieron alineación, catálogos y responsive. No se consideran cerrados por las 370 pruebas históricas.
2. **Implementado y revisado:** medición de primera línea, estabilidad ante scroll y catálogo compartido; inserción, conversión y arrastre físico en copia `record-96d2f869464d404a`. Límites detallados en NATIVE y filas DB-PEEK/EDITOR.
3. **Integrado:** Notion Native oscuro/claro mediante tokens y selector existentes; cambio reversible con Peek y preferencias conservados. Cobertura global y variante clara mantienen límites expresos en DB-THEME.
4. **Validación realizada:** 371 pruebas Python, frontend y build aprobados; geometría, drag, persistencia, portales y anchos390–1200 px. CSS zoom comprobado; zoom nativo sigue pendiente. Los demás requisitos comprometidos no se cierran por estos resultados.

5. **Continuación del 17 de octubre:** resize continuo funcional y probado con puntero/teclado/API/recarga; ajustes responsive y foco integrados. FOLLOW detalla cobertura y límites. Los pendientes de exportación remota, fórmulas, layouts y colaboración siguen comprometidos.

El demo temporal anterior ya no existía al retomar. El nuevo demo validado y conservado está en `local-demo/atlas-database-demo-my0jmtud`, excluido de Git. URL: <http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento>, contraseña `atlas-db-demo`. Reanudar este nuevo almacén, **sin regenerar datos**, con:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --resume-demo local-demo/atlas-database-demo-my0jmtud
```

Activación en el demo: **◐ → Notion Native** (oscuro) o **Notion Native Claro**. El registro QA anterior pertenecía al almacén temporal ausente; no está en el nuevo fixture. Para revisar resize, usar la pestaña **Dashboard → Editar** y los widgets Tabla A/Tabla B. Banco responsive aislado: <http://127.0.0.1:5059/__demo__/responsive>. Resultados completos y límites: NATIVE (histórico) y FOLLOW (continuación). No se hizo commit, push, despliegue ni migración real.

### Cierre de la ronda MENÚS del 17 de octubre

- **Cerrados por su criterio completo:** DB-VIEW-01, DB-PAGE-01, DB-PEEK-03; DB-MENU-01–09 y DB-CHECK-03/04/05.
- **Cerrada sólo la parte de menús:** DB-THEME-02/04 siguen parciales por la cobertura global pendiente. DB-QA-01/02 no se cierran por las pruebas de esta ronda.
- **Siguen abiertos:** DB-CHECK-01/02/06/07 y todas las demás filas pendientes/parciales ajenas a estos menús, incluidos exportación remota, fórmulas, layouts y colaboración. La situación histórica del demo ausente y de conexión REA no se oculta ni se declara resuelta.
- Evidencia y diferencias observadas/adaptadas: **MENUS**. Respaldo externo `/tmp/atlas-menu-baseline-9zmjeela`. Código de catálogo/temas/editor no cambiado; datos originales del demo comparados con el respaldo.
- Revisar esta ronda en <http://127.0.0.1:5059/?open=qa-men%C3%BAs-tabla-y-peek> con `atlas-db-demo`. La página QA añade dos registros ficticios; conserva el tracker y Dashboard anteriores. No incluye trabajo móvil/táctil, nuevas vistas, migración real, commit, push o despliegue.

## Continuación funcional aprobada

La revisión del usuario del 17 de octubre prioriza funcionamiento y conservación.
Las diferencias visuales no urgentes siguen abiertas para revisión final; móvil/táctil,
colaboración e integraciones excluidas no se incorporan. «Avanzado» o «paridad» no
se interpretan como autorización para inventar capacidades.

1. **Conservación/guardado (DB-SAVE-01/03/05):** reproducir lectura de página concurrente con escritura/creación y evitar reescrituras del índice; casilla fallida conserva borrador, registro de pendientes y reintento incluso al cambiar representación. Criterio: valores/cuerpos/IDs intactos con8 escritores locales/24 registros/5 ciclos y prueba real de error/reintento en QA. DB-SAVE-05 seguirá parcial fuera de ese volumen medido.
2. **Propiedades (DB-CHECK-07, DB-PROP-02):** ordenar opciones existentes sin variar IDs/valores; resolver fallos concretos de editores/formatos admitidos. No inferir un lenguaje nuevo de fórmulas ni usuarios adicionales.
3. **Tabla/vistas compartidas (DB-TABLE-01/03, DB-VIEW-04):** orden de columnas por vista con persistencia y teclado/arrastre; corregir discrepancias demostrables de filtros y agrupación. No añadir vistas ni selección avanzada sin contrato concreto.
4. **Exportación (DB-EXP-05/07, DB-CHECK-02):** recursos solicitados con límites/errores explícitos, mismos filtros/orden/visibilidad; comprobar artefactos reales y descarga cuando el conector permita observarla. La interpretación de Default de Notion no se inventa.
5. **Dashboard (DB-CHECK-01 y contratos DB-DASH):** estabilizar guardado de distribución/configuración y cancelación; conservar fuentes y registros. No ampliar a widgets libres o dashboards anidados por una etiqueta de paridad.

Respaldo inicial de161 archivos locales y demo13 IDs: `/tmp/atlas-functional-baseline-0jn06yma`.
Estado inicial: la prueba nueva de lectura concurrente reprodujo pérdida de una fila recién creada;
DB-SAVE-01/03 se reabren sólo para las rutas defectuosas, conservando su evidencia previa.

**Etapa funcional1 validada:** DB-SAVE-01/03 cerrados tras corrección y pruebas descritas en FUNC. DB-SAVE-05 permanece parcial por el ensayo prolongado pendiente. Continúa propiedades (DB-CHECK-07 y fallos concretos de DB-PROP-02).

**Etapa funcional2 validada:** DB-CHECK-07 cerrado; DB-PROP-02 continúa parcial por rangos/formatos aún no definidos.13 pruebas workspace y pruebas de números/fecha/opciones; revisión CUA de orden, rechazo de1e, decimal y hora con zona. Continúa tabla y representaciones compartidas.

**Etapa funcional3 validada:** DB-TABLE-03 cerrado; DB-TABLE-01/DB-VIEW-04/DB-VIS-02 conservan sus pendientes explícitos.25 pruebas API/export y suite frontend aprobadas; arrastre real de columnas/tarjetas, teclado y edición compartida comprobados. Continúa exportación.

**Etapa funcional4 validada:** DB-EXP-05 cerrado con inclusión remota pública real y errores explícitos. DB-EXP-07 continúa parcial por semántica Default/cotejo Unicode; DB-CHECK-02 sin verificar por ruta de descarga no observable. Continúa Dashboard (guardado, recuperación y cancelación).

**Etapa funcional5 validada:** DB-DASH-02/03/04/05 mantienen sus criterios verificados con regresiones corregidas y nueva evidencia FUNC; DB-SAVE-03 incorpora recuperación de configuración. DB-CHECK-01 sigue sin verificar porque no se ejecutó la cancelación física durante preview. DB-DASH-06/07 y DB-VIS-08 permanecen parciales; no se declaran completos todos los widgets/layouts ni se amplía a móvil.

**Continuidad tras FUNC:** siguiente etapa aprobada: operadores de filtros por tipo y agrupación de DB-VIEW-04, con regresiones sobre datos compartidos y artefactos (DB-EXP-07). Resolver primero discrepancias demostrables; semántica Default de Notion necesita evidencia concreta. Mantener explícitos DB-CHECK-01/02/06, carga prolongada DB-SAVE-05 y pendientes propios de propiedades/vistas/layouts. No derivar widgets libres, lenguaje completo de fórmulas o selección matricial de una etiqueta avanzada; requieren contrato concreto, no son funciones terminadas ni exclusiones nuevas. El pulido visual queda para revisión final.

**Etapa funcional6 validada:** DB-VIEW-04/DB-EXP-07 siguen parciales por sus criterios restantes, pero cierran la discrepancia concreta entre operadores tipados, día de fecha con hora y exportador. No se introducen operadores nuevos: se corrige la semántica de los ya existentes y su selector por tipo. Se preservan operadores/valores heredados para edición explícita.17 casos de referencia compartidos, suite final390 y build1134 aprobados. La condición Fecha Es18/10 mostró sólo A tras recargar; Board conservó ambos IDs; la condición de prueba se retiró al terminar. Continúa comprobación de las partes abiertas de agrupación/multiselección de DB-VIEW-04/DB-VIS-02 y recuperación de referencias de DB-PROP-07; gramática nueva, fórmulas y layouts necesitan concretar sus criterios antes de extenderlos. DB-CHECK-01/02 no se cierran por ausencia de interacción/ruta observable.


## Continuación de agrupación y referencias (misma rama)

Respaldo previo: `/tmp/atlas-groups-baseline-6pknd2u1`;180 archivos locales y
snapshot del demo existente. Se conservan todos los IDs de seguimiento.

- DB-VIEW-04/DB-VIS-02: mover una etiqueta conserva las demás y usa el estado
  vigente del servidor; arrastres entre fuentes/propiedades no se aplican. Ambos
  botones de crear en carril asignan el valor correcto. Orden manual y grupos
  colapsados pertenecen a la vista/widget; persistir sin alterar IDs/cuerpos ni
  orden de las otras vistas. Una ordenación explícita por propiedad tiene precedencia
  sobre el manual. No se declara fidelidad visual completa al resolver esta parte.
- DB-PROP-07/08: identificar destinos ausentes, en papelera o de otra fuente;
  conservar IDs antiguos al editar otros enlaces, permitir retirada explícita o
  restauración recuperable; rollups no cuentan registros de papelera ni ocultan
  referencias inválidas como un resultado completo. Relación inversa automática
  sigue abierta y no se implementa sin resolver su contrato de esquema/recuperación.
- Continuar después con fallos funcionales concretos de propiedades/vistas,
  manteniendo visuales no urgentes, móvil/táctil y colaboración fuera de esta ronda.

**Etapa funcional7 validada:** DB-VIEW-04/DB-VIS-02 avanzan parcialmente; no se cierran gramática ni fidelidad visual.16 pruebas API workspace, modelo Board y build1135; CUA verificó orden físico/teclado, colapso y recarga, pertenencia B conservada al mover A→C y creación con C al pie del carril. Continúa DB-PROP-07/08 (diagnóstico, recuperación y rollups).

**Etapa funcional8 validada:** DB-PROP-07 avanza parcialmente (gestión de referencias), DB-PROP-08 vuelve a verificarse tras corregir papelera.19 pruebas dirigidas, build1136 y CUA de referencia en papelera→añadir Y conservando X→restaurar X→suma18 y recarga; cuerpos intactos. Continúa exportación de diagnósticos para que un cálculo incompleto no parezca vacío válido.

**Etapa funcional9 validada:** exportación de diagnósticos en DB-EXP-02 verificada mediante artefactos de los cuatro formatos, incluido texto extraído del PDF y valores originales JSON.24 pruebas relaciones/export aprobadas. DB-SAVE-05 avanza por lectura de esquemas85→2, sigue parcial por volumen prolongado frontend. Continúa la interacción de arrastre de fecha en Calendario DB-VIS-05, conservando hora/zona y demás propiedades.

**Etapa funcional10 validada:** DB-VIS-05 avanza parcialmente con drag entre días, sin cerrar intervalos/semana.21 pruebas dirigidas workspace/relaciones,401 pruebas Python completas/48 avisos, frontend completo y build1136 aprobados. CUA muestra20/10/2026 conservando01:11:00+03:00 y cuerpo en Peek; recarga mantiene fecha y relaciones. Continúa funcionalidad de Galería DB-VIS-03 (propiedad de portada y recorte) y Lista DB-VIS-04 (configuración pertinente), sin ampliar a vistas nuevas. Relación inversa, rangos/gramática/layouts conservan sus dependencias; no se convierten en exclusiones ni se declaran resueltos.

**Cierre de esta continuación:** no se da por cerrado ningún ID padre parcial por resolver sólo una parte. DB-PROP-08 y DB-EXP-02 mantienen verificación tras corregir sus regresiones. DB-VIEW-04, DB-VIS-02, DB-PROP-07, DB-VIS-05 y DB-SAVE-05 siguen parciales por los criterios aún abiertos de sus filas. DB-CHECK-01/02/06, los pendientes visuales y las exclusiones vigentes permanecen.

**Etapa funcional11 validada:** DB-VIS-03/04 cierran sus criterios funcionales. Galería selecciona una propiedad de archivos y cambia realmente recorte/imagen completa, conserva preview de contenido y abre el mismo cuerpo en Peek. Lista configura densidad/distribución; CUA midió mínimos30/48px sin comprimir el contenido complejo, editó Nota Dos y verificó el cambio en Galería y tras recarga. Componentes compartidos con widgets; npm test completo y build1138 módulos/9.47s aprobados. Capturas y límites en FUNC. No se cierran IDs globales de visuales, temas ni vistas distintas.

**Estado al entregar:** cerrados en esta continuación DB-VIS-03/04; revalidados DB-PROP-08/DB-EXP-02 tras corregir regresiones. Avanzaron sin cerrarse DB-VIEW-04/DB-VIS-02 (gramática/agrupación restante y visuales), DB-PROP-07 (relación inversa), DB-VIS-05 (intervalos/semana) y DB-SAVE-05 (carga prolongada). Siguen los demás pendientes anteriores. La siguiente dependencia funcional es concretar/validar rangos temporales y filtros relativos sin alterar valores heredados; no se presume un contrato nuevo de fórmulas, layouts o colaboración. No migración real/commit/push/despliegue.

## Continuación de criterios restantes

Respaldo externo antes de editar: `/tmp/atlas-remaining-baseline-6jrtgdm2`,194
archivos locales y25 entradas del demo. Sin cambio de rama ni reseed.

Primero DB-VIEW-04: grupos AND/OR recursivos editables desde el mismo componente
en vista/widget, conservación de filtros planos y heredados; misma selección
por frontend/exportador con casos de referencia compartidos. Fechas relativas
con calendario y zona horaria explícitos, semana lunes–domingo y límites
inclusivos, sin reescribir valores. Límites8 niveles/100 condiciones por vista
con rechazo visible, no truncado. DB-VIEW-04 no cierra por esta subetapa si
queda otro criterio funcional o de agrupación sin validar.

Después, según esa validación, continuar comprobaciones funcionales abiertas
de Dashboard/exportación antes de abrir nuevas representaciones. Relación
inversa depende de contrato de esquema/recuperación y no se simula con backlinks;
formatos/rangos, fórmulas y layouts mantienen sus dependencias explícitas.

**Etapa funcional12 validada:** DB-VIEW-04 cerrado por su contrato funcional: filtros
anidados/relativos, orden múltiple y agrupación con preservación validada en etapas
anteriores.38 casos compartidos (17 previos+11 árboles/zonas+10 períodos),39 pruebas
API/export, npm test y build1139/10.43s. CUA crea grupo OR y AND externo, añade Hoy,
recarga y conserva sólo Alfa; Board mantiene los tres IDs y widget su filtro propio.
DB-VIS-02 continúa parcial exclusivamente por su comparación visual ya registrada.
DB-EXP-07 avanza en coincidencia de selección; Default/Unicode siguen abiertos.
Continúa DB-CHECK-01/02: cancelación física de resize y archivo descargado por el
navegador, sin sustituir sus criterios por pruebas de API o pulsar Escape en reposo.

**Etapa funcional13 validada con bloqueos separados:** DB-CHECK-06 cerrado tras
recorrido real de formato/enlace/slash/asa/color, guardado, reapertura y página
completa. Se corrigió la regla CSS que ocultaba color de encabezados elegido
explícitamente; defaults de cada tema conservados. Comparación Native oscuro/claro,
Ámbar y Porcelana aprobada. No modifica catálogo, medidas del editor ni registro
de temas. DB-THEME/DB-QA globales siguen parciales.

- DB-CHECK-01: sin verificar por ausencia de control de puntero dividido en la
  herramienta actual; no es prueba de fallo del producto ni cancelación acreditada.
- DB-CHECK-02: nuevo intento UI devuelve preparado, evento download agotado12s;
  ruta no observada. Se mantiene implementado sin verificar.
- DB-PAGE-06: permiso de archivos de extensión bloquea setFiles; no se importó
  ni se declara completo. La prueba preparada incluye una DB con identidad
  repetida para comprobar renovación cuando esté disponible el permiso.

Conservación final:25 entradas originales con metadata/Markdown/historial exactos,
194 archivos iniciales presentes y110 IDs del plan conservados.5 IDs nuevos QA
(página+3 filas+1 fila de otra DB), total30. No migración real/commit/push/despliegue.
Siguiente dependencia funcional abierta: DB-PROP-02 (contrato de rangos temporales)
antes de intervalos de Calendario/Timeline; DB-PROP-07 requiere resolver esquema y
recuperación de relación inversa entre fuentes. Los bloqueos de herramienta no
cierran ni suspenden los demás compromisos funcionales del plan.

**Etapa funcional14 en curso — DB-PROP-02/DB-VIS-05:** valor de fecha conserva
string ISO heredado; rango activado explícitamente usa `{start,end}` ISO, sin
convertir el resto de filas. Fin anterior y zonas horarias incompatibles se
rechazan conservando borrador; retirar un fin distinto requiere confirmación
local y guardar. Mostrar ambos extremos en Tabla/Peek/exportación, JSON conserva
objeto; filtros y orden de fecha usan inicio (adaptación explícita de Atlas).
Calendario representa cada día del intervalo inclusivo con el mismo ID y añade
modo Semana dentro de la misma vista; Timeline reutiliza intervalo si no tiene
columna final separada. Drag define el nuevo día de inicio, desplaza ambos
extremos conservando duración de calendario, horas/zonas y último valor del
servidor. Validar API, conversiones, exportación, UI, recarga y aislamiento antes
de cerrar criterios; no asumir equivalencia no observada de Notion.

**Etapa funcional14 validada:** DB-PROP-02/DB-VIS-05 cerrados para el contrato
concreto anterior, incluidos formatos local/ISO/largo y12/24h.44 pruebas dirigidas
y regresión408 Python/55 avisos; npm test completo y build1139/9.20s. CUA editó
fecha/hora con teclas nativas (fill no actualizó React), confirmó conservación
al retirar fin, validó error recuperable, arrastre real, Semana/recarga, Timeline
y formato ISO/12h compartido en Board/Peek.42 casos JS/Python incluyen filtros
por inicio y no alteran ordenación de Lugar. MD/CSV,HTML,PDF,JSON conservan ambos
extremos; no se migra ninguna fecha simple ni se amplía alcance exportado.

DB-VIS-06 avanzó parcialmente por intervalos compartidos; no cierra movimientos/
resize/zoom/dependencias de barras. DB-CHECK-01/02 y DB-PAGE-06 mantienen bloqueos
externos ya registrados. Persisten relación inversa, fórmulas, layouts, carga
prolongada, fuentes enlazadas y demás criterios funcionales previos; los visuales
no urgentes siguen reservados a revisión final. Próxima dependencia de vistas
ya iniciadas: interacción temporal de Timeline, reutilizando esta representación
y protecciones transaccionales. Sin ampliación móvil/táctil/colaboración/integraciones.

### Cierre de primera entrega V1 — confirmación manual (17 de octubre de 2026)

El usuario confirmó la descarga y apertura del PDF de Documento QA descarga V1,
accesible desde Cursos. El archivo contiene ATLAS-CURSO-V1-7319, el código, la
tabla y las listas. DB-CHECK-02 queda **verificado sólo para ese caso PDF**;
no se extiende la comprobación manual a Markdown, HTML, JSON, ZIP ni a otros
flujos. Los informes históricos de timeout conservan su evidencia y quedan
superados para este caso por la confirmación manual.

La entrega acotada de Tabla, Peek y exportación de documentos queda concluida.
Las mejoras futuras y decisiones pendientes conservan sus IDs, estados y evidencia;
no se marcan terminadas ni se reanudan por este cierre. Sin migración real,
commit, push ni despliegue.
