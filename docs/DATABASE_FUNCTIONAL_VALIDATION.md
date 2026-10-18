> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Validación funcional de bases de datos

17 de octubre de 2026. Estados y orden sólo en [DATABASE_PLAN.md](DATABASE_PLAN.md).
Respaldo: `/tmp/atlas-functional-baseline-0jn06yma`,161 archivos locales y demo13 IDs.
Se reanudó el mismo demo5059, sin regenerarlo. Notion no modificado. Sin commit/push/despliegue.

## Etapa1: conservación y guardado

Una prueba nueva reprodujo pérdida de una fila creada durante la lectura de otra
página. `get_entry` actualizaba última visita mediante `save_index(index)` sobre
una copia antigua. Ahora actualiza sólo última visita del registro vigente en
SQLite bajo transacción, sin borrar/reinsertar el índice ni resucitar eliminados.
La regresión falla antes de la corrección y pasa después.

`Cell` registra inmediatamente las escrituras de casilla, guarda su borrador en
sesión y conserva el registro de pendientes si se desmonta con un fallo. La UI
muestra el valor pendiente y Reintentar; el cambio de vista espera el guardado.
No se sustituyen el editor completo, el catálogo, los temas o las identidades.

Validación:12 pruebas workspace, incluyendo8 escritores locales/24 filas/5 ciclos
(120 cambios numéricos,120 de cuerpo y120 lecturas), preservando IDs, otros valores,
cuerpo final y aislamiento B. Es concurrencia técnica del mismo propietario,
no implementación de colaboración. Build aprobado.

CUA operó sólo la nueva página QA estabilidad funcional, fuente
`db_e09e83da16454280a5ae8d0c798f32c8`, registro `record-f7d7a5cc131e47e5`.
Tras cargarlo desbloqueado, el API de prueba lo bloqueó: clic Hecho devolvió423.
La casilla mantuvo Sí como borrador y Reintentar; pulsar Board conservó Tabla y
mostró el fallo. Al desbloquear y reintentar guardó Sí; Board y recarga conservaron
el mismo ID, Nota conservada y número0. Captura del fallo conservado (`atlas-functional-checkbox-recovery.png`, evidencia/herramienta local no publicada).
El bloqueo se retiró. Los registros previos no se usaron para esta prueba.

DB-SAVE-01/03 verificados por estas correcciones y evidencia previa conservada.
DB-SAVE-05 sigue parcial: no se extrapola este ensayo a volumen ilimitado,
concurrencia prolongada en navegador ni atomicidad de todos los endpoints antiguos.
Continúa etapa2 de propiedades.

## Etapa2: propiedades

DB-CHECK-07 verificado: subir/bajar opciones conserva su objeto completo (ID,
color, grupo y etiqueta original para renombrados). La configuración guarda el
orden y evita reescribir las filas cuando no hay renombrados. El API rechaza
renombrados hacia opciones inexistentes. Modelo/API y CUA verifican el orden
Hecho/Pendiente/En curso tras recarga; el registro sigue Pendiente con Nota
conservada. Captura (`atlas-functional-option-order.png`, evidencia/herramienta local no publicada).

Número conserva texto inválido para corregirlo:1e no se envía como NaN/null ni
borra0. La UI muestra error y conserva el editor;8,5 se guarda como8.5 y persiste.
Fecha separa día/hora, admite hora opcional y conserva el sufijo horario original.
La prueba pasó00:10:05+03:00 a01:10:05+03:00 sin cambiar18/10/2026; la tabla lo
muestra y la recarga conserva el valor. No se inventa una zona para fechas locales.
Se corrigió además la navegación compartida: Flecha abajo de date/time/number no
salta al menú, conserva la edición nativa. El llenado programático de controles
nativos del conector no siempre emite change; la comprobación utilizó también
teclas reales y verificó los valores controlados antes de guardar.

13 pruebas workspace aprobadas y pruebas nuevas de números, fechas y opciones;
build1131 módulos aprobado. DB-PROP-02 sigue parcial: no se añaden rangos ni
formatos definidos sólo como «avanzados». Son pendientes, no funciones simuladas.
No hizo falta nueva observación de Notion: son correcciones de conservación y
capacidades ISO ya admitidas por Atlas. Continúa etapa3 de tabla/vistas compartidas.

## Etapa3: tabla y representaciones compartidas

`columnOrder` se guarda en cada vista. Un único resolvedor ordena propiedades en
Tabla, Board/Galería/Lista, widgets y exportadores, ignorando IDs archivados o
repetidos y añadiendo propiedades nuevas. El esquema compartido no se reordena.
Hay arrastre de encabezados y controles equivalentes de teclado; Título sigue
primero. Se conserva el ancho/ajuste/congelación/cálculo por ID. El arrastre no
se acepta entre fuentes ni entre vistas distintas.

CUA: mover Número a izquierda y arrastrar físicamente Nota antes de Hecho produjo
Nombre/Nota/Hecho/Número/Estado/Fecha, conservado al recargar. Board mantuvo su
orden. Flecha derecha de Nombre enfocó Nota y abajo la Nota del registro B;
Enter permitió editarla. Galería, Lista y recarga mostraron Nota B actualizada.
Captura de tabla (`atlas-functional-column-order.png`, evidencia/herramienta local no publicada).

Un fallo real de Board trataba cualquier etiqueta que comenzaba con Sin como
valor vacío. Ahora el grupo vacío usa una etiqueta sin colisión con valores reales,
y multiselección no repite una tarjeta por valores duplicados heredados. Se
probaron arrastres físicos a Sin Estado especial y Sin Estado: ambos persistieron
como opciones literales; B vacío permaneció en (Sin Estado).
Captura Board (`atlas-functional-board-groups.png`, evidencia/herramienta local no publicada).

25 pruebas workspace/export aprobadas y suite frontend completa. Un test antiguo
comparaba también last_viewed_at entre lecturas y fallaba al cruzar un segundo;
ahora excluye sólo ese campo volátil, manteniendo la comparación de todos los
valores/cuerpo/presentación. DB-TABLE-03 verificado. DB-TABLE-01, DB-VIEW-04 y
DB-VIS-02 siguen parciales por los pendientes identificados en el plan; no se
incorporan selección avanzada, nuevas vistas ni otras capacidades indeterminadas.
Continúa exportación de recursos y consistencia de sus proyecciones.

## Etapa4: exportación

DB-EXP-05: descarga pública HTTP(S) real, DNS/IP validados en cada salto y socket
fijado a esa IP; TLS valida certificado/hostname y no reenvía cookies/credenciales.
Se bloquean destinos privados, puertos no estándar y degradación HTTPS. Límites:
20 intentos,20s acumulados,5s por recurso,20MB por recurso y50MB por ZIP. Fallos
quedan con URL/motivo en manifest.json; el diálogo explica corrección y reintento.
La red opera fuera del LOCK del índice: prueba con escritor paralelo confirma
que el ZIP usa su snapshot y el cambio posterior se guarda sin esperar la red.

23 pruebas export/remote aprobadas. Ensayo de red real sobre imagen pública de
httpbin:8090 bytes,image/png,firma PNG válida.3 ZIP del API del mismo demo fueron
abiertos y contrastados: Current conserva Detalle/Valor y sólo Hijo visible;
Default incluye ambos hijos,carpetas y cuerpos cuando se elige subpáginas;
no_files no contiene PNG ni su enlace. PNG del ZIP idéntico al descargado, SHA256
541a1ef5373be3dc49fc542fd9a65177b664aec01c8d8608f99e6ec95577d8c1.
El registro padre de la DB y sus hermanos no entran en el paquete. Artefactos:
`/tmp/atlas-functional-export-{current,default,exclude}.zip`.

CUA pulsó Exportar y observó estado preparado; el evento download agotó18s sin
devolver ruta. Intentar la página interna de descargas fue bloqueado por política
del navegador; no se usó otro mecanismo para eludirla. DB-CHECK-02 permanece
implementado sin verificar. La inspección del ZIP vía API no se presenta como
prueba de guardado del navegador. DB-EXP-07 sigue parcial: Default=primera vista
es adaptación declarada y el cotejo Unicode español aún puede diferir.
No se necesitó nueva evidencia Notion/REA para estos contratos de Atlas.

## Etapa5: Dashboard

Se reprodujo un fallo real: con el servidor del demo detenido, renombrar widget
fallaba; cambiar a Tabla era posible y recargar con el servidor disponible
restauraba el nombre anterior, perdiendo la configuración intentada. El ensayo
operó sólo el servidor propio y las fuentes nuevas QA; se reanudó el mismo
almacén, sin volver a sembrar datos.

`dashboardWriter` conserva la última configuración, serializa escrituras, impide
que una respuesta vieja sustituya el borrador y lo respalda en sessionStorage por
fuente/vista. Dashboard participa en el registro de pendientes de navegación y
antes de descargar página; sólo retira el borrador tras confirmar la última
escritura. Pruebas ejercitan fallo, cola, respuesta anterior, refresh, recuperación
de sesión y reintento. Las mutaciones de esquema vacían las celdas sin esperar
recursivamente su propia configuración; el flush de Peek propaga esa opción.

CUA repitió desconexión: Widget conservado sin conexión permaneció en Dashboard
al intentar Tabla, con error y Reintentar. Después de reanudar, Reintentar guardó;
cambiar Tabla/Dashboard y recargar conservó el nombre.
Error conservado (`atlas-functional-dashboard-recovery.png`, evidencia/herramienta local no publicada).

La flecha del tirador y un drag físico cambiaron tamaño; el drag terminó en445px
de alto, después el campo dejó47.3% de ancho. Una segunda fuente canónica se
configuró como Galería, sin copiar filas. Filtro global mayor que2 con Número de
la primera fuente y Valor de la segunda dejó1 registro en cada widget tras
recargar. Hijo visible abrió su Peek; Detalle pasó a Visible confirmado y
apareció en el widget al cerrar y recargar. Se conservaron IDs y los18 registros
del demo (13 anteriores y5 creados para QA).
Dashboard persistido (`atlas-functional-dashboard-persisted.png`, evidencia/herramienta local no publicada).

DB-DASH-02/03/04/05 mantienen verificación con esta evidencia adicional;
DB-CHECK-01 sigue sin verificar: el drag nativo es una operación completa y no
se produjo una cancelación después de mover mientras la captura seguía activa.
No se usa Escape posterior como sustituto. Widgets libres/anidados y cobertura
responsive de todos los diseños siguen abiertos, sin añadir móvil/táctil.

## Verificación tras etapas1–5 y conservación

- Suite Python:389 aprobadas,41 avisos de datetime/WeasyPrint,9.79s. El primer
  intento en sandbox falló en3 pruebas de sockets locales; reintento autorizado
  completo aprobado, sin cambiar esas pruebas para ocultar el fallo ambiental.
- Frontend:npm test completo aprobado, incluidos catálogo, temas, menús, identidad,
  orden, grupos, números/fechas y cola Dashboard. Build:1132 módulos,8.05s.
- py_compile de app/API/export/remote y node --check de app.js aprobados.
- Se añadió además una regresión de URL multimedia malformada: se enumera como
  remote_url_invalid sin impedir exportar el resto del contenido.25 pruebas
  export/remote aprobadas; no hay tráfico de red en sus mocks.
-161 archivos locales iniciales presentes; cambios de esta ronda limitados a las
  rutas descritas y compilados. Catálogo, main del editor, hit testing/alineación
  y registro/hojas de temas conservados.
-13 IDs del demo inicial: metadatos, archivos Markdown e historial idénticos al
  respaldo externo.5 IDs QA nuevos, total18; no se alteraron registros previos.
- Los110 IDs del plan inicial siguen presentes y sin duplicados. La evidencia
  previa se conserva; no se cierran visuales ni el conjunto DB por estos tests.
- Sin llamadas nuevas REA: se reutilizó evidencia guardada. CUA validó Atlas,
  no Notion. No se visitó ni modificó Notion. Sin migración real/commit/push/deploy.

Demo: http://127.0.0.1:5059/?open=qa-estabilidad-funcional, clave atlas-db-demo.
Tabla/Board/Galería/Lista conservan los mismos dos registros de prueba; Dashboard
tiene dos widgets canónicos y filtro explícito. En A, Exportar… contiene una DB
anidada con vista Filtrada/Todos y una imagen pública; la DB padre queda fuera.
El proceso reanuda local-demo/atlas-database-demo-my0jmtud. El entorno Python y
los ZIP de inspección están en /tmp; no equivalen a una instalación desplegada.

## Etapa6: filtros tipados y correspondencia con exportación

Se corrigió la discrepancia de Fecha Es con valores que contienen hora/zona: el
día elegido compara el día almacenado, sin convertirlo a la zona del visor. Antes
y Después reutilizan lt/gt ya existentes. Es una semántica de Atlas documentada,
no una observación nueva atribuida a Notion. Los operadores numéricos rechazan
vacío/Infinity/hexadecimal y comparan números equivalentes (8.50=8.5). Casilla
utiliza selector Sí/No y opciones utilizan su catálogo. Contiene de listas
tipadas comprueba pertenencia exacta (A no coincide con AB).

Tabla, configuración de widgets y filtros globales comparten catálogo de
operadores y campo de valor por tipo. Los operadores antiguos incompatibles se
muestran como Operador guardado y no se sustituyen al abrir; los valores retirados
del catálogo y fechas ISO completas heredadas siguen visibles para corrección
explícita. Cambiar deliberadamente la propiedad reinicia su operador/valor.

El exportador aplica los mismos casos:17 escenarios comunes JS/Python cubren
fecha con zona, vacío, antes/después, números finitos/equivalentes, False y
etiquetas exactas. La gramática sigue siendo AND/OR plano; no se añaden reglas
anidadas ni fechas relativas por una etiqueta genérica. Cotejo Unicode/Default
siguen abiertos en DB-EXP-07.

CUA eligió Fecha Es2026-10-18: A conserva2026-10-18T01:10:05+03:00 y coincide; B
con fecha vacía se excluye. Recargar conservó la condición y una sola fila; Board
siguió mostrando ambos registros. Se capturó el estado y después se retiró la
condición, dejando otra vez las dos filas visibles en Tabla.
Condición persistida (`atlas-functional-date-filter.png`, evidencia/herramienta local no publicada).

Validación final:390 pruebas Python aprobadas,41 avisos previos,12.25s; npm test
completo aprobado; build1134 módulos,10.58s. Sin modificaciones de catálogo, temas
o datos anteriores del demo. DB-VIEW-04 y DB-EXP-07 conservan estado parcial.

## Etapa7: agrupación y multiselección

Respaldo de esta continuación: `/tmp/atlas-groups-baseline-6pknd2u1`,180 archivos
y18 IDs previos. Nueva página QA grupos y referencias con dos fuentes distintas;
no se modificó la página QA anterior ni sus registros.

Board envía origen/destino tipados e identidad fuente/propiedad. El servidor aplica
el movimiento sobre las etiquetas actuales bajo la transacción de la fila;
retiene las demás, rechaza origen obsoleto409, fuente equivocada404, grupo no
definido400 y registros bloqueados423. Un arrastre al grupo vacío no elimina
implícitamente otras etiquetas: devuelve error y requiere retirada explícita.
Es adaptación conservadora de Atlas, no semántica Notion comprobada.

Orden manual por carril y colapso viven en la vista/widget. IDs estables de
opciones mantienen esa configuración al renombrar. Una ordenación de propiedad
tiene prioridad y se informa; columnas/tarjetas no modifican el orden canónico.
Ambos botones de crear en grupo usan el mismo valor tipado, incluido0/False/listas.

16 pruebas API workspace y pruebas Board aprobadas. CUA: flecha dejó Dos/Uno en A,
B colapsado persistió tras recarga. Primer drag real detectó un acceso tardío a
event.currentTarget ya nulo; se corrigió capturando geometría antes del await,
y el segundo drag real dejó Uno/Dos. Mover Uno de A a C conservó B/C en Tabla
y recarga, sin duplicar ID. Crear al pie C abrió Peek con Etiquetas C y se llamó
QA creado en C. Captura (`atlas-groups-multiselect.png`, evidencia/herramienta local no publicada).

REA real: list_browser_targets devolvió el objetivo Notion correcto;
inspect_web_page devolvió1119 nodos DOM/804 AX, incluidos Género,Fantasía,Acción
y la fila de prueba con dos géneros. Extracto y Evidence IDs en
NOTION_REA_GROUPS_EVIDENCE.json (`NOTION_REA_GROUPS_EVIDENCE.json`, evidencia/herramienta local no publicada). Captura pasiva,
sin navegación, clicks ni escritura. No demuestra efectos de arrastre ni colapso
en Notion; N08/N18 siguen siendo la referencia histórica correspondiente.
DB-VIEW-04/DB-VIS-02 siguen parciales con su evidencia preservada.

## Etapa8: referencias rotas y rollups

Relación proyecta IDs originales, títulos válidos y diagnóstico por ID: missing,
deleted,wrong_source,source_missing. No se borran enlaces al consultar. Se pueden
retirar explícitamente desde el selector; los destinos en papelera permiten
restauración recuperable por su endpoint existente. Añadir un enlace válido no
obliga a eliminar uno roto; se rechazan IDs nuevos inválidos. Las opciones de
multiselección retiradas también se conservan al añadir otra opción y pueden
quitarse expresamente; no se pueden introducir de nuevo desde otra fila.

Rollup no cuenta papelera y no entrega una suma parcial como si fuera completa:
una referencia inválida produce calculation_error hasta resolverla. Restaurar
recupera el cálculo sin cambiar IDs/cuerpo. El selector de base de destino usa
identidad compuesta padre/fuente para no confundir fuentes de distintas páginas.
La relación inversa automática continúa pendiente; no se simula un backlink.

19 pruebas dirigidas aprobadas. CUA sobre nueva QA: Destino X se envió a papelera
recuperable; se mostró aviso En papelera y error del rollup. Se añadió Destino Y
conservando X; el botón Restaurar Destino X recuperó el mismo ID y produjo18.
Cerrar y recargar mantuvo ambos enlaces y la suma.
Selector de recuperación (`atlas-relations-recovery.png`, evidencia/herramienta local no publicada). Los18 IDs previos no
participaron en el ensayo. No se modificó Notion. DB-PROP-07 sigue parcial por
relación inversa; DB-PROP-08 se revalida con estos límites explícitos.

## Etapa9: diagnósticos exportados y lectura acotada

MD/CSV,HTML,PDF yJSON no presentan un cálculo fallido como campo vacío válido.
Incluyen Error de cálculo y motivo de referencia no disponible; manifest.json
guarda property_issues por registro/propiedad. La cabecera del API y el diálogo
cuentan propiedades diagnosticadas aparte de archivos omitidos. JSON conserva
IDs originales. No se siguen relaciones ni se exporta la DB padre por esta mejora.

24 pruebas relaciones/export aprobadas; se abrieron los ZIP y extrajo texto del
PDF, comprobando En papelera, Error de cálculo y cuerpo protegido. No es una
prueba nueva del guardado del archivo desde el navegador (DB-CHECK-02 sigue abierto).

Medición concreta:21 filas con relación y2 rollups releían85 veces el mismo
Markdown de esquema. Una caché del esquema limitada a la petición lo reduce a2
lecturas. Las siguientes peticiones vuelven a comprobar la disponibilidad y los
valores actuales; las pruebas de papelera/restauración/cambio de destino siguen
aprobadas. No es caché global ni acreditación de carga frontend prolongada.

## Etapa10: Calendario y comprobación final

Calendario usa los mismos registros y permite arrastrar entre días, o desde Sin
fecha. El API date_move valida fuente, propiedad editable, bloqueo y día original;
lee la fecha actual y sustituye sólo el día, conservando la última hora/zona.
Un movimiento obsoleto devuelve409, no una sobrescritura silenciosa. Las fechas
automáticas de creación/edición son de sólo lectura. La edición por Peek sigue
siendo la alternativa de teclado; no se implementa interacción táctil.

CUA: QA Uno18/10/2026 se arrastró físicamente al20. Tabla mostró
2026-10-20T01:11:00+03:00; el Peek conservó Cuerpo Uno. Volver a Calendario y
recargar mantuvo20/10. Board conservó B/C, Destino X/Y y suma18.
Calendario (`atlas-calendar-preserved-time.png`, evidencia/herramienta local no publicada),
estado final (`atlas-groups-relations-final.png`, evidencia/herramienta local no publicada). DB-VIS-05 sigue parcial por
intervalos/semana, no por el arrastre ya probado.

Validación de la continuación:401 pruebas Python aprobadas,48 avisos previos de
datetime/WeasyPrint en13.61s; npm test completo aprobado, incluido Board; build
1136 módulos en11.62s. py_compile y revisión de sintaxis JS aprobadas. La prueba
dirigida de lecturas imprime2 para21 filas (antes85). Los diagnósticos de export
se comprobaron abriendo artefactos automatizados, no mediante descarga de browser.

Conservación: respaldo de180 archivos en `/tmp/atlas-groups-baseline-6pknd2u1`.
Las18 entradas iniciales conservan exactamente metadatos, Markdown e historial;
7 IDs nuevos pertenecen sólo a QA (página,dos destinos,cuatro registros). Total25.
Los110 IDs del plan siguen presentes. Catálogo de bloques y todos los temas
conservados. Sin migración real/commit/push/despliegue ni escritura en Notion.

Demo: http://127.0.0.1:5059/?open=qa-grupos-y-referencias, clave atlas-db-demo.
Board muestra QA Uno en B y C porque tiene dos etiquetas: es el mismo ID, no
una fila duplicada. Tabla muestra cuatro registros únicos; Destinos sigue aislada.
Los controles de orden manual aparecen al pasar el cursor o enfocar una tarjeta.
El demo anterior y sus datos se mantienen accesibles desde su página original.

## Etapa11: Galería y Lista con configuración propia

Galería/Board y sus widgets comparten CardPreviewSettings: portada de página,
primera imagen heredada o propiedad de archivos específica, incluso si está oculta.
Si la propiedad elegida desaparece, se conserva el identificador y se indica la
ausencia; no se muestra otra imagen como si fuera la seleccionada. Las imágenes
locales usan su ID de archivo canónico. Recortar e Imagen completa cambian el
objectFit a cover/contain; el tamaño por defecto muestra Mediana, igual al renderer.

CUA en QA: se añadió Portada QA con caratula-qa.png100×100, se eligió esa
propiedad y se midieron cover y contain después de esperar el cambio efectivo.
Tras recarga la imagen cargó y conservó contain. El preview de contenido mostró
Cuerpo Uno/Dos/Tres y el párrafo; la tarjeta nueva vacía no inventó contenido.
Abrir desde la imagen mostró Cuerpo Uno en el mismo Peek.
Galería (`atlas-gallery-property-preview.png`, evidencia/herramienta local no publicada).

Lista y widgets comparten densidad compacta/normal/cómoda (mínimos30/38/48px)
y propiedades en línea/debajo. Son mínimos: la fila con relaciones y archivos
crece en altura para no cortar datos. CUA midió30 y48px en filas simples,52px
en la fila compleja, y93px al colocar sus propiedades debajo del título.
Compacta/debajo persistió al recargar. Se editó Nota Dos desde Lista y se comprobó
Nota Dos desde Lista en Galería; abrir QA Uno conservó Cuerpo Uno.
Lista (`atlas-list-layout-persisted.png`, evidencia/herramienta local no publicada).

DB-VIS-03/04 cierran estos criterios funcionales; no es una validación pixel a pixel
ni cierra DB-QA/DB-THEME globales. Es configuración de Atlas dentro de requisitos
previos, sin nueva afirmación sobre menús o dimensiones medidas en Notion.
Nueva prueba databaseCardModel cubre elección específica/fallback, ausencia, URL
canónica y densidades. npm test completo aprobado; build1138 módulos en9.47s.
La suite Python final sigue401 aprobadas/48 avisos en13.61s: esta etapa sólo
cambia frontend. Los tiempos de espera ocasionales del conector de capturas se
resolvieron consultando estado y repitiendo la captura; no se confunden con un
fallo de guardado del producto.

Comprobación posterior a etapa11:180 archivos previos presentes;18 entradas
iniciales con metadatos, Markdown e historial idénticos;25 entradas totales.
Los110 IDs originales del plan siguen presentes y sin duplicados. Temas, catálogo
y medidas/posicionamiento del editor no cambiaron en esta continuación. Revisión
de espacios de fuentes nuevas/modificadas limpia (diff --no-index --check sin
diagnósticos); no se interpreta el código1 por diferencias como error de espacios.

## Etapa12: filtros anidados y relativos (18 de octubre UTC/17 local)

Respaldo194 archivos y25 entradas en `/tmp/atlas-remaining-baseline-6jrtgdm2`.
La nueva página QA filtros anidados y Dashboard tiene tres registros y otra fuente
independiente. No modifica las25 entradas previas.

FilterRules es el único editor de árbol para vista/widget. Las hojas antiguas y
operadores heredados se conservan; los grupos tienen mode and/or y rules. Grupos
vacíos no añaden una condición (tampoco convierten un OR en siempre verdadero).
Límites8 niveles y100 nodos por vista, comprobados antes de persistir y también en
widgets; rechazo400 conserva esquema/registros. No se truncan ramas.

Operador Fecha relativa: Hoy/Ayer/Mañana; esta/última/próxima semana o mes; últimos
y próximos7 días incluidos hoy. La zona IANA del navegador se guarda al aplicar
la configuración y se muestra en el panel; filtros heredados sin zona usan UTC.
Semana lunes–domingo, intervalos inclusivos y día guardado respetado sin convertir
la zona del valor. Meses y semanas se calculan por calendario, no milisegundos
locales, evitando cambios DST. Son decisiones explícitas de Atlas dentro del
criterio abierto, no nuevas observaciones de Notion. No se ejecutó REA ni se
operó Notion en esta etapa; se reutilizó evidencia anterior.

Frontend/exportador comparten38 casos:17 hojas previas,11 árboles/zonas/grupos
vacíos y10 límites de período, incluidos29/02 y cambio de año. Exportación fija
un instante para todo el paquete y lo deja en manifest.filter_evaluated_at; los
árboles seleccionan las mismas filas y respetan orden/visibilidad. Se abrió CSV
del ZIP nuevo y comprobó2,1 sin ampliar alcance al padre.39 pruebas dirigidas
workspace/export aprobadas (29 avisos WeasyPrint), npm test completo y build1139
módulos en10.43s. API rechaza exceso de profundidad/nodos/zona inválida/modo xor
sin cambios de datos ni esquema.

CUA: creó `(Número=0 OR Número>8) AND Etiquetas contiene B`, aplicó y recargó
(sólo Alfa); añadió Fecha relativa Hoy en America/Tegucigalpa y recargó con el
mismo resultado. Board sin ese filtro mostró los tres IDs, con Alfa en A/B.
Widget: mismo grupo OR más etiqueta B, cambió2→1 registros y conservó el árbol
al recargar. Árbol/fecha (`atlas-nested-relative-filter.png`, evidencia/herramienta local no publicada),
widget persistente (`atlas-nested-widget-persisted.png`, evidencia/herramienta local no publicada).
DB-VIEW-04 cierra el contrato funcional, sin cerrar la fidelidad visual Board ni
DB-EXP-07 (semántica Default/cotejo Unicode). Relativos se actualizan en cada
render/recarga/exportación; no hay temporizador que fuerce render a medianoche.

## Etapa13: comprobaciones abiertas y regresión de color

DB-CHECK-06: matriz real de CUA, sólo nuevo registro Alfa de QA.

| Portal | Interacción comprobada | Persistencia/resultado |
| --- | --- | --- |
| Formato | Clic párrafo, Home/Shift+End seleccionan; Negrita desde toolbar. | Markdown conserva **Contenido intacto.**, Peek sigue abierto. |
| Enlace | Crear enlace, escribir URL local, Enter. | URL y texto se guardan; no navega ni cierra Peek. |
| Slash | Enter, `/`, elegir Encabezado2, escribir Portal QA. | H2 real, sin `/` residual, visible en reapertura/completa. |
| Asa | Clic real Abrir menú de bloque en H2. | Acciones y Color se abren; catálogo compartido intacto. |
| Color | Color→Azul en texto, desde portal del asa. | Markdown color:blue, atributo data-text-color=blue; clic exterior guarda sin pérdida. |

El recorrido detectó que el encabezado conservaba azul en Markdown pero
mostraba gris (227,227,224). Dos reglas de tema imponían color!important incluso
con color explícito. Se limitan a encabezados sin color/default; el h1–h6 interno
hereda el color elegido. No cambia el color por defecto ni la identidad del tema.
Verificación real Peek y página completa: azul(14,135,188) en Native oscuro y
Ámbar; azul(30,136,229) en Native claro y Porcelana. Volver a Native oscuro
conserva cuerpo, marcas, URL, H2 y propiedades0/A/B/fecha.
Formato/enlace (`atlas-peek-link-format.png`, evidencia/herramienta local no publicada),
página completa y color (`atlas-peek-portals-fullpage.png`, evidencia/herramienta local no publicada).
El drag físico conserva evidencia NATIVE; no se afirma que se repitiera aquí.
No se cierran zoom nativo ni matriz global de plugins/temas.

DB-CHECK-01: el API nativo actual sólo ofrece drag(from,to), sin mouseDown/move/up
separados. No permite producir de forma controlada Escape/pérdida de captura
después de preview y antes de soltar. Sigue sin verificar; no se inyectaron eventos.

DB-CHECK-02: Exportar del registro Alfa mostró Exportación preparada;
waitForEvent(download,12000ms) agotó el plazo sin ruta. No apareció ZIP nuevo
Alfa en Downloads. Esto no demuestra descarga guardada ni identifica su causa;
se conserva el bloqueo. No se repitió brave://downloads previamente bloqueado.

DB-PAGE-06: se abrió Importar Markdown y filechooser real con archivo QA preparado
(heading,párrafo,DB con identidad coincidente). setFiles devolvió explícitamente:
“To enable file upload ... Allow access to file URLs”. Falta ese permiso de
ChatGPT en Brave → Detalles. Se canceló y no se importó; no se sustituyó por
pegar para declarar el criterio cerrado. No se cambió la configuración de acceso.

Resultado final:403 pruebas Python aprobadas/48 avisos en11.22s; tras añadir
fecha heredada inválida al corpus común,21 pruebas export aprobadas/29 avisos,
npm test completo y build1139 módulos en10.43s. Sintaxis Python/JS aprobada.
Comparación final del respaldo:194 archivos presentes;25 entradas iniciales
idénticas (meta/Markdown/historial);5 nuevas QA, total30. Catálogo, main,
alineación/hit-testing y registro de temas intactos. Las únicas correcciones de
tema son las dos reglas de color descritas. Los110 IDs del plan se conservan.
No REA nuevo ni operación Notion; CUA exclusivamente demo local.

Demo de esta continuación: http://127.0.0.1:5059/?open=qa-filtros-anidados-y-dashboard
con atlas-db-demo. Tabla filtros conserva árbol+Hoy y muestra Alfa el17/10 local;
Board muestra tres IDs; Dashboard conserva su filtro propio a Alfa sin fecha.
El resultado de Hoy cambiará naturalmente al cambiar el día de la zona guardada.

## Etapa14: rangos y formatos; Calendario Mes/Semana

El valor simple ISO se conserva tal cual. Sólo activar Fecha final crea
`{start,end}`; no se reescriben filas antiguas ni se cambia identidad. Ambos
extremos se validan; horas con zona/no zona mezcladas en un mismo rango y fin
anterior producen error400. Retirar un extremo distinto exige confirmación
local; Cancelar conserva el valor del servidor. Convertir rango a Texto serializa
ambos extremos; el mecanismo de snapshot/conversión existente sigue disponible.

DatePropertyInput se reutiliza en Cell/FormField. Cada extremo conserva precisión
y zona propias. Formatos local/ISO/largo y12/24 horas pertenecen al esquema de
la propiedad y sólo afectan su presentación; no modifican números ni timestamps.
API valida las opciones; tipos convertidos ya no reenvían ajustes de fecha
incompatibles. Tabla/Board/Galería/Lista/widgets/Peek/completa usan CellValue común.
Exportación conserva representación ISO de ambos extremos (JSON objeto original),
no convierte las fechas a la zona del espectador. No se afirma catálogo completo
de formatos ni selector de zonas equivalente a Notion.

Calendario muestra cada día del intervalo inclusivo apuntando al mismo registro.
Mes/Semana se guardan por vista/widget; Semana navega en pasos de7 días. El día
de navegación es temporal y se abre en la semana actual al recargar. Drop define
el nuevo inicio: el servidor lee el último valor y desplaza ambos extremos el
mismo número de días, sin tocar horas/zonas ni otras propiedades. Origen obsoleto
409; campos automáticos/bloqueo siguen protegidos. Timeline usa el fin del rango
si no hay columna final separada; no se declara terminada su interacción.

Filtros y orden por fecha usan inicio, incluidos relativos. El cuerpo y ambos
extremos siguen completos al exportar. Es adaptación explícita de Atlas; no hubo
REA nuevo ni inspección Notion para atribuir esa semántica a su producto.
Corpus final42 casos compartidos JS/Python: añade inicio de rango y conserva
ordenación de propiedades Lugar;42 no sustituye los38 casos históricos etapa12.

CUA real sólo nuevo registro Beta de QA:

1. Desde Peek activó Fecha final. La operación fill del conector cambió DOM pero
   no estado React; se detectó valor sin actualizar y se usaron teclas nativas
   Home/Right/Up del campo date y Home/Up de time. No se parcheó el producto para
   aceptar eventos sintéticos del conector. Resultado18/10 01:10:05+03:00→
   20/10 02:10:05+03:00, cuerpo y propiedades9/A intactos.
2. Desmarcar Fecha final mostró confirmación; Conservar rango dejó ambos extremos.
3. Drag físico del18 al21 produjo21–23, conservando horas, precisión y zona.
   Mes mostró Beta tres días; Semana configurada y navegada mostró21/22/23.
4. Recarga conservó7 días y modo Semana. Abrir Beta desde22 mostró el mismo ID,
   Cuerpo Beta y rango21–23. Fin20 rechazado con error visible y borrador corregible;
   Cancelar mantuvo21–23.
5. Timeline mostró intervalo y ningún registro con rango en Sin fecha.
6. Encabezado Fecha→Editar propiedad→ISO/12h; Board/Peek mostraron ambos extremos
   con a. m. y conservaron+03:00. Recarga mantuvo formato y valor original.

Semana (`atlas-date-range-week.png`, evidencia/herramienta local no publicada), Peek (`atlas-date-range-peek.png`, evidencia/herramienta local no publicada),
formato (`atlas-date-range-format.png`, evidencia/herramienta local no publicada). El API canónico sigue devolviendo3 IDs
únicos en esa fuente y1 en la fuente independiente. El cuerpo de Beta conservó exactamente el encabezado Cuerpo Beta y el párrafo
Contenido intacto., comprobados byte a byte.

44 pruebas dirigidas aprobadas, incluyendo validación de rangos, último fin
concurrente,409, conversión a texto, esquema de formatos sin escritura de filas
y artefactos de los cuatro formatos. El ensayo PDF detectó diferencia únicamente
en last_viewed_at por el segundo GET de página; la prueba ahora compara índice
antes de ese GET y luego contenido/metadata excluyendo sólo ese campo de lectura.
No fue una mutación causada por exportar. Regresión completa408/55 avisos,
npm test completo y build1139 módulos en9.20s. DB-PROP-02/DB-VIS-05 cierran sus
criterios definidos; DB-VIS-06 sigue parcial por arrastre/resize/zoom/dependencias.
Los25 IDs previos, sus metadatos, Markdown e historial siguen iguales al respaldo;
30 entradas totales. No datos reales, commit, push, despliegue ni escritura Notion.


## Primera entrega V1: Tabla, Peek y documentos (17 de octubre)

El usuario acotó la entrega a Tabla/Peek y exportación/descarga. La lista única
sigue siendo DATABASE_PLAN.md: conserva todos sus IDs y estados, añade el ámbito
Necesario / Mejora futura / Decisión pendiente y deja las ampliaciones aplazadas
abiertas. No se continúa Timeline ni Dashboard ni se retiran funciones terminadas.
DB-VIEW-04, DB-PROP-02, DB-VIS-05 y DB-CHECK-06 conservan estado y evidencia.

Respaldo previo `/tmp/atlas-v1-baseline-tpyx1sow`:204 archivos locales,
SQLite consistente y Markdown/historial de30 entradas del demo. Se reutilizó el
mismo almacén `local-demo/atlas-database-demo-my0jmtud` sin reseed. Sólo se crearon
la página QA entrega V1 Tabla y Peek, tres registros y una lección dentro del
Curso QA Entrega V1. La página/curso/lección y propiedades suplementarias se
prepararon por API; las dos DB, la columna de texto y la primera fila se crearon
mediante UI real. Esta distinción evita atribuir todo el sembrado a la UI.

### Flujo observado en CUA, sin Notion ni REA nuevo

- Dos DB creadas con slash→Base de datos en la misma página; IDs diferentes.
  Recarga conserva sus registros separados2/1. El filtro de la primera no afecta
  la fila Sólo segunda DB. DB-ID-01/02 conservan sus contratos previos.
- (+) columnas crea Nota→renombrada Detalle. Temporal QA se creó, movió a la
  izquierda, ocultó, volvió a mostrar y eliminó de forma recuperable. Su archivo
  sigue accesible en Más opciones→Propiedades archivadas. No se purgó información.
- Edición de celdas real: texto Texto V1 conservado, número0, selección A,
  multiselección A/B, estado En proceso, fecha2026-10-17, casilla true y URL
  https://example.com/atlas-v1. Todos persisten después de recargar. Para fecha se
  usó el picker nativo: fill del conector no notifica React, sin parche al producto.
- OPEN abre Peek. Título Registro V1 A revisado y cuerpo con párrafo Bloque A,
  slash→H1 Encabezado V1; (+) abre catálogo e inserta Párrafo Bloque C. El asa abre
  realmente sus acciones (incluido Convertir, Duplicar, Eliminar y Color).
  Escape cierra ese menú sin cerrar Peek. El catálogo compartido se conserva.
- Arrastre físico del asa cambia el orden a Bloque A / Bloque C / H1 Encabezado V1.
  No se presenta el menú slash como prueba de drag. Centro de primera línea H1
  620,59375px y controles621px: diferencia0,40625px, sin cambiar offsets/código.
  Scroll, zoom, encabezados restantes y temas reutilizan NATIVE/CHECK-06; no se
  repite una matriz exhaustiva en esta entrega.
- El proceso demo se detuvo con143 durante el recorrido; causa de la señal no
  determinada. CUA mostró Failed to fetch. Se reanudó **el mismo almacén**, se
  leyó el estado guardado y se comprobó título, ocho valores y orden A/C/H1.
  No hubo pérdida observada. La navegación A→B→A funcionó después; Abrir como
  página completa mostró las mismas propiedades y bloques. Recargar vuelve a la
  URL de la página contenedora y conserva sus datos; no se afirma persistencia
  de ruta del registro cuando la URL sigue apuntando al contenedor.
- Papelera desde Opciones del registro→Eliminar recuperable; Más opciones DB→
  Restaurar devuelve el mismo ID record-89f1b9df287d4766 y todos sus valores y
  bloques en el orden comprobado. Clic exterior sobre título del contenedor
  cierra Peek. Escape/botón/portales/error y reintento conservan evidencia previa
  WS/ROUND/FUNC; no se simula una nueva prueba de error de red en esta entrega.
- Filtro Nombre contiene revisado devuelve sólo A; segunda DB sigue con su fila.
  Se retiró ese filtro QA. Orden Nombre descendente deja B/A y se mantiene después
  de recargar. Se conserva ese orden en la nueva tabla QA.

### Corrección necesaria en exportación de páginas y Cursos

La ruta existente exportEntry abría el exportador sin esperar los borradores.
Ahora espera AtlasDatabase.flush, Properties.flush y la cola del cuerpo de la
página capturada, antes de solicitar el mismo exportador. Descarga mediante Blob
con nombre del servidor; un error conserva el diálogo, muestra mensaje y permite
reintentar. Un fallo del exportador no se presenta como fallo del autoguardado.
No se añadió exportación masiva de cursos ni formatos/alcances nuevos.

`pageExport.test.js` comprueba espera de guardado, identidad capturada aunque
cambie la página, fallo de guardado sin petición/descarga, reintento y HTTP503
sin falso error de contenido. Aprobado; node --check app.js aprobado.
`test_document_export.py`:8 pruebas aprobadas (8 avisos heredados), páginas y
lecciones×MD/HTML/PDF/JSON; abren/parsean artefactos y comparan contenido, código,
tabla, índice, original e historial. No se recompiló el editor ni repitió la
regresión408: no cambió fuente/bundle de BlockNote, estilos, temas ni catálogo.

CUA navegó Cursos→Curso QA Entrega V1→Documento QA descarga V1→Más→Exportar→PDF.
El diálogo terminó sin error; **el evento download agotó12s sin devolver ruta**.
No demuestra que esté rota la descarga y no acredita que el archivo se guardara.
Se deja ese documento con PDF seleccionado para una única comprobación manual:
pulsar Exportar y abrir el archivo, comprobando ATLAS-CURSO-V1-7319.
DB-CHECK-02 permanece implementado sin verificar, no se cierra por generación.

En paralelo, peticiones a los exportadores reales del demo generaron8 documentos
MD/HTML/PDF/JSON de lección y registro, más ZIP configurado de registro. Todos
abiertos/parseados con su contenido; ZIP contiene cuerpo/propiedades del registro
abierto, sin exportar la DB padre ni el otro registro. PDF de curso:1 página,
16644 bytes, títulos, marcador, código, tabla42 y lista legibles en render.
Ver PDF abierto (`atlas-v1-course-pdf-preview.png`, evidencia/herramienta local no publicada) y
diálogo preparado (`atlas-v1-course-export.png`, evidencia/herramienta local no publicada),
[resultados de artefactos](ATLAS_V1_DELIVERY_VALIDATION.json).
Los archivos temporales quedan en `/tmp/atlas-v1-artifacts`. Medios, opciones de
inclusión y avisos previos no se modificaron; se reutilizan sus contratos EXPORT.

Comparación SQLite y SHA256 después: las30 entradas previas tienen exactamente
los mismos metadatos, Markdown e historial;35 entradas totales por los ejemplos
QA. Generar los9 artefactos no cambió ni índice ni ningún archivo del almacén.
Comparación del respaldo de código conserva todo salvo los4 archivos previstos
(plan, app.js, plantilla y package.json), más pruebas/evidencia nuevas. Todos los
temas y funciones previamente cerradas quedan intactos. Sin migración real,
commit, push, despliegue ni escrituras en Notion. No se amplían funcionalidades
tras este punto: sólo falta la comprobación manual de descarga del navegador.


### Cierre manual de V1 — PDF de Cursos (17 de octubre de 2026)

Evidencia aportada por el usuario, no observación nueva del conector: confirmó
manualmente la descarga y apertura del PDF de Documento QA descarga V1 y la
presencia de ATLAS-CURSO-V1-7319, el código, la tabla y las listas. Esta confirmación
resuelve la comprobación manual pendiente descrita arriba. DB-CHECK-02 se cierra
sólo para ese PDF de Cursos. No acredita descarga/apertura manual de Markdown,
HTML, JSON, ZIP ni de otros documentos; sus pruebas de artefactos se conservan.

Entrega de Tabla, Peek y exportación concluida por solicitud del usuario. No hay
implementación ni nuevas pruebas en este cierre documental; los pendientes futuros
permanecen en DATABASE_PLAN.md sin declararlos terminados. No se modifican datos,
temas ni funciones. Sin migración real, commit, push ni despliegue.
