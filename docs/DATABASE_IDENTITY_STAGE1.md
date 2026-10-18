> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Bases de datos de Atlas: identidad y migración, etapa 1

> Alcance ampliado: [plan de dos etapas](DATABASE_PLAN.md). Identidad/migración es la etapa 1; el [rediseño visual](DATABASE_REDESIGN_STAGE2.md) sigue abierto y empieza con una tabla funcional para revisión antes de extenderse a otras bases y vistas.

Implementación local del 16 de octubre de 2026. Punto de partida: `main` actualizado por fast-forward a `1e18bcde9fe91ca6f5f0c8126ec61e7d25670403`, rama `feat/database-identity-stage1`. No se hizo reset, pull, commit, push ni despliegue. No se ejecutó la migración sobre datos reales ni se abrió o modificó Notion durante esta etapa.

## Preparación e integración

Antes del fetch se copiaron los cinco archivos sin seguimiento a `/tmp/atlas-stage1-local-backup-3hikpbga`, conservando rutas y verificando SHA-256: `AUDIT.md`, los dos informes locales de Notion y sus dos capturas. `manifest.json` registra tamaños y hashes. Los cinco originales se comprobaron de nuevo antes de integrar esta documentación; `AUDIT.md` se deja intacto y fuera del alcance del cambio. La copia está en un directorio temporal: conservarla en almacenamiento permanente antes de limpiar `/tmp`.

`git fetch origin` encontró tres commits nuevos; la relación de ascendencia era `0 3`, sin divergencia ni colisiones con los archivos locales. `git merge --ff-only origin/main` incorporó el diagnóstico existente y los demás cambios de main. Después se creó la rama nueva. Se leyeron [DATABASE_AUDIT.md](DATABASE_AUDIT.md), [DATABASE_NOTION_REFERENCE.md](DATABASE_NOTION_REFERENCE.md) y [NOTION_DATABASE_EVIDENCE.md](NOTION_DATABASE_EVIDENCE.md); no se repitió la auditoría completa.

El diagnóstico original queda como evidencia histórica. Las inspecciones de Notion N01–N22 proceden de la conexión de navegador; los fallos de REA siguen registrados en R01. Esta implementación y sus pruebas corresponden exclusivamente a Atlas.

## Contrato implementado

- El JSON de cada bloque guarda `database_id: db_<UUID de 32 caracteres hexadecimales>` e `identity_version: 1`. No depende del ID transitorio del bloque ni de la pestaña de vista.
- Una fila mantiene su mismo `entry_id`, archivo Markdown, propiedades y orden; añade `database_id` a sus metadatos. El contenedor sigue siendo `parent_id`.
- La tabla consulta hijos por contenedor **y** base. Cambiar de vista conserva el origen y los registros. La consulta de hijos sin parámetro mantiene el contrato general del resto de Atlas.
- La creación valida formato, contenedor y reutilización entre contenedores con registros. El formato no es un permiso de acceso ni una implementación de fuentes enlazadas entre páginas.
- Cada instancia del editor recibe su propio contexto de página. Abrir el peek ya no cambia el origen de la tabla del editor de fondo mediante `window._currentEntryId`.
- Las bases nuevas reciben identidad al insertarse. Copiar un bloque independiente genera otra identidad, preservando su esquema y vistas; copiar una página también regenera las identidades de sus bloques. Esa copia conserva la conducta anterior de no clonar sus páginas hijas: las bases copiadas empiezan sin registros. Duplicar una fila sí conserva su pertenencia y crea otro UID de entrada.
- Mover el contenedor conserva sus bases y sus filas. Sacar una fila mediante cambio de padre o «Mover a» elimina su pertenencia anterior y la conserva como página normal.
- `parseSchema` conserva campos adicionales del JSON al guardar ajustes, incluida la identidad y los campos antiguos que no interpreta.

No se cambió `properties.js`: sus editores siguen guardando las propiedades en las páginas-fila. No se añadieron relaciones, fuentes enlazadas entre bloques/páginas, filtros nuevos ni conversiones de tipos.

## Datos antiguos y pertenencia ambigua

No hay migración implícita al abrir una página. Un bloque antiguo sin identidad muestra un aviso y sus filas antiguas sin asignar; para crear nuevas filas requiere migración. Nunca mezcla las filas ya identificadas de otra base.

La migración da una identidad a cada bloque antiguo válido. Sólo asigna automáticamente una fila cuando está marcada explícitamente `db_row: true`, su página contiene exactamente una base y esa base adquiere identidad en ese mismo plan. Conserva íntegros el resto de los metadatos y el cuerpo. Las subpáginas con `db_row: false` no se convierten en registros.

Cuando hay varios bloques antiguos, no se infiere pertenencia a partir de columnas o títulos. Las filas quedan sin asignar, enumeradas en `unresolved` con candidatos. Una página antigua sin bandera `db_row` tampoco se asigna automáticamente. En bloques ya identificados, estas páginas aparecen en «Registros antiguos sin asignar»: un grupo de recuperación común del contenedor, separado de las filas de cada base, con apertura de la página en peek. La compatibilidad con páginas antiguas sin bandera es explícita y puede incluir subpáginas que requieren revisión.

Una base ya identificada no absorbe automáticamente filas pendientes en posteriores ejecuciones, aunque se eliminen otros bloques. La resolución exige un mapa revisado `entry_id → database_id`. El CLI rechaza asignaciones a una base de otra página, a entradas desconocidas o a filas ya asignadas. Las identidades huérfanas se informan como `orphan_identity`; requieren reparar la referencia o revisar los metadatos sobre copia, no se reasignan mediante ese mapa. Las páginas siguen presentes en el índice/árbol de páginas y en la API general de hijos; eliminar un bloque no elimina sus páginas-fila.

## Procedimiento de migración

Herramienta: [migrate_database_identity.py](../tools/migrate_database_identity.py), módulo independiente de Flask. No arranca Atlas ni ejecuta `load_index()`. Admite SQLite y el índice JSON anterior. El almacén debe contener `data/` y `knowledge/`.

1. Detener Atlas y todos los procesos que escriban en ese almacén. `--offline` es una declaración del operador; el CLI no puede detectar todos los escritores externos. La migración no debe ejecutarse en paralelo con la aplicación.
2. Inventariar primero una copia del almacén. La vista previa no modifica registros ni Markdown:

   ```sh
   python tools/migrate_database_identity.py --root /ruta/copia-atlas
   ```

3. Aplicar con una ruta nueva de respaldo, fuera del repositorio y del árbol de datos:

   ```sh
   python tools/migrate_database_identity.py --root /ruta/copia-atlas \
     --backup /ruta/respaldos/atlas-identidad-001 --apply --offline
   ```

   Se copian `data/` y `knowledge/`, incluidos historial y ajustes. SQLite se respalda mediante su API de backup para incluir WAL. Se comprueban índice y Markdown contra el inventario; el manifiesto del respaldo contiene SHA-256 de todos los archivos copiados. El journal `migration.json` conserva versiones, antes/después, orígenes, asignaciones y pendientes. No contiene credenciales de la sesión del navegador; sí contiene datos locales del almacén y debe custodiarse como el respaldo.

4. Si se interrumpe, mantener Atlas detenido y reanudar **el mismo journal**:

   ```sh
   python tools/migrate_database_identity.py \
     --resume /ruta/respaldos/atlas-identidad-001/migration.json --apply --offline
   ```

   Antes de escribir, cada archivo y metadato debe coincidir con su versión anterior o posterior del plan. Un cambio ajeno detiene la operación. Las sustituciones de Markdown son atómicas por archivo; SQLite usa una transacción y actualizaciones condicionadas de las filas afectadas. El journal permite completar una interrupción entre ambos almacenes. No existe una transacción única entre archivos y SQLite. Repetir el mismo journal sin cambios externos conserva los valores; crear otro plan después de completar la migración no añade identidades ni asignaciones automáticas.

5. Revisar `unresolved` y los candidatos **persistidos** del journal. Las identidades de una vista previa sin aplicar son provisionales. Tras completar la primera migración, crear por ejemplo `asignaciones.json` (`null` permite confirmar una entrada como subpágina normal y retirarla del grupo de recuperación):

   ```json
   {
     "id-real-de-fila-revisada": "db_identificador_real_de_32_caracteres_hexadecimales",
     "id-real-de-subpagina-confirmada": null
   }
   ```

   Sustituir ambos valores por los del informe. Aplicar otro plan respaldado:

   ```sh
   python tools/migrate_database_identity.py --root /ruta/copia-atlas \
     --assignments /ruta/asignaciones.json \
     --backup /ruta/respaldos/atlas-identidad-002 --apply --offline
   ```

6. Para volver al estado anterior, mantener Atlas detenido y **restaurar `data/` y `knowledge/` del mismo respaldo en un directorio nuevo y vacío**. Verificar su manifiesto y usar ese directorio como `DATA_ROOT`. Conservar el almacén migrado separado hasta comprobar la restauración. No mezclar archivos de distintos respaldos ni reanudar un journal completado sobre datos que hayan seguido editándose.

Los esquemas inválidos, IDs repetidos, versiones incompatibles o archivos Markdown ausentes detienen el inventario; no se corrigen inventando pertenencia. El plan comprueba todos los metadatos y los archivos de entradas antes de comenzar. La coherencia de historial/otros almacenes depende también de detener los escritores, como exige el procedimiento.

## Revisión local aislada

run_database_identity_demo.py (`../tools/run_database_identity_demo.py`, evidencia/herramienta local no publicada) crea un `DATA_ROOT` nuevo bajo `/tmp`, prepara y migra ejemplos antes de arrancar Flask en loopback. Nunca copia los datos del usuario. La contraseña es sólo del entorno de demostración: `atlas-db-demo`.

```sh
# Con las dependencias de requirements-dev.txt instaladas en el Python elegido:
python tools/run_database_identity_demo.py --port 5057
```

El proceso imprime enlaces de aislamiento y recuperación, la ruta temporal y su respaldo. En el primer enlace, A contiene sólo Alfa y B sólo Beta; «Otra vista A» mantiene Alfa. Crear una fila en A, editar su título/cuerpo en peek, cerrarlo y recargar: B debe seguir sin esa fila. El segundo enlace muestra dos bases migradas con un registro antiguo sin asignar; abrir el grupo de recuperación permite leer su cuerpo. Los ejemplos son descartables. El respaldo inicial sólo refleja la siembra, no ediciones posteriores del navegador. Detener con Ctrl+C al terminar.

## Resultados de validación

Resultado final: **341 pruebas Python aprobadas**, incluidas 23 nuevas de identidad/migración y las dos caracterizaciones de aislamiento convertidas a aceptación; las pruebas previas de propiedades y concurrencia se conservan. `npm test` aprobado, con la prueba nueva de identidad, persistencia Markdown, copia de bloques y contexto de editores. `npm run build` aprobado: 1102 módulos; bundle JS de 4 362,60 kB y CSS de 245,58 kB. Se reconstruyó el JS servido; el CSS resultante no cambió.

Entorno: Python 3.14.8, pytest 8.3.4, Node 22.22.2 y Vite 6.4.3. La CI prescribe Python 3.11; no se ejecutó aquí esa versión. Se instalaron los requisitos fijados en un entorno temporal `/tmp/atlas-stage1-venv` y las dependencias del lockfile mediante `npm ci`, sin modificar requisitos ni lockfile. La suite completa se ejecutó con plugins externos desactivados y un `DATA_ROOT` temporal de arranque; cada prueba usa además su fixture temporal. Dio 19 avisos de deprecación `datetime.utcnow()` en funciones ajenas a esta etapa. Tres pruebas fallaron inicialmente por sockets bloqueados en el sandbox; la repetición autorizada fuera del sandbox pasó completa.

```sh
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DATA_ROOT=/tmp/atlas-stage1-pytest-bootstrap \
  /tmp/atlas-stage1-venv/bin/python -m pytest knowledge_base/tests -q
# Desde knowledge_base/editor-src:
npm test
npm run build
```

Las pruebas comprueban aislamiento de A/B, persistencia al cambiar vista, propiedades y cuerpo tras apertura, movimiento del contenedor, desvinculación de una fila, copias independientes, conservación de cero/false y orden, migración de SQLite/JSON, resolución expresa y confirmación de subpáginas, respaldo/restauración con historial, WAL confirmado pendiente de checkpoint, rechazo de respaldo alterado, planes obsoletos y reanudación de una interrupción entre Markdown e índice. La prueba WAL detectó un error en la primera versión del respaldo: abrir una copia cruda con WAL/SHM y retirar esos archivos podía dejarla ilegible. Se corrigió construyendo una base nueva mediante `Connection.backup()`, cerrando las conexiones y dejando la copia independiente en modo DELETE. Las pruebas posteriores pasan.

La vista previa del CLI también se ejecutó sobre el respaldo de los ejemplos; informó la fila ambigua y sus candidatos sin aplicar el plan. `git diff --check` de fuentes/documentación y comprobación equivalente de archivos nuevos: sin errores. La comprobación global señala un tabulador al final de la línea 271 del bundle generado: es parte de un literal de una dependencia, presente con el mismo sufijo en main antes de compilar (líneas 271–278); el renombrado de variables minificadas hace que ahora se señale esa línea. No se elimina porque cambiaría el literal. No es el caso anterior de `--no-index --check /dev/null`, documentado en la referencia de Notion.

### Comprobación visual mediante navegador

Instancia en `127.0.0.1:5057`, `DATA_ROOT=/tmp/atlas-database-demo-izm3racu`; respaldo de la siembra en `/tmp/atlas-database-demo-izm3racu-backup`. Se utilizó la conexión de navegador, **no REA**. El servidor sigue disponible para revisión local mientras se conserve el proceso.

| Evidencia | Acción y resultado observado |
| --- | --- |
| A01 — aislamiento y segunda vista (`atlas-database-identity-stage1.jpg`, evidencia/herramienta local no publicada) | A mostró sólo Alfa y B sólo Beta. Seleccionar «Otra vista A» mantuvo Alfa; después se creó Gamma mediante «Nueva página» de A. Se editó su título y cuerpo en peek, se cerró y se recargó. A mostró Alfa/Gamma y B sólo Beta. Los atributos DOM conservaron `db_aaaa…` y `db_bbbb…`, respectivamente. |
| A02 — peek persistido (`atlas-database-identity-peek.jpg`, evidencia/herramienta local no publicada) | Reabrir Gamma después de recargar mostró «Cuerpo de prueba aislado.» y sus propiedades, con las dos bases de fondo conservando sus registros. |
| A03 — recuperación (`atlas-database-identity-recovery.jpg`, evidencia/herramienta local no publicada) | Las dos bases antiguas recibieron IDs distintos; sus tablas quedaron sin filas asignadas y ambas ofrecieron el mismo grupo explícito de recuperación con un registro. Desde el grupo se abrió su página y se leyó «Contenido antiguo intacto» / «No se eligió una base por mí.». No se escogió una base para ese registro. |
| A04 — base creada desde el menú (`atlas-database-identity-new-source.jpg`, evidencia/herramienta local no publicada) | Posteriormente se insertó otra base con `/base de datos`. Generó `db_b2081ec354d84f47ae6662ebc473763f`, distinto de A/B, y permaneció vacío tras recargar. A conservó Alfa/Gamma y B sólo Beta. Esa edición de prueba dejó además un encabezado vacío en la demo, sin afectar a los registros. |

Las capturas corresponden a momentos distintos de la misma prueba; la primera muestra las dos bases antes de insertar la tercera. Las únicas escrituras de navegador de esta etapa fueron sobre ese almacén temporal. Las copias de bloques, las resoluciones del mapa y la restauración se comprobaron mediante pruebas automatizadas, no se afirman como recorridos visuales.

## Límites conservados

El diagnóstico original sobre validación de propiedades, renombrado por fan-out y guardado completo del índice sigue vigente; no se amplió esta etapa para resolver esos riesgos. La migración exige detener escritores por ese motivo. El valor numérico cero se conserva en almacenamiento/migración, pero el editor de celdas mantiene el defecto auditado al convertir una edición de cero en vacío; no forma parte de la identidad.

La herramienta no decide si dos bloques antiguos representaban bases separadas o vistas enlazadas. Asigna identidades distintas a los bloques y conserva el conjunto ambiguo para resolución expresa. Vincular fuentes entre bloques/páginas y copiar jerarquías completas queda fuera de esta entrega. No se inventariaron ni resolvieron las ambigüedades de los datos reales del usuario.
