> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Evidencia de editor y Notion Native — 16 de octubre de 2026

Este informe documenta resultados; la única lista de requisitos y estados es
[DATABASE_PLAN.md](DATABASE_PLAN.md). Rama conservada: `feat/database-identity-stage1`.
Se consolidaron primero 94 requisitos con criterios, evidencia, límites y compromiso.
El respaldo previo está en `/tmp/atlas-native-round-baseline-hx5_1xtm`: 112 archivos,
manifiesto SHA256, copia de Markdown y respaldo SQLite consistente del demo.

## Cambios y causas comprobadas

**Alineación:** la referencia anterior centraba los controles sobre la caja del
bloque y fijaba 28 px de altura. Esa caja incluye márgenes y varias líneas; no
representa la primera línea. `blockAlignment.js` mide el primer fragmento de texto
mediante DOM Range y convierte sus coordenadas a las de Floating UI, incluida la
escala del contenedor. Los bloques vacíos usan sus medidas y estilo calculado.
`AlignedSideMenuController.jsx` se comparte entre página y Peek. No hay offsets
por nivel de encabezado, tema ni tamaño de fuente.

Además, el controlador nativo añadía un observador que ocultaba el asa ante
cualquier scroll de ancestros, incluido `scrollIntoView` al enfocar antes del clic.
Se retiró ese cierre redundante: GenericPopover conserva su actualización de
posición con Floating UI. Se mantienen hit-testing, inserción, acciones, freeze y
arrastre nativos. La revisión final pudo abrir Color y arrastrar sin desprender el
control al aproximarse al menú.

**Catálogo:** [DATABASE_BLOCK_CATALOG.md](DATABASE_BLOCK_CATALOG.md) describe una
única definición para (+), slash y conversiones compatibles, con Párrafo primero,
25 definiciones y estilos compartidos. Insertar y convertir conservan su semántica.
Los destinos incompatibles se filtran según contenido e hijos, evitando perder
tablas, multimedia, identidad DB o estructura. Se conservan acciones propias y se
añade Duplicar real. La revisión detectó y corrigió pérdidas previas de H5/H6,
marcadores Markdown literales y bloques multimedia en el serializador. El esquema
actual no contiene callout: no se presenta como disponible.

**Tema:** [DATABASE_NOTION_NATIVE_THEME.md](DATABASE_NOTION_NATIVE_THEME.md)
describe tokens centrales, variantes oscura/clara, iconos monolineales y adaptación
de módulos propios. Se preservan los temas existentes, marcos guardados y preferencias
por página. Se neutralizaron variables locales y tamaños `!important` del Peek que
impedían heredar fuente/paleta. El selector y la paleta de comandos identifican su
Peek propietario para que sus portales no provoquen cierre exterior accidental.
Cambiar tema actualiza atributos; no remonta el editor.

## REA real y procedencia

Se consultó primero la evidencia anterior. Se leyó el endpoint vigente de
`DevToolsActivePort` y se reutilizó exclusivamente el WebSocket de `127.0.0.1:9222`.
Herramientas ejecutadas:

| Herramienta REA | Resultado aprovechado |
| --- | --- |
| `list_browser_targets` | Identificó el target Notion abierto; evidencia `ev_90f833c64e5076eb95a64a9ba0bd654e8dc4de94f7f8275c711be4b85419ee29`. |
| `inspect_web_page` | Primer intento concurrente: `provider_timeout`, descubrimiento CDP superior a 10000 ms. Reintento secuencial correcto: 1385 nodos, evidencia `ev_dfc1eaa07fbe08d099cf821756e597c1bdc2501fe20b4fd072c7c6e9c4a988e0`. |
| `capture_web_screenshot` | Captura real 1888×879, evidencia `ev_35339b51b22ea7a3daaa32acb84cd810eb2f68806d9d4ed5a6740bdc84763626`. |

JSON de REA (`NOTION_NATIVE_REA_EVIDENCE.json`, evidencia/herramienta local no publicada) y
captura de Notion (`notion-native-rea-reference.png`, evidencia/herramienta local no publicada) conservan procedencia y límites.
La captura y árbol sustentan superficies oscuras neutras, controles superiores
compactos, título/properties y separación discreta. Los colores/tamaños se estimaron
visualmente: REA no extrajo CSS ni midió el centro de líneas de Notion. No se pulsaron
controles ni se escribieron datos en Notion durante esta ronda. CUA se utilizó para
interactuar y medir **Atlas**, no se atribuyen esas acciones a REA.

## Revisión interactiva y visual de Atlas

Demo reanudado con sus datos existentes en `127.0.0.1:5059`. Se duplicó exclusivamente
el registro sintético anterior para trabajar sobre `record-96d2f869464d404a`, ahora
**Prueba Native — controles y catálogo · guardado**. Los resultados geométricos y
los diseños recorridos están en [ATLAS_NATIVE_EDITOR_VALIDATION.json](ATLAS_NATIVE_EDITOR_VALIDATION.json).

| Comprobación | Resultado observado |
| --- | --- |
| H1–H6 y párrafo en Peek | Diferencia entre centro del primer fragmento y centro del asa: de −0.19 a +0.32 px. H1 y H2: 0 px. Antes, H1 mostraba aproximadamente 20 px de diferencia. |
| Texto multilínea y scroll | El asa sigue la primera línea, no el centro del bloque; lectura previa de multilínea: +0.32 px. Se recorrieron encabezados inferiores tras desplazar el Peek. |
| Escala CSS 125/150 % | Centros 548.875/548.75 y 658.75/658.5 px respectivamente: menos de 0.3 px de diferencia. La escala se restauró a 100 %. |
| (+) y slash | Inserción real de «Insertado con (+)» y «Insertado mediante slash», guardadas y reabiertas. Párrafo aparece primero en ambos. |
| Conversión | H1→H2 conservó el ID montado `bmvbvd1n0w`; deshacer restituyó H1. Posteriormente el párrafo insertado pasó a H2 y persistió tras cerrar/reabrir. Los IDs de bloques reconstruidos desde Markdown no se presentan como persistentes entre montajes. |
| Asa y acciones | Clic real abrió acciones y Color, movimiento hacia menú sin cerrar Peek. El menú mantiene eliminar, duplicar y color. |
| Arrastre físico | Se movió A tras C y, después del ajuste final de estabilidad, B tras A. Orden final **C,A,B** verificado en Peek reabierto, página completa y Markdown exportado. |
| Tema con edición | Native oscuro→Naranja Ámbar conservó Peek, título editado y contenido. Native claro→oscuro conservó Serif, texto pequeño y ancho completo. No se cerró ni recreó el documento. |
| Preferencias | Serif se comprobó como Georgia; Mono como SFMono-Regular/Consolas a 30 px en H1. Se restauraron Predeterminada, pequeño desactivado y ancho completo desactivado en la copia. |
| Persistencia y portales | Recarga conservó Native. Ctrl K→Cambiar tema funcionó desde Peek. Menú de propiedad oscuro: fondo #252525/texto #e3e3e0; menú claro: blanco/texto #37352f. Exportación recibió fondo/campos oscuros; Tab pasó a Contenido. |
| Vistas compartidas | Se abrieron Tabla, Board, Galería, Lista y Dashboard en Native; representaciones diferentes y fuentes conservadas. Se volvió a Todo. No se afirma revisión visual exhaustiva de las once vistas. |
| Cierre exterior | Clic en encabezado de tabla cerró Peek; al reabrir conservó conversión, texto y orden C,A,B. Los menús propios permanecieron utilizables. |
| Anchos efectivos | Iframe del mismo origen a 1200,900,640,390 px. A 390, documento y Peek midieron 390 px, contenedor de tabla 316 px y columnas conservaron scroll interno (~975 px), sin ampliar la página. |

La prueba responsive usa `/__demo__/responsive`, ruta registrada **sólo** por
`tools/run_database_identity_demo.py`. No se rebajó `X-Frame-Options: SAMEORIGIN`.
El banco de prueba permite elegir ancho y escala CSS, restaurados a 1200 px/100 %.
Un intento con Ctrl+plus no cambió innerWidth ni DPR: **zoom nativo del navegador
no verificado**, y no se confunde con la escala CSS comprobada. Tampoco se acredita
con esta matriz una revisión táctil o de todas las combinaciones de sidebar/widgets.

Capturas: antes (`atlas-native-alignment-before.png`, evidencia/herramienta local no publicada),
acciones/color (`atlas-native-block-controls.png`, evidencia/herramienta local no publicada), claro (`atlas-native-light-menu.png`, evidencia/herramienta local no publicada),
tabla390 (`atlas-native-mobile-table.png`, evidencia/herramienta local no publicada), Peek390 (`atlas-native-mobile-peek.png`, evidencia/herramienta local no publicada),
escala150 (`atlas-native-zoom-150.png`, evidencia/herramienta local no publicada), resultado final (`atlas-native-final-peek.png`, evidencia/herramienta local no publicada).

## Artefactos y conservación

La UI preparó la exportación sin archivos. Se inspeccionó además el ZIP obtenido
del mismo endpoint con opciones explícitas (`markdown_csv`, `current`, `no_files`,
sin subpáginas): `/tmp/atlas-native-export.zip`. Manifest indica `opened_record`,
una página y ningún hermano de la DB padre. Markdown conserva propiedades, H5/H6
y orden C,A,B, sin referencia activa a la imagen. Los 11 contratos de exportación
comprueban también bytes multimedia locales incluidos y exclusión sin modificar
la fuente. No se afirma que la captura de un aviso de descarga por sí sola pruebe
el contenido del archivo, ni que los recursos remotos ya se incorporen.

Comparación final con el respaldo: los 19 IDs anteriores siguen presentes; sus
metadatos son iguales excepto marcas de visualización/actualización. Sus cuerpos
son iguales; el archivo de la página contenedora sólo cambia `_schema_version`
de 71 a 76 al recorrer las vistas, con columnas, vistas y configuración idénticas.
Hay 21 entradas: la copia QA y un registro nuevo vacío `record-f5c8498c47b34551`.
No se estableció el origen de ese registro vacío y se conservó. No se eliminaron
registros preexistentes ni se restauró sobre escrituras ajenas.
Los 112 archivos del manifiesto inicial siguen presentes. No se migraron datos
reales, cambiaron permisos de Notion, ni se hizo commit, push o despliegue.

## Pruebas ejecutadas y límites que permanecen abiertos

- Backend completo: **371 passed, 41 warnings**, 9.00 s. Incluye identidad,
  aislamiento, migración, esquema, Dashboard, acciones y 11 pruebas de exportación.
  Los avisos corresponden a datetime/contratos previos de WeasyPrint.
- `npm test`: suite frontend aprobada, incluidos modelo/editor real, catálogo,
  serialización, hit-testing, alineación, temas, vistas y Dashboard.
- `npm run build`: aprobado después del ajuste final del controlador; 1127 módulos,
  CSS301.39kB y JS4506.42kB. Sin cambios de dependencias de runtime.
- Tras el ajuste final se repitieron pruebas de geometría/temas y revisión real
  de asa, arrastre, conversión, cierre/reapertura y página completa.
- Comprobación final: `git diff --check` sin diagnósticos en fuentes/documentos
  (bundle JS generado excluido); 76 archivos de texto sin seguimiento comprobados
  mediante `git diff --no-index --check /dev/null`, sin errores de espacios.
  Los 94 IDs son únicos y todos los enlaces del plan apuntan a documentos existentes.
- `ss -ltnp` confirmó el demo en `127.0.0.1:5059` y Brave en
  `127.0.0.1:9222`, sin escucha de esos servicios en interfaces de red.

Las pruebas no cierran fidelidad visual general. Siguen abiertos, con IDs en el
plan, la cobertura visual/teclado de todos los módulos/portales/temas, zoom nativo,
responsive avanzado y volumen, resize libre de widgets, recursos remotos en
exportación, fórmulas completas, constructor de layouts y colaboración. La variante
clara es adaptación de Atlas; no se inspeccionó Notion claro. Las integraciones
externas y trabajo sobre datos reales siguen aplazados expresamente por el usuario.

Para revisar: demo habitual, botón **◐ → Notion Native** o **Notion Native Claro**.
Abrir la copia QA mediante OPEN, recorrer sus H1–H6 y probar (+), slash y asa.
Se puede volver a cualquier tema anterior en el mismo selector. La contraseña del
demo sigue siendo `atlas-db-demo`.
