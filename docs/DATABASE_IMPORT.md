# Importación privada JSON/CSV a bases nativas

20 de octubre de 2026. Ensayo sobre `feat/database-identity-stage1`.
En la fecha del ensayo no se había desplegado esta ampliación ni se habían importado datos en Atlas habitual.
Seguimiento único: [DATABASE_PLAN.md](DATABASE_PLAN.md), DB-IMPORT-01 a 05.

## Contrato implementado

En Páginas hay un botón «Importar base de datos JSON o CSV». El menú (…) de cada
base ofrece «Importar JSON o CSV…» para añadir a esa base o crear otra independiente.
Se reutilizan diálogo, foco, temas, fuentes, editor, propiedades y vistas nativas.
No se utiliza Notion ni se requiere una integración/autorización de Drive.

1. Subir JSON o CSV UTF-8 (BOM admitido), hasta8MiB.
2. Elegir **explícitamente** una colección de objetos mediante JSON Pointer.
   El selector muestra las rutas encontradas y sus tamaños; nunca concatena
   varias colecciones ni interpreta grupos candidatos como libros.
3. Examinar cinco registros y elegir título, ID/enlace de Drive, columnas y tipos.
   Campos de objetos anidados usan JSON Pointer escapado; arrays se mantienen
   completos. La prueba `/catalog/items` es **sintética**, no una descripción
   del archivo privado solicitado.
4. Validar: diagnósticos por fila, columna y tipo; duplicados diferenciados entre
   archivo, base existente y papelera. Cambiar configuración invalida la confirmación.
5. Confirmar: se revalidan pertenencia, esquema y duplicados dentro de una transacción
   SQLite. Si hay filas inválidas se rechaza **todo** el lote; no se importan parcialmente.
6. Ver el resultado, abrir la página nativa y descargar el informe JSON. El informe
   queda también en SQLite, recuperable por su enlace autenticado.

Tipos admitidos: texto, número, selección, multiselección, estado, fecha, casilla,
URL, correo y teléfono. Computados, relaciones, personas y adjuntos binarios no se
simulan. Selección/multiselección/estado nuevos crean opciones explícitas a partir
de valores válidos; una base existente exige propiedades/opciones ya compatibles.
La multiselección requiere un array real o texto CSV con un array JSON; no se
adivina cómo dividir nombres o grupos. El número acepta punto decimal y notación
exponencial, sin inferir separadores de miles. IDs siempre como texto o URL.
CSV permite coma, punto y coma o tabulación, selección manual o detección; rechaza
cabeceras duplicadas y filas con distinto número de celdas. Máximo5000 registros,
200 campos y20 niveles de objetos. No se trunca silenciosamente un lote.

## Conservación y privacidad

La clave canónica se extrae del ID de Drive o sus URL reconocidas. No se accede a
Drive ni se valida remotamente que el archivo exista. ID y enlace originales
permanecen como propiedades; `import_identity` guarda el ID canónico y
`import_original` el objeto original. El archivo completo, incluidos metadatos y
colecciones no seleccionadas, se conserva privado con SHA256 y sus bytes UTF-8/BOM.

La deduplicación por Drive es **por base destino**, incluidas filas en papelera:
se omite el registro completo sin modificar título, propiedades, notas, valoración,
progreso o cuerpo. Para registros antiguos sin metadatos de importación se utiliza
la columna de Drive que el usuario asigne. Entre bases independientes no se mezclan
pertenencias. Repetir el mismo archivo/configuración reutiliza el recibo anterior,
incluso después de subir otra copia del archivo; un inventario actualizado se
importa desde (…) de su base existente. No se fusionan autores ni grupos por nombre.
Datos provisionales conservan su estructura y sus indicadores; no se confirman.

Las vistas previas, archivos fuente y journals se guardan en
`DATA_ROOT/data/database_imports/`, nunca en static ni con rutas públicas. Directorio
0700 y cargas0600. La vista previa caduca a24h; no hay todavía recolector automático
de vistas expiradas. Los originales e informes aplicados se conservan para recuperación.
El respaldo del volumen debe incluir esta carpeta privada y el índice SQLite.
Se añadieron exclusiones de Git para ese almacén, `private-imports/` y el nombre
exacto del inventario en la raíz. El contexto de release excluye todo data/knowledge.
No deben guardarse inventarios con otros nombres dentro de rutas de código.

El journal describe sólo **archivos nuevos** y sus hashes antes de escribir. En
error normal se revierte SQLite y se retiran los archivos creados por ese intento.
Al reintentar después de una interrupción se limpian sólo archivos sin entrada
confirmada y con hash exacto del journal. Si cambiaron, se conserva todo y se
bloquea para revisión; nunca se restaura sobre registros anteriores. La transacción
serializa imports entre workers y el recibo evita aplicar dos veces el mismo lote.
La recuperación de journals pendientes se ejecuta al importar, no automáticamente
al iniciar Atlas. Mantener copia antes de una futura intervención manual.

## Evidencia y límites de esta ronda

-30 pruebas específicas pasan con datos sintéticos: selección anidada explícita,
  tipos, IDs/enlaces, arrays de autores provisionales, grupos separados, CSV con
  BOM/comillas/saltos de línea, cero/falso, duplicados/reintento, esquema/confirmación,
  registros antiguos y en papelera, privacidad/autenticación, rollback de disco y
  limpieza segura de journal interrumpido. No es el inventario del usuario.
- Suite final completa de servidor:451 aprobadas,36 avisos heredados de WeasyPrint.
  Incluye las30 pruebas específicas después de los guardas de integridad y casos
  de tipos del importador. Suite del editor aprobada; prueba adicional de informe y
  escape HTML aprobada. Compilación Vite aprobada.
- CUA Chrome en app nueva ligada sólo a127.0.0.1:5095: inicio de sesión sintético,
  Páginas → Importar, diálogo, foco y selector de archivo. `fileChooser.setFiles`
  fue bloqueado por la extensión: requiere «Allow access to file URLs». No se
  cambió ese permiso ni se eludió; se canceló el selector. **No se acredita todavía
  un recorrido completo de asignación/confirmación desde navegador.**
- Gitleaks sin hallazgos en el contexto limpio preparado. No se inspeccionó Notion
  ni se utilizó REA en esta ronda; no hacen falta para definir el formato privado.

## Inventario solicitado y preparación de despliegue

El archivo real fue localizado fuera del repositorio y leído sin modificarlo.
Se añadió el perfil explícito `books-drive-inventory-v1` para su versión1.0:

- Sólo `/archivos` aparece como colección importable:416 registros,416 IDs únicos.
-335 `grupos_candidatos` y416 `metadatos_drive_originales` quedan en el original
  privado archivado, nunca como libros adicionales. No se fusionan grupos.
-46 columnas con asignación explícita. Título y autoría desde el nombre quedan
  etiquetados como provisionales; `autores_verificados` sigue separado y vacío.
-`pdf_escaneado` y `ocr_disponible` desconocidos se conservan vacíos, sin convertir
  `null` en una casilla falsa. Cada objeto original conserva también sus nulos.
-Una versión desconocida se rechaza para revisión; campos adicionales permanecen
  en el original y no se incluyen silenciosamente como columnas.

Ensayo real por API autenticado en un DATA_ROOT nuevo y privado, sin datos de la
instalación habitual:416 páginas-registro y una página-base nativas. Se cotejaron
los416 objetos originales, IDs, enlaces,46 valores mapeados, orden y pertenencia.
El archivo fuente archivado coincide byte por byte y tiene permisos0600.
La primera aplicación tardó0,274s en este entorno; no es una promesa de producción.

Se editaron exclusivamente en esa copia notas, valoración, progreso y cuerpo de un
registro: repetir el archivo reutilizó el recibo; añadirlo a la base existente
omitió416 duplicados y no alteró ningún registro ni el cuerpo editado. Una segunda
base quedó vacía e independiente. Otro proceso Python comprobó persistencia e
`integrity_check=ok`. El archivo externo original conserva el mismo SHA256.
Resultados privados completos y copia ensayada:
`/tmp/atlas-books-real-trial-rh95uxfn/`; son temporales fuera de Git y no sustituyen
un respaldo permanente del Atlas habitual.

Revisión del navegador: CUA abrió la app aislada en127.0.0.1:5096 y completó el
inicio de sesión. La lectura posterior de la tabla quedó bloqueada por
`Page.createIsolatedWorld` timeout y después `Debugger unattached`. No se atribuye
al navegador la validación de los416 registros ni de Peek. Continúa pendiente el
recorrido visual completo del importador: la subida anterior requería el permiso
«Allow access to file URLs» de la extensión. No se eludió ni cambió ese permiso.

Preparación reversible: código y bundles locales; `tools/prepare_atlas_release.py`
genera fuera del repositorio un contexto explícito sin datos y su manifiesto. El
Dockerfile ya incluye todos los módulos Python; no se requiere migrar bases antiguas
para instalar la función. La tabla auxiliar de recibos se crea en la primera importación.
**Hay imagen local ensayada, sin aprobación ni publicación/activación en Fly**.
El caso real por API está ensayado; falta la comprobación completa de
subida/asignación y apertura desde navegador.

Para una eventual ventana autorizada: verificar el manifiesto e ID de la imagen
local ensayada, publicar únicamente esa imagen y registrar el digest del registro;
verificar respaldo actual completo (incluida la carpeta privada de importaciones), mantener secretos,
volumen y Tailscale; activar únicamente después de aprobación. Revertir siempre
conservando datos creados desde la activación: no restaurar ciegamente el respaldo
anterior sobre libros, notas o progreso nuevos. La primera importación en instalación
habitual requiere además confirmar su destino y asignación. No hacerla al desplegar.

Contexto de código actual preparado: `/tmp/atlas-books-profile-release-20261020/context` (131 archivos);
manifiesto SHA256 `c4b45b6dcd34e6652ebbe09789432f8866428a0946f0714ee61d4d3a4e5e51a5`.
Es un contexto local de preparación, no una imagen nueva desplegable ya aprobada.
[Resultados estructurados](ATLAS_DATABASE_IMPORT_VALIDATION.json).

Imagen local: `atlas-import-books:20261020`, ID `sha256:63d61e7e8e740e7a1907d3190b8cbd33e28cb71e132a3306475e050c89a8ca07`.
Es el ID local de configuración de imagen, **no un digest de registro publicado**.
La construcción original con apt se interrumpió únicamente en su contenedor de
prueba para evitar reinstalar dependencias sin cambios. Se reutilizó la base local
congelada `sha256:2facd34be5202eb39f21d3906788b06e3d1f89308a98a068136e3a3491053d82` tras cotejar SHA256 idéntico de requirements.txt.
`Dockerfile.offline`, logs, manifiesto e `image-validation.json` están fuera del
repo en `/tmp/atlas-books-profile-release-20261020/`. Se copiaron todos los archivos
del contexto limpio; no se añadieron secretos, datos ni inventario a la imagen.

El mismo ensayo real pasó nuevamente **dentro de la imagen final**, con red
inhabilitada, sistema raíz sólo lectura, UID1000, capacidades retiradas y original
montado sólo lectura. Otra copia privada en `/tmp/atlas-books-container-trial/`
contiene416 registros; importación0,301s, repetición0 nuevos, append416 omitidos,
anotaciones conservadas, persistencia en proceso nuevo, SQLite íntegro y original
sin cambios. Ningún contenedor de ensayo montó el volumen de Atlas habitual.
No se utilizó Fly para construir, publicar o activar. Antes de proponer activación
falta completar DB-IMPORT-01 desde navegador y obtener autorización explícita.

El contexto limpio pasó Gitleaks (131 archivos) y un cotejo de todos los IDs de
Drive del inventario: ninguno está en sus archivos de código. Sus hashes coinciden
con el manifiesto. El chequeo de espacios detecta espacios en literales del bundle
generado por Vite; no se modificaron esos literales como parte del importador.

## Comprobación visual breve posterior: scroll y edición

Se reutilizó la base de416 registros del ensayo, sin reimportar ni tocar Atlas
habitual. Herramienta: CUA/Chrome, app aislada127.0.0.1:5096. No se utilizó REA.

- Tabla cargada:416 filas de datos,417 incluyendo encabezado.
- Desplazamiento real mediante rueda: vertical hasta1922px y horizontal hasta3776px;
  al enfocar una celda del extremo derecho se alcanzaron6168px horizontales.
- Celda de notas QA: apertura del editor, cambio del texto y botón Listo. Después
  de recargar, la nota de prueba modificada reaparece y siguen las416 filas.
- Sin alertas de error visibles después de recargar. No se modificaron IDs,
  títulos, enlaces, esquema, orden ni cantidad de registros.
- Ambos scrolls se conservaron sin cambios: vertical del área de contenido y
  horizontal de la tabla. Medidas observadas:915px de alto disponible frente a
  15599px de contenido; tabla1578px de ancho frente a7951px de contenido.

Observaciones abiertas: la barra horizontal queda al pie de una tabla larga;
se conserva expresamente como pidió el usuario. La automatización sufrió timeouts
intermitentes de CDP (Input.dispatchMouseEvent y Runtime.evaluate), aunque se pudo
comprobar la edición guardada tras recargar. No se atribuyen esos timeouts a un
problema de rendimiento de Atlas. La inspección visual inicial se vio correcta;
no se acredita una medición sostenida de fluidez ni una revisión de todos los tipos.
La comprobación terminó tras validar scroll/edición/persistencia; la nota QA mantiene
el texto de prueba de esta ronda. No se introdujo virtualización ni cambios de
implementación, no se reconstruyó la imagen ni se repitieron suites completas.

DB-IMPORT-01 sigue parcial: tabla/scroll/edición comprobados, pero todavía faltan
subida, asignación y confirmación completas desde la interfaz. Esta revisión no
cierra ese recorrido ni los pendientes de activación de DB-IMPORT-05.
