# Diagnóstico de las bases de datos de Atlas

Fecha: 16 de octubre de 2026. Alcance: bloques de base de datos del editor,
propiedades de sus páginas-fila y API de persistencia. No incluye Finanzas,
lector, estilos, asistente ni cambios funcionales.

Código analizado: [`6e84f20503e379552fdc3a3d0a3a325ad96838c5`](https://github.com/Codevhn/mision_python/tree/6e84f20503e379552fdc3a3d0a3a325ad96838c5),
coincidente con `origin/main` al iniciar la revisión. Sólo se añaden este
informe, evidencia y pruebas de caracterización; la implementación y los bundles
permanecen sin cambios. Ninguna migración ni corrección se ha aplicado.

## Instrucciones y método

No se encontraron `AGENTS.md`, README de proyecto ni CONTRIBUTING en los ámbitos
revisados del repositorio. Se leyeron la CI existente
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), los requisitos Python,
[`tests/conftest.py`](../knowledge_base/tests/conftest.py), el manifiesto del
editor y la estructura de los informes existentes en `docs/`.

La CI prescribe Python 3.11 y `pytest knowledge_base/tests -q`. Se reutilizaron
Python 3.11.16, Node 24.19.0 y las dependencias instaladas; no se alteraron
requisitos, lockfiles ni configuración de despliegue.

Se revisaron especialmente:

- [`customBlocks.jsx`](../knowledge_base/editor-src/src/customBlocks.jsx):
  esquema, vistas, consulta de filas, creación, cambio de nombre/tipo y celdas.
- [`properties.js`](../knowledge_base/static/properties.js): panel de propiedades,
  tipos, copias locales y guardado por página.
- [`app.py`](../knowledge_base/app.py): creación de páginas, hijos, propiedades y
  persistencia del índice en SQLite.
- [`markdown.js`](../knowledge_base/editor-src/src/markdown.js): persistencia de
  bloques y estabilidad de identificadores al reabrir la página.

Las pruebas de API usan los directorios temporales de `conftest.py`. Chromium
usó otra instancia local, con `DATA_ROOT` temporal y datos ficticios. Se ejecutó
el bundle existente, sin reconstruirlo ni modificar los componentes. El fallo
HTTP 500 del ensayo de renombrado fue **inyectado**, no observado en producción.
No se accedió a datos del usuario ni se desplegó ningún cambio.

## Estado de REA y referencia de Notion

**REA no está disponible entre las capacidades expuestas en esta sesión.**
La comprobación del catálogo de herramientas dio 18 herramientas, ninguna
identificada como REA o reverse engineering, y no hay herramienta `tool_search`.
La lista de recursos no expuso un recurso o servidor REA y la lista de plantillas
fue vacía. Tampoco se encontró un ejecutable `rea` en el PATH. Esto describe la sesión, no la existencia de REA fuera de ella.

**No se analizó Notion.** No se abrió una base, una URL ni un workspace de Notion;
no hay capturas, trazas ni resultados de REA sobre un objetivo concreto. Los
comentarios del código que mencionan Notion no son evidencia de comparación.
Notion sigue siendo la referencia solicitada para una etapa posterior; las
propuestas de este informe son decisiones por evaluar para Atlas.

Cuando REA esté disponible, el objetivo de contraste deberá ser una página de
prueba concreta de Notion con dos bases independientes A/B, una segunda vista
de A y propiedades Estado, Ciudad y Prioridad. Habrá que registrar la URL/ID del
objetivo, acciones, capturas y resultados de aislamiento, filtros/orden y cambios
de propiedad. Ese trabajo queda **pendiente**, no realizado ni necesario para
confirmar los defectos internos de Atlas descritos abajo.

## Resultados

| Hallazgo | Resultado | Prioridad propuesta |
| --- | --- | --- |
| Dos bloques pueden compartir filas de la misma página | Confirmado por API y dos bloques reales en Chromium | P1: identidad y pertenencia |
| Un filtro y un criterio de ordenación por vista | Confirmado en esquema, controles y resultados de la vista | P2: capacidad funcional |
| Renombrado por fila y cambio de tipo sin migración | Confirmado con persistencia parcial, tipos incompatibles y presentación incorrecta | P1: integridad |

### 1. Las filas pertenecen a la página, no a una base identificada

En `customBlocks.jsx:452` se toma `window._currentEntryId`. `reload()`
(`614–626`) consulta `/api/entry/${pageId}/children` y conserva todos los
registros con `db_row`. No consulta por `block.id`, `database_id` ni otra
identidad persistente de base. `addRow()` (`809–827`) envía `parent_id` y
`db_row`, sin identificar qué bloque originó la fila.

En `app.py:1753–1787`, crear una página guarda `parent_id` y `db_row`.
`get_children()` (`2964–2993`) selecciona sólo por `parent_id`; el parámetro
hipotético `database_id` no se procesa y tampoco se devuelve una identidad de
base. Incluso enviar `database_id` al crear la fila no lo conserva.
La compatibilidad con registros antiguos considera fila una página sin bandera
`db_row`; ese fallback también debe contemplarse al diseñar la migración.

Reproducción en navegador: dos bloques, con vistas llamadas Base A y Base B,
mostraron ambos **Alfa, Beta y Gamma**, las tres páginas-fila del padre. Cada
bloque conserva su propio esquema/vistas, pero carga el mismo conjunto de filas.
Esto afecta al aislamiento entre bloques de una página; no se demostró una fuga
entre usuarios ni un fallo de autorización.

Matiz: no son copias independientes de las filas. Son los mismos IDs y páginas.
Editar o eliminar una de esas filas afecta al registro compartido. El comentario
inicial de `customBlocks.jsx` describe precisamente una tabla de hijos del padre;
por tanto, este comportamiento forma parte del modelo actual, aunque no permita
dos bases independientes en la misma página.

### 2. Los criterios nuevos reemplazan a los anteriores

`makeDefaultView()` y `parseSchema()` (`51–102`) modelan `filter` y `sort` como
objetos únicos o `null`. Sí existen múltiples vistas, con estado propio; eso no
supone múltiples criterios dentro de una vista.

La derivación (`1001–1015`) aplica una sola llamada a `rowMatchesFilter()` y un
comparador basado en una sola columna. Los controles (`1264–1347`) reemplazan el
objeto mediante `saveView({filter: ...})` o `saveView({sort: ...})`. No se encontró
un árbol AND/OR ni una lista ordenada de criterios de clasificación.

Prueba real:

1. Filtrar Estado = Terminado muestra **Gamma**.
2. Cambiar el filtro a Ciudad contiene Danlí muestra **Beta**, aunque Beta tiene
   Estado = No iniciado. El JSON pasa a `{colId: 'col_city', value: 'Danlí'}`;
   el criterio de Estado ya no está.
3. Ordenar Prioridad ascendente da **Beta, Gamma, Alfa**. Cambiar a Nombre
   ascendente da **Alfa, Beta, Gamma**. El JSON sólo conserva
   `{colId: '__title', dir: 'asc'}`.
4. La otra vista del primer bloque conserva `filter: null`; se verificó que el
   límite es por vista, no una sobrescritura de todas las vistas.

La limitación está confirmada; no es evidencia de cómo funciona Notion hoy.

### 3. Esquema y valores pueden quedar desincronizados

**Renombrado.** `renameColumn()` (`769–786`) cambia primero el esquema del
bloque. Después hace un `forEach` de PATCH independientes para las filas con la
propiedad. No espera un resultado conjunto, no comprueba `response.ok`, no
revierte y no tiene transacción que incluya esquema y filas.

En Chromium, al renombrar Estado → Progreso se enviaron tres PATCH. Se inyectó
500 en Beta y los otros dos devolvieron 200. El esquema del editor quedó como Progreso y
los nombres persistidos fueron **Progreso, Estado, Progreso**. El estado local
optimista no detectó el fallo. Esto reproduce una operación parcialmente aplicada,
sin afirmar que haya ocurrido ese error en el servidor del usuario.

**Cambio de tipo.** `changeColumnType()` (`790–802`) sólo guarda la definición
actualizada en el bloque; no convierte ni valida valores de las páginas-fila.
Al pasar Estado → Casilla se registraron **cero PATCH de propiedades**. Las tres
propiedades persistidas siguieron siendo `type: 'status'`, con cadenas
`No iniciado`, `No iniciado`, `Terminado`. Las tres casillas se mostraron
**marcadas**, por la conversión `!!prop.value` en `1077–1083`.

No es sólo una representación: `setCellValue()` (`847–859`) conserva los
metadatos de una propiedad existente al cambiar su valor. Puede guardar un
booleano sin actualizar su antiguo `type`. Por su parte, `properties.js:156–166`
elige el control con el tipo de la propiedad almacenada. La tabla y el panel de
la misma página pueden interpretar de manera distinta el mismo dato.

**Validación ausente.** `PATCH /api/entry/<id>/properties` (`app.py:2773–2782`)
asigna el cuerpo `properties` sin validar coherencia tipo/valor contra un esquema.
Cuatro ensayos devolvieron 200 y conservaron literalmente:

- `checkbox` con valor `'No iniciado'`.
- `number` con valor `'no es un número'`.
- `multi_select` con una cadena en vez de lista.
- `date` con un objeto en vez de fecha.

**Panel de propiedades.** `properties.js:36–58` mantiene una copia de las
propiedades y la guarda como array completo por página. `_inlineRename()`
(`570–590`) modifica el nombre de esa copia, sin actualizar el esquema del
bloque. Hay duplicación de nombre/tipo entre columnas y propiedades de filas,
aunque el enlace de la tabla se realiza por **ID**, no por nombre. El comentario
inicial que habla de correspondencia por nombre no describe ese lookup actual.

### Riesgo adicional dentro del renombrado: actualizaciones perdidas

`update_properties()` hace `load_index()` y después `save_index()`.
`save_index()` (`292–312`) reemplaza el índice entero dentro de una transacción
SQLite. Esa transacción protege cada escritura, **no** el ciclo completo de
lectura, modificación y escritura entre dos peticiones.

Una prueba determinista intercala dos instantáneas: A y B leen el mismo índice;
A guarda una propiedad en la primera fila; B guarda otra en la segunda con su
instantánea anterior. El resultado pierde el cambio de A. No depende de tiempos
ni de provocar concurrencia aleatoria en CI. La prueba justifica tratar la
consistencia del renombrado como problema de persistencia, no sólo añadir un
mensaje de error a cada PATCH.

## Pruebas y evidencia

Se añadieron **siete pruebas de caracterización** en
[`test_database_diagnosis.py`](../knowledge_base/tests/test_database_diagnosis.py).
Describen el comportamiento observado, incluidos defectos: que pasen **no**
significa que exista aislamiento o validación correcta. Al implementar el nuevo
contrato deben sustituirse sus expectativas actuales por pruebas de aceptación.
No se añadieron xfails ni se desactivaron comprobaciones existentes.

```bash
.venv/bin/python -m pytest knowledge_base/tests/test_database_diagnosis.py -q
.venv/bin/python -m pytest knowledge_base/tests -q
npm --prefix knowledge_base/editor-src test
```

Resultados finales: **7 pruebas específicas y 318 pruebas totales del servidor
aprobadas**, además de las pruebas existentes del editor. No se ejecutó un build:
no hay cambios de implementación que compilar.

La evidencia del navegador está en
[`DATABASE_AUDIT_EVIDENCE.json`](DATABASE_AUDIT_EVIDENCE.json). Incluye las filas
visibles de ambos bloques, los objetos de filtros/orden, respuestas del renombrado,
valores persistidos tras el cambio de tipo y ausencia de errores JavaScript.
Los esquemas/filtros se leyeron del documento actual del editor; las propiedades
de filas se consultaron por API para verificar su persistencia.
Son datos ficticios del ensayo, no una extracción de producción.

Para repetir la comprobación visual en una instancia aislada: crear una página
con dos bloques de base; en ambos usar columnas `col_status` (Estado/status),
`col_city` (Ciudad/text) y `col_priority` (Prioridad/number). Crear las filas Alfa
(No iniciado, Lima, 2), Beta (No iniciado, Danlí, 1) y Gamma (Terminado, Lima, 1).
Comprobar los pasos de las secciones 1–3; en el renombrado interceptar sólo el
PATCH de Beta con 500. Consultar luego cada fila por API para distinguir el
estado optimista del estado persistido. Restaurar la instancia temporal al acabar.

## Próximo paso propuesto; todavía no implementado

**Primero: cerrar el diseño de identidad y migración de datos.** La siguiente
entrega debe especificar el contrato de una base independiente, su identidad
persistente, la pertenencia de cada fila y el tratamiento de las bases antiguas.
No conviene empezar por añadir filtros sobre filas que aún no están aisladas.

1. Definir una identidad estable de base distinta de `parent_id`. No usar sólo
   `block.id`: `markdown.js:243–248` genera otro ID al importar y `421–422`
   serializa los datos del bloque sin ese ID. Una prueba con dos importaciones
   del mismo Markdown confirmó IDs diferentes. `parseSchema()` también devuelve
   únicamente columns/views/activeView: añadir un campo al JSON sin adaptar su
   lectura/escritura no garantiza preservarlo.
2. Diseñar migración versionada, respaldo y reversión. Con dos bloques antiguos
   y los mismos hijos no se puede inferir sin ambigüedad a cuál pertenecía cada
   fila. Preservar el contenido y resolver esa ambigüedad explícitamente; no
   repartir ni duplicar filas silenciosamente. Especificar también si habrá
   bloques enlazados que compartan deliberadamente una misma base.
3. Definir propiedades con ID estable y una fuente de metadatos coherente.
   Proponer una operación atómica de esquema: validar y convertir tipos con una
   política explícita, informar valores no convertibles y conservar o revertir
   la operación completa ante fallo. Evitar el fan-out de renombrado por filas
   y corregir el guardado que pierde actualizaciones de otras peticiones.
4. Después, diseñar varios filtros con operadores y agrupaciones AND/OR, y una
   lista priorizada de ordenaciones por vista; migrar el objeto único actual
   sin cambiar los resultados de vistas existentes.

Criterios de aceptación para esa futura implementación: dos bases independientes
no mezclan filas; IDs sobreviven guardar/reabrir; datos heredados se conservan;
renombrado y conversión fallidos no dejan estados parciales; API rechaza valores
incompatibles; ediciones concurrentes no pierden cambios; filtros compuestos y
ordenaciones secundarias funcionan y se guardan por vista. Toda comparación de
paridad con Notion seguirá pendiente de evidencia sobre un objetivo real.
