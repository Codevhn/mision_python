> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Preparación de integración de la primera entrega de Atlas

Actualizado: 18 de octubre de 2026. Integración real autorizada y completada; la primera entrega sigue cerrada. Las secciones de preparación conservan su estado histórico.
Este documento es el procedimiento/evidencia de integración; el seguimiento
principal sigue en [DATABASE_PLAN.md](DATABASE_PLAN.md). La preparación por sí sola no autorizaba mantenimiento; el usuario dio después autorización explícita para publicar, migrar y activar la imagen congelada.

## Integración real completada — 18 de octubre de 2026

Autorización explícita posterior del usuario: publicación del artefacto congelado,
respaldo final, portadas, migración offline y activación en Fly. Resultado:
**Atlas reabierto** con el manifiesto exacto
`sha256:2facd34be5202eb39f21d3906788b06e3d1f89308a98a068136e3a3491053d82`.
No se reconstruyó ni se añadió código; sin commit, merge ni push de Git.
[Evidencia de activación](ATLAS_DATABASE_ACTIVATION_VALIDATION.json).

- Cierre 2026-10-18 22:31:34 UTC; reapertura 22:58:11 UTC:
  **26 min 37 s**. Aceptación completada antes de reabrir y antes del límite30min.
- Misma máquina `85e740a47d0298`, volumen `vol_rnzmk652pqgj1gpr`, configuración
  de recursos/servicios/autostart/autostop y secretos existentes conservados.
  Tailscale: misma identidad, Running/Online antes y después; no secrets set/unset.
- Respaldo final privado y verificado:
  `/home/frandArch/Documents/Atlas-backups/atlas-live-integration-20261018`.
  `final-data.tar.gz` contiene **todo /data sin escritores**; `final-root.tar.gz`
  contiene la raíz antigua de knowledge_base, portadas y configuración efectiva
  privada. Configuraciones de reversión, journal, informes y SHA256SUMS incluidos.
  Datos: SHA256 `5a7402e051335783d35cc0874a14cb5cbb303701c9dd4c6a0cdde23258140d51`.
  Las imágenes anterior/final siguen también en el paquete vecino
  `atlas-final-release-20261018`; no depender de /tmp para recuperar.
- Conservación offline comprobada:1150 entradas,6664 archivos originales,
  tres SQLite íntegras, tres DB identificadas y seis filas inequívocas asignadas.
  Seis entradas heredadas no confirmadas se mantienen sin asignación arbitraria.
  Sus propiedades/contenido permanecen accesibles. No se usó un journal de ensayo.
-36 portadas trasladadas a `/data/data/covers`, URL iguales y GET byte a byte.
  Las36 ya dañadas históricamente siguen con sus mismos hashes; ninguna pérdida
  ni daño nuevo. No se presentaron como reparadas.
- Validación privada antes de reabrir: dos tablas independientes, registro QA,
  edición BlockNote desde OPEN/Peek, cierre, recarga y reapertura con el texto
  `ATLAS-LIVE-UI-20261018`. Lectura independiente del API comprobó su persistencia,
  también por URL pública después del reinicio final. ZIP de registro inspeccionado;
  PDF de una lección existente abierto con PyMuPDF y texto comprobado; original
  sin editar. Esto no amplía la confirmación manual de descarga de DB-CHECK-02.
  QA añadida identificable: página `QA integración Atlas 20261018`, sin editar
  registros originales. CUA Brave utilizado; REA/Notion no fueron necesarios.

Incidencias resueltas, sin ocultar diferencias con el ensayo local: primera subida
al registro interrumpida; se completó fuera de la ventana y el manifiesto remoto
coincidió exactamente. Fly CLI fusionó `init={}` conservando sleep de mantenimiento;
se restauró explícitamente en `init.exec` el entrypoint de la imagen y sus argumentos
Gunicorn originales. Se conserva ese comando explícito en la configuración final,
con semántica igual a ENTRYPOINT+CMD originales, sin alterar la imagen ni Tailscale.
El túnel privado necesitó un puente temporal IPv6→IPv4; los servicios públicos
estuvieron ausentes hasta aceptación. No hubo fallo de integridad ni reversión.

La reversión ensayada sigue disponible, pero **no ejecutar posteriormente sobre
el respaldo final sin conservar primero los datos nuevos desde la reapertura**.
El respaldo no contiene el valor desconocido de TAILSCALE_AUTHKEY: ese secreto se
conserva en el vault de la misma aplicación; su digest y el estado del volumen
están registrados. No se afirma recuperación de esa clave en una app distinta.

## Revisión para versionado de esta entrega

Tras la activación, el usuario autorizó crear commits y publicar la rama actual
`feat/database-identity-stage1`, sin force push, merge a main ni otro despliegue.
Selección: código/estilos/plantillas/bundles, pruebas y fixtures sintéticos,
herramientas offline de migración/portadas/contexto y documentación de etapas.
Los129 archivos del manifiesto congelado coinciden por SHA256 con la imagen
activada; no se recompiló ni se modificó su código para esta publicación.

Se excluyen los datos reales y del demo, respaldos, credenciales, entornos,
temporales, capturas y trazas JSON de navegador, las dos herramientas locales
del demo y `AUDIT.md` preexistente ajeno a esta entrega. Se conservan localmente.
La documentación compartida anonimiza la referencia privada y señala las
capturas/trazas que sólo están disponibles en la evidencia local; no inventa
una nueva inspección de Notion ni publica sus registros.

Comprobaciones previas:421 pruebas de servidor aprobadas (36 avisos heredados
de WeasyPrint), suite completa `npm test` aprobada, Gitleaks sin hallazgos y
comparación sin coincidencias contra las credenciales efectivas privadas.
Tres pruebas del primer intento fallaron por sockets bloqueados del sandbox;
la ejecución completa autorizada fuera de él pasó. Comprobación de espacios
aprobada en código fuente/documentos; el bundle congelado conserva espacios
generados de dependencias, sin editar sus bytes ya desplegados.

## Bloqueos de preparación resueltos — 18 de octubre de 2026

Esta sección actualiza el procedimiento preliminar del17; conserva su evidencia
histórica abajo. La preparación está validada; **no se ejecutó mantenimiento,
migración real, activación, commit, merge ni push**. Evidencia nueva:
[imagen, tiempos y restauración](ATLAS_DATABASE_RELEASE_VALIDATION.json) y
Peek en la imagen final (`atlas-final-image-peek.png`, evidencia/herramienta local no publicada).

### Artefactos congelados

- Imagen final OCI linux/amd64:
  `sha256:2facd34be5202eb39f21d3906788b06e3d1f89308a98a068136e3a3491053d82`.
- Digest de configuración (distinto del manifiesto):
  `sha256:a8451635988dc83eaf386f7ab2511937205e37fada61e1a46fe94882c6dd714e`.
- Imagen anterior **descargada del registro**, no reconstruida:
  `registry.fly.io/mision-pythonhn@sha256:6bd9eeb4ba12f98548c3d744dc399c4a310f78cee770eae571302fa9f94073c2`.
- Manifiesto de fuente:
  `bd43c5096ece622be79432dc5ccfa238599973df687fa5303cb626cf6ae70a8e`.
  HEAD1e18bcd más el código local, incluidos los cambios de persistencia de esta
  ronda. No se activará el commit aislado ni se reconstruirá durante mantenimiento.
- 129 archivos de contexto;127 archivos de ejecución comprobados **dentro de la
  imagen**. Contexto sin data/knowledge, portadas, demos, pruebas, node_modules ni
  secretos. Se contrastó también que no contiene los valores de credenciales
  capturados. `.dockerignore` excluye datos; `prepare_atlas_release.py` usa además
  una lista explícita de rutas de ejecución. Bundles/temas/catálogo conservados.
- Python3.11.17 en la imagen final, igual al publicado. Dockerfile conserva las
  bibliotecas de PDF/OCR y los binarios Tailscale. El entrypoint es byte a byte
  igual al de la imagen anterior. El manifiesto de construcción registra digests
  reales de ambas bases y la etiqueta de fuente. Sólo se ensayó linux/amd64.

Paquete durable privado: `/home/frandArch/Documents/Atlas-backups/atlas-final-release-20261018`.
Contiene `atlas-final.oci.tar`, `original-image.docker.tar`, contexto limpio y
manifiestos SHA256, herramientas/evidencia y documentación. Los datos originales
siguen respaldados en el paquete del17, cuyo SHA se conserva. Las credenciales
Docker temporales **no** se incorporan al paquete/contexto/imagen. No se publicó
ninguna imagen; los digests anteriores identifican los artefactos locales probados.

### Persistencia de portadas ya implementada y ensayada

`cover_storage.py`, la ruta Flask y el exportador leen preferentemente
`DATA_ROOT/data/covers`. Las subidas nuevas escriben allí y mantienen exactamente
`/static/covers/<archivo>`. Hay lectura compatible del directorio antiguo cuando
un archivo todavía no fue trasladado; el contexto final no contiene portadas.
No hay symlink ni cambio del entrypoint/Tailscale, ni transferencia automática al
arrancar. El traslado se hace explícitamente sin escritores:

```sh
python /app/tools/preserve_atlas_covers.py   --source /tmp/legacy-covers --destination /data/data/covers   --baseline /tmp/covers-baseline.json --apply --offline   --report /tmp/covers-transfer.json
# Volver a inventariar el volumen contra TODOS los archivos de la captura final:
python /app/tools/preserve_atlas_covers.py \
  --source /data/data/covers --baseline /tmp/covers-transfer.json \
  --report /tmp/covers-volume-verified.json
```

`--source` será la copia final verificada, no una carpeta vacía de la imagen nueva.
El informe debe ser un archivo nuevo fuera de origen/destino; contiene inventario
privado con ruta, SHA256, tamaño y decodificación. Se prevalidan conflictos antes
de copiar; nunca se reemplaza un archivo distinto ni se borra el origen. Repetir
sobre el mismo contenido no copia nada y vuelve a verificar hashes.

Los36 dañados históricos se reconocen **por ruta y hash**, no por número ni sólo
por nombre. Una pérdida, un cambio a otros bytes dañados o un archivo nuevo
inválido se reporta aparte y bloquea el traslado hasta revisión. Un cambio válido
puede ser una reparación legítima: se conserva en el respaldo final y se revisa,
sin sustituirlo con bytes viejos. En la copia del ensayo:36 dañados históricos
idénticos,0 pérdidas/alteraciones y1 portada nueva válida. Todos sus GET devolvieron
los mismos bytes; la nueva sobrevivió a destruir/recrear el contenedor y aparece
en ZIP y PDF del registro. Las pruebas simulan además borrado y daño nuevos.
Una lectura SSH adicional no estuvo disponible en esa consulta; no se arrancó
Atlas para obtenerla. El inventario final se renovará en la ventana autorizada.

### Ensayo cronometrado y restauración

Se aplicó la migración **dentro de la imagen final**, con `/data` apuntando sólo a
la copia y `--network none` en las herramientas offline. Tres DB identificadas,
6 asignaciones inequívocas y6 sin asignación arbitraria. Repetición aprobada.
Las1150 entradas originales, sus propiedades/cuerpos y6661 archivos no SQLite
verificados se conservan salvo las ediciones de esquema previstas y actividad QA;
no faltó ningún archivo. Finance/assistant conservan su contenido lógico.

La app se probó con2 workers/4 hilos, puerto sólo127.0.0.1, credenciales sintéticas
y una red Docker local propia. Tailscale se desactivó **sólo en esos contenedores**
para no incorporar clones a la red real. El estado `/data/tailscale` no cambió;
los secretos/configuración Fly no se escribieron ni reemplazaron. No se afirma una
reconexión Tailscale real por haber conservado esos bytes.

Tabla/Peek reales en navegador: editar celda, guardar cuerpo BlockNote, abrir página
completa, recargar y reabrir. El texto guardado también está en el PDF posterior.
PDF de una lección existente abierto y cuerpo conservado. No amplía la confirmación
manual de descarga de DB-CHECK-02 a otros documentos o formatos.

Para revertir el ensayo se detuvo sólo el contenedor candidato, se restauró una
copia nueva **de todos los archivos originales** y sus portadas fuera del volumen,
y se arrancó la imagen anterior exacta.1150 IDs/metadatos iguales; historial y
cuerpos iguales; integrity_check en3 SQLite;36 URL antiguas y exportación JSON
comprobadas. Las ediciones QA de la rama candidata se conservaron por separado.
El candidato se reanudó en su propia copia para revisión, sin revertir esos datos.

| Operación local medida | Segundos |
| --- | ---: |
| Construcción/exportación OCI (fuera de interrupción) |220,82 |
| Extraer y copiar el respaldo |4,34 |
| Trasladar36 portadas/verificar |0,63 |
| Repetir traslado |0,42 |
| Migración con respaldo completo |3,48 |
| Repetir migración |1,73 |
| Arranque candidato hasta respuesta |1,37 |
| Reemplazo de contenedor hasta respuesta |1,04 |
| Reversión completa de código/datos con comprobaciones |6,51 |

45 pruebas dirigidas aprobadas en7,20s;36 avisos de WeasyPrint heredados. El primer
arnés usaba red interna Docker, que impedía publicar el puerto aunque Gunicorn
arrancaba; se corrigió sólo el arnés y se repitió desde una copia nueva. No se
alteró la imagen para resolverlo. La revisión final usó el mismo digest congelado.

Los tiempos son de Docker local y datos en tmpfs; **no incluyen** drenaje de Fly,
copia final por WAN ni operaciones del plano de control. Objetivo operativo
15–25min de interrupción; límite30min para iniciar reversión si no se acepta,
reservando60min en total para incidencias. La construcción y publicación autorizada
se harían antes de la ventana, sin reconstruir la imagen. No prometer segundos
de interrupción basándose en el ensayo local.

### Secuencia concreta que queda por autorizar

1. Publicar **este OCI ya probado**, sin recompilar, en `registry.fly.io/mision-pythonhn`.
   Verificar que el digest recuperado del registro sea exactamente2facd34…; si el
   transporte cambia el manifiesto, detenerse antes de activar. Conservar descargada
   la imagen anterior6bd9eeb… y ambos manifiestos. No hace falta commit/merge/push
   de Git para usar el artefacto; publicar una imagen sí requiere autorización.
2. Guardar configuración efectiva completa y digests de secretos; comprobar que
   máquina/volumen/release siguen siendo los revisados. Guardar borradores, cerrar
   editores y pausar trabajos. Cordonar servicios y drenar solicitudes; si hay un
   escritor/trabajo sin terminar o no se puede acreditar su pausa, abortar antes
   de migrar. Mientras aún existe la raíz antigua, capturar app/configuración y
   portadas con inventarios estables; compararlas con la referencia y retener todo
   cambio legítimo nuevo. No actualizar la imagen antes de esta extracción.
3. Parar la máquina con cierre ordenado y, en la misma máquina/volumen, arrancar
   modo de mantenimiento sin Gunicorn ni Tailscale, sin servicios públicos y con
   auto-stop desactivado temporalmente. La configuración temporal usa la imagen
   final por digest y `init.exec=["/bin/sleep","infinity"]`; se conserva íntegra la
   configuración anterior para restaurar init/servicios después. La semántica de
   `init.exec` se contrastó con la [API oficial de Machines](https://fly.io/docs/machines/api/machines-resource/),
   y cordon con el [CLI oficial](https://fly.io/docs/flyctl/machine/). Esto **será una
   modificación real futura**, no una acción ejecutada en esta ronda.
4. Con todos los escritores ya ausentes, obtener el respaldo final coherente de
   `/data` y combinarlo con las portadas/raíz capturadas antes del reinicio. Descargar
   y verificar hashes, WAL/SQLite, índices/Markdown y espacio. No reutilizar el
   snapshot del17 como si fuera el estado actual. Mantener copia durable fuera
   del volumen; el respaldo de migración va a `/tmp`, nunca dentro de `/data` ni
   del repositorio. Revisar diferencias del inventario1150/3/6/6: son referencia,
   no cantidades a imponer si hubo ediciones legítimas.
5. Subir sólo las portadas finales verificadas y su inventario a `/tmp/legacy-covers`
   y `/tmp/covers-baseline.json` del mantenimiento. Ejecutar el traslado mostrado
   arriba y comprobar0 pérdidas/daño nuevo. Después ejecutar:

```sh
python /app/tools/migrate_database_identity.py   --root /data --backup /tmp/atlas-before-identity --apply --offline
# Si se interrumpe, reanudar el MISMO journal:
python /app/tools/migrate_database_identity.py   --resume /tmp/atlas-before-identity/migration.json --apply --offline
```

6. Validar IDs, valores, cuerpos, orden, historial, adjuntos, nuevas portadas y
   entradas no resueltas. Restaurar los campos init/servicios/auto-stop originales
   dejando **únicamente la imagen final revisada** como cambio de código. Misma
   app, mismo DATA_ROOT/volumen/secretos y entrypoint Tailscale; ningún secrets set,
   unset, recreación de aplicación ni clave inventada. Comprobar por acceso privado
   Tabla/Peek, persistencia y PDF antes de descordonar. Comparar también el estado
   de Tailscale con el previo, sin revelar ni reemplazar su clave.
7. Abortar ante copia/identidad inconsistente, pérdida/cambio no explicado, conflicto
   de portadas, fallo de SQLite o guardado, o falta de aceptación a30min. Conservar
   el estado fallido fuera del volumen antes de restaurar; no llenar el volumen1GiB
   con copias de sí mismo. Volver a mantenimiento sin escritores, restaurar **datos
   finales previos + código anterior por digest + configuración original**. Restaurar
   las portadas en `/app/knowledge_base/static/covers` antes de arrancar Gunicorn
   antiguo (ese código aún escribe allí). No mezclar WAL/SHM de revisiones distintas.
   Verificar hashes/integridad/GET/exportación antes de reabrir. Las ediciones
   posteriores nunca se sobrescriben sin conservar una copia aparte.

Los dos bloqueos técnicos de preparación están cerrados. Quedan la autorización
y los controles finales de estado vivo, espacio y transporte; no se ejecutaron
acciones de esta secuencia ni se validó el plano de control Fly con modificaciones.

## Instancia habitual y configuración observada

- Rama local `feat/database-identity-stage1`, HEAD
  `1e18bcde9fe91ca6f5f0c8126ec61e7d25670403`. Main y origin/main **locales**
  apuntan al mismo commit; no se hizo fetch ni se afirma actualidad remota.
  Hay 22 archivos seguidos modificados y numerosos archivos nuevos. No se
  cambió de rama ni se sobrescribió trabajo local.
- Atlas habitual: `mision-pythonhn.fly.dev`, máquina `85e740a47d0298`, región lax,
  release806, imagen `deployment-01M51AEXR2YSYZF1ZP0C650DEQ`.
  La primera consulta informó stopped; tras la corrección del usuario, la nueva
  consulta informó **started**. Se confirmó por SSH que está activo. No se
  arrancó, detuvo, reinició ni reconfiguró esa máquina por el agente.
- Observación directa del proceso: Python3.11.17, Gunicorn gthread con2 workers,
  4 threads/worker y timeout120. `DATA_ROOT=/data`; cwd `/app/knowledge_base`.
  Volumen activo `vol_rnzmk652pqgj1gpr` montado en `/data`,1GiB. Existe otro
  volumen kb_data en jnb sin máquina: **no es la fuente elegida**.
- Almacenes: `/data/data`, `/data/knowledge`, biblioteca e historial, otras bases
  SQLite y estado Tailscale dentro de `/data`. Portadas fuera del volumen:
  `/app/knowledge_base/static/covers`. No asumir que el volumen basta.
  Ejecución de código está activada en producción; se desactivó sólo en el ensayo.
- El ZIP interno `/api/export-all` del código revisado no incluye todos esos
  recursos (biblioteca, portadas, assistant.db y configuración); no se usó como
  respaldo completo. Los snapshots Fly existentes tampoco acreditan los archivos
  fuera del volumen. No se creó/restauró ningún snapshot.

## Archivos que integrar y archivos que excluir

El manifiesto privado `integration-files.json` enumera los438 archivos respaldados,
SHA256, categoría y `local_change`. Son una instantánea del trabajo actual, no una
orden para añadir todos a Git ni para copiar el árbol completo a producción.

| Categoría de cambios locales al iniciar | Cantidad | Tratamiento |
| --- | ---: | --- |
| Código, plantillas, estilos y bundles de aplicación | 67 | Integrar juntos: módulos database_*.py, editor compartido, módulos de tabla/Peek/vistas, CSS, app.js/properties.js, temas, plantillas, fuentes y bundles presentes. Mantener funciones ya terminadas; no amputar dependencias de otras vistas. |
| Pruebas | 28 | Conservar como validación; no son datos del usuario. |
| Documentación y evidencia | 109 | Conservar; capturas e informes documentan procedencia y límites. Este informe/evidencia nuevos son posteriores al manifiesto inicial. |
| Herramienta de migración offline | 1 | Conservar para operación explícita; no ejecutar al arrancar automáticamente. |
| Soporte del repositorio | 1 | Cambio de .gitignore que protege el demo. |
| Herramientas del demo | 2 | Mantener disponibles para desarrollo, excluir del paquete de ejecución habitual. |
| AUDIT.md local | 1 | Conservar localmente; revisar inclusión documental por separado. |

No integrar `local-demo/**`, `demo-state.json`, cookies, bases de datos, biblioteca,
Markdown real, portadas subidas, archivos de `/tmp`, entornos virtuales, cachés,
node_modules ni secretos. Los8 archivos semilla seguidos de data/knowledge
permanecen respaldados pero **no sustituyen** el almacén real. En la preparación del17 Dockerfile,
entrypoint, Procfile, fly.toml y CI se revisaron sin cambios. La ronda del18 ajustó
Dockerfile y .dockerignore; entrypoint, Procfile, fly.toml y CI siguen intactos. Preparar un
contexto de construcción explícito sin datos/secretos/demos: .gitignore no
sustituye .dockerignore. Los bundles existentes se ensayaron sin recompilarlos.

## Respaldo obtenido y verificaciones

Directorio de preparación: `/tmp/atlas-integration-prep-20261017-231716`.
Copia durable verificada: `/home/frandArch/Documents/Atlas-backups/atlas-integration-prep-20261017-231716`.
Contiene30 archivos verificados mediante SHA256SUMS.json y permisos privados.

- `production-online.tar.gz`:237086403 bytes; SHA256
  `79f0056e33254d13e1ac67ff7f92392e84b8bfb97fddfdb6459f2fca4cfe2766`.
  Incluye **todo `/data` y `/app/knowledge_base`**, configuración de aplicación
  capturada del proceso, versiones y manifiestos antes/después.
- Captura SSH de lectura, sin importar app.py ni ejecutar rutas de mantenimiento.
  Los6852 archivos o enlaces fueron iguales antes/después y todos los hashes del
  archivo recibido coinciden. No hubo enlaces simbólicos. **Es una captura en
  línea estable durante el intervalo observado, no una instantánea atómica del
  sistema de archivos ni un respaldo del instante futuro de integración.**
- `workspace-files.tar.gz`, patches de trabajo/índice y `history.bundle` conservan
  el código local previo;438 hashes de miembros comprobados y `git bundle verify`
  aprobado. No hace falta commit para recuperar ese trabajo.
- Configuración Fly y nombres/digests de secretos guardados en archivos privados;
  los valores recuperables están sólo dentro del respaldo protegido. SECRET_KEY,
  KB_PASSWORD y demás claves del proceso se capturaron sin mostrarlos en logs ni
  documentos del repositorio. TAILSCALE_AUTHKEY fue retirado del entorno por el
  entrypoint y **no pudo recuperarse su valor**: Fly lo conserva y se respaldó
  `/data/tailscale`; una reconstrucción independiente podría necesitar una nueva
  clave de incorporación. No se cambió ninguna credencial.
- Directorios privados0700 y archivos del paquete0600. Contienen datos y secretos:
  no publicar ni incorporar a Git. `/tmp` es temporal; conservar el paquete durable
  y una copia adicional en otro medio antes de la intervención real.

## Migración necesaria para los datos capturados

Inventario real sobre la copia:1150 entradas (1073 lecciones,43 páginas,
16 teamspace y18 de otros tipos/sin type),3 bloques DB en3 contenedores.
Los3 carecían de identidad persistente; sí necesitan la migración de identidad.

El ensayo cambió exclusivamente el índice y el JSON de esos3 bloques para añadir
identidad/versionado. Asignó6 filas con `db_row=true` y un único contenedor/base
inequívoco. Conservó IDs de página/fila, propiedades y valores, cuerpos, opciones,
vistas, orden y contenido fuera de los JSON. No creó filas duplicadas.
Otras6 entradas quedaron `unconfirmed_legacy_row`: sus metadatos no se tocaron,
no se escogió arbitrariamente una DB y siguen accesibles como páginas. El detalle
privado está en migration-inventory.json/migration.json; no se publica su contenido.
Un mapa revisado es necesario para resolverlas si se confirma que son registros.
No se copia el journal de ensayo para aplicarlo a producción: contiene rutas y
revisiones de la copia y debe regenerarse contra el estado final detenido.

`tools/migrate_database_identity.py` no importa Flask. Preview no aplica cambios;
apply exige `--offline`, respaldo nuevo externo y ausencia de escritores.
Interrupción: reanudar **el mismo journal**, conservando identidades ya generadas;
no crear otro plan sobre una operación parcialmente aplicada. Duplicados de IDs,
ficheros faltantes, conflictos de revisión o copia alterada detienen el proceso.

## Ensayo ejecutado, conservación y límites

- Se extrajo el respaldo, se creó `rehearsal-data` y se normalizaron únicamente en
  esa copia index.db/assistant.db/finance.db usando backup SQLite; integrity_check
  aprobado. El archivo original del respaldo y la instancia real no se tocaron.
- Migración offline aplicada y repetida: segunda aplicación sin diferencias;
  segundo inventario sin ediciones/asignaciones nuevas. Restauración a directorio
  nuevo desde migration-backup conserva el índice original y todos sus archivos;
  integrity_check aprobado en las3 bases restauradas.
- Fuente de código copiada del workspace; Python3.11.16 (producción3.11.17),
  requisitos fijados y Gunicorn con2 workers/4 hilos. Claves reales no cargadas,
  ejecución de código desactivada, sólo127.0.0.1:5071. No es una prueba exhaustiva
  de carga ni reproducción exacta de la imagen Linux de Fly.
- API de las3 fuentes migradas devuelve1/0/5 filas correctas. Dos esquemas reciben
  defaults de compatibilidad en la respuesta (views, y columns/activeView cuando
  faltaban); **el esquema almacenado no se reescribe por esas lecturas**.
- Nueva página y2 registros QA sólo en la copia: bases separadas, número0,
  edición UI de celda, apertura Peek, edición real BlockNote, página completa,
  recarga y reapertura con el mismo texto/propiedades. La primera entrega conserva
  su evidencia más amplia; no se repiten todas las vistas/temas.
- Lección existente de Cursos exportada en JSON/Markdown/PDF: cuerpo exacto en
  formatos de texto y PDF abierto/parseado con texto. ZIP QA contiene cuerpo del
  registro. No se confunde generación con nueva confirmación manual de descarga;
  DB-CHECK-02 mantiene su cierre PDF anterior, sin ampliarlo.
- Comparación final: las1150 entradas originales iguales salvo las6 asignaciones
  de identidad previstas;1150 cuerpos y esquema/orden conservados; historial y
  adjuntos locales byte a byte. Finance/assistant conservan su contenido lógico.
  Cambios de activity.json corresponden a acciones QA dentro de la copia.
- Hallazgo previo:36 archivos de portada capturados no son decodificables como
  imágenes. Sus hashes coinciden con el origen; se conservan exactamente, pero no
  se afirma recuperación de imágenes ya dañadas. Recursos remotos sólo se respaldan
  como referencias existentes, no se descargó todo Internet.
- El lock de esquema es threading.RLock, local a cada proceso. El recorrido con2
  workers no demuestra seguridad de todas las escrituras simultáneas entre
  procesos; evitar editores durante migración y conservar este riesgo, sin abrir
  ahora una refactorización o prueba prolongada de concurrencia.

## Procedimiento preliminar del17 — histórico, sustituido por la secuencia del18

1. Cerrar editores con cambios pendientes, acordar mantenimiento y guardar el
   paquete verificado en almacenamiento durable externo. Confirmar app/máquina,
   volumen, DATA_ROOT, release y estado de portadas antes de tocar nada.
2. Preparar artefacto de código revisado, sin datos ni secretos; preservar los
   módulos ya implementados, bundles y configuración de temas. No hacer todavía
   commit, merge, push ni despliegue. Mantener la imagen anterior identificada.
3. En la ventana autorizada, impedir nuevas escrituras y drenar/detener todos los
   escritores. **No detener la máquina antes de extraer sus portadas/configuración
   fuera del volumen.** Coordinar la captura con acceso de mantenimiento; no
   sustituirla por actualizar la imagen o sobrescribir el arranque antes de copiar.
4. Obtener respaldo final completo, hashes y lectura SQLite/JSON válidas, repetir
   inventario y comparar diferencias desde este ensayo. Cualquier cambio inesperado
   bloquea la aplicación. Preservar las portadas al preparar la imagen/arranque:
   hoy están fuera del volumen; no permitir que un despliegue las omita. Resolver
   esa restauración/persistencia concreta antes del deploy, sin inventar un montaje.
5. Regenerar plan contra el DATA_ROOT final. Aplicar offline con respaldo externo
   nuevo; no resolver automáticamente las6 entradas no confirmadas. Verificar
   conjuntos de IDs, valores, cuerpos, orden, adjuntos y consistencia. Si varían
   las cantidades respecto a1150/3/6/6, revisar el delta; no forzar esos números.
6. Sólo con autorización explícita de integración/despliegue, activar el artefacto
   con DATA_ROOT y secretos originales, nunca los del demo ni las semillas.
   Verificar Tabla/Peek/guardar/recargar/papelera y un PDF antes de reabrir edición.
   Preservar rutas/origen del navegador para mantener preferencias locales.

## Reversión

Mantener escritores detenidos; preservar primero cualquier edición posterior en
un paquete aparte. Arrancar código antiguo sobre datos nuevos no es reversión.
Restaurar a un destino limpio **el estado previo completo** (datos, knowledge,
historial, adjuntos, portadas y configuración), junto con el código/imagen previos.
Recuperar SQLite junto a su WAL correcto o desde su copia autónoma validada; nunca
mezclar un index.db restaurado con WAL/SHM de otra revisión. Comparar hashes,
IDs/metadatos y integrity_check antes de reabrir. No sobrescribir automáticamente
ediciones posteriores ni eliminar el estado fallido. El ensayo probó la restauración
de datos a un destino nuevo; no se hizo rollback de infraestructura Fly ni deploy.
