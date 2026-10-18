# Exportación configurable de registros

Estado: implementada y validada en almacenes temporales. Sin migración ni cambios
sobre datos reales. `GET …/rows/<id>/export` se conserva por compatibilidad;
el diálogo nuevo utiliza `POST …/rows/<id>/export`.

## Referencia y adaptación

La inspección REA de esta ronda confirmó los formatos PDF, HTML y Markdown & CSV,
las opciones Current view / Default view, Everything / Exclude files and images,
y los interruptores de subpáginas y carpetas (el segundo depende del primero).
La evidencia concreta y las herramientas ejecutadas se registran en el informe
REA de la ronda; este módulo no realiza ninguna llamada a Notion.

La interfaz observada no explica qué significa exactamente Default view. Atlas
lo define explícitamente como **la primera vista guardada** de cada base incluida.
Current view corresponde a su `activeView` persistida. Esto es una adaptación de
Atlas, no una equivalencia demostrada con Notion. No se exportan todas las vistas.
JSON se conserva como formato adicional útil de Atlas.

## Alcance y resultados reales

- La raíz siempre es el registro abierto: título, propiedades canónicas incluidas
  las calculadas, propiedades conservadas tras un traslado y cuerpo.
- Nunca se recorre automáticamente su DB padre ni se añaden sus filas hermanas.
  Una propiedad Relación puede mostrar sus referencias, pero no amplía el alcance.
- Las DB **contenidas en el cuerpo** se exportan como tablas y CSV con los
  registros de esa fuente exacta; se aplican los filtros, orden y propiedades
  visibles de la vista elegida. La agrupación y el diseño original se conservan
  como configuración en el manifiesto; no se reproduce visualmente un Board en
  el archivo. La búsqueda transitoria de la barra no es un filtro persistido.
- Sin subpáginas, esas tablas/CSV contienen datos pero no los cuerpos individuales
  de sus registros. Con subpáginas, se incluyen los cuerpos de las filas que
  sobreviven a la vista elegida y las páginas descendientes ordinarias reales.
- Carpetas organiza cada descendiente bajo su página; sin carpetas todos los
  documentos quedan al mismo nivel. Se conserva una carpeta común `assets/`.
  Los nombres se generan saneados, con un hash estable del ID
  para distinguir títulos duplicados. Enlaces Markdown, vínculos `?open=…`,
  wikilinks de título no ambiguo y enlaces CSV apuntan a rutas relativas incluidas.
- Markdown & CSV genera `.md` más `.csv`; HTML genera documentos HTML reales y
  tablas; PDF reutiliza el renderizador de impresión de Atlas y WeasyPrint para
  producir PDFs reales con fuentes locales e imágenes incluidas; JSON preserva
  metadatos y valores estructurados, cuerpo y configuración de DB interiores.
- Todos los formatos descargan un **ZIP**, también PDF y HTML. El manifiesto
  `manifest.json` identifica el documento raíz (`entrypoint`), páginas, fuentes,
  vista elegida, filas, archivos y omisiones. Así el contenido asociado no queda
  implícitamente fuera de una descarga de un solo documento.

## Archivos e imágenes

Everything copia los bytes de adjuntos de `data/database_files` y recursos locales
reconocidos bajo `static/covers`, incluidos los usados por propiedades Archivo,
imágenes del cuerpo y portadas con URL. Las referencias se reescriben hacia los
archivos del ZIP. No se inventa un formato de descarga para gradientes de portada.

Exclude files and images elimina las referencias activas de imágenes/medios y
adjuntos reconocidos del cuerpo, las tablas y las propiedades de archivo. Los
textos de sustitución indican la exclusión. Los enlaces web ordinarios de una
propiedad URL o del texto siguen siendo enlaces; no se consideran adjuntos.

**Límite explícito:** no se descargan imágenes ni archivos remotos. Se registran
en `manifest.omitted` con motivo `remote_media_not_fetched`; también se registran
archivos locales ausentes o rutas locales no reconocidas. El encabezado
`X-Atlas-Export-Omissions` permite al diálogo avisar antes de guardar la descarga.
No debe interpretarse Everything como inclusión garantizada de recursos remotos.
Las representaciones remotas de archivo se detectan por su uso como imagen o
extensión de archivo conocida; una URL web sin extensión se conserva como enlace.

## Integridad y límites

La exportación lee bajo el mismo bloqueo que las operaciones de DB, no escribe
metadatos, cuerpos ni archivos fuente. Rechaza ciclos, rutas de recursos fuera del
almacén permitido, más de 200 páginas, más de 5000 registros por DB, páginas de más
de 2 MB, adjuntos de más de 20 MB o un total de contenido/artefactos de más de 50 MB.
El renderizador PDF tiene un cargador restringido a recursos del propio archivo y
fuentes incluidas por Atlas: no accede libremente a la red ni al sistema de archivos.

La ordenación textual usa claves Unicode con segmentos numéricos, por lo que los
empates de caracteres acentuados pueden diferir del colador español del navegador.
Se mantienen las reglas de filtro, dirección, claves múltiples y orden manual.
No es un paquete de restauración completa de la aplicación; conserva los valores y
el contenido del alcance solicitado y no incluye otros módulos de Atlas.

## Validación

`knowledge_base/tests/test_database_export.py`: **10 pruebas aprobadas**.

Se abren los ZIP y se inspeccionan CSV, enlaces, estructuras con/sin carpetas,
filtros/orden por vista, nombres duplicados, aislamiento de la DB padre, bytes de
adjuntos y exclusión real. Los PDF se abren con PyMuPDF: se comprueban texto,
propiedades y presencia/ausencia de imágenes. Se verifica HTML renderizado, omisión
de medios remotos y errores de opciones, pertenencia y tamaño. Los ejemplos de DB, medios y enlaces dentro de fences, código indentado y código
inline se preservan literalmente: no se interpretan como recursos ni amplían el
alcance. Las omisiones se deduplican por URL y motivo, por lo que el aviso cuenta
recursos distintos. Las pruebas usan almacenes temporales y no modifican el demo
del usuario.

WeasyPrint 68.1 emite un aviso de deprecación sobre el contrato `dict` de su cargador
de URL personalizado; la versión está fijada en los requisitos actuales y el
resultado generado se verifica. Una actualización a WeasyPrint 69 deberá adaptar
ese contrato.

## Revisión integrada de esta ronda

Validación visual, evidencia REA, pruebas y límites finales en [DATABASE_REVIEW_ROUND.md](DATABASE_REVIEW_ROUND.md).

## Actualización funcional del17 de octubre

La limitación histórica de recursos remotos sin descargar queda sustituida por
la descarga pública HTTP(S) limitada de DB-EXP-05. [Validación y límites](DATABASE_FUNCTIONAL_VALIDATION.md#etapa4-exportación).
Los recursos autenticados/privados o fallidos conservan URL/motivo en manifiesto;
no se transmite la sesión de Atlas/Notion. Excluir archivos no inicia esa descarga.
La red no mantiene bloqueado el índice. DB-CHECK-02 continúa sin verificar por
la falta de ruta observable de la descarga del navegador.
