> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Ronda de revisión: superficie, Peek, exportación y Dashboard

16 de octubre de 2026. Rama `feat/database-identity-stage1`. Se conservaron los
cambios locales anteriores. Respaldo de 86 archivos y manifiesto fuera del repo:
`/tmp/atlas-review-round-baseline-b93fx3x4`; incluye una copia SQLite consistente
del demo. Sin commit, push, despliegue ni migración de datos reales.

## Resultado implementado

| Prioridad | Resultado | Evidencia / límites |
| --- | --- | --- |
| Superficie | Se elimina el marco Centinela sólo de las páginas y sus espacios reservados. Editor al ancho disponible; párrafos hasta 780 px, bloques amplios sin ese límite. La tabla conserva anchos y desplazamiento horizontal. | [Detalle](DATABASE_EDITING_SURFACE.md). A 1888 px de viewport: superficie de página 1658 px y DB 1578 px; con Side Peek, la tabla dispone de aproximadamente 798 px y hace scroll. |
| Relacionadas | Se retira la presentación y su cargador; se conserva el API y todos los datos de páginas, etiquetas, relaciones y referencias. | Era una recomendación por jerarquía, etiquetas y términos, no una relación explícita ni una lista de backlinks. No se coloca un reemplazo lateral. |
| Controles del Peek | Se reutiliza el editor completo. (+), clic del asa, submenú de colores y arrastre real comprobados. | Tres correcciones: selección del editor frontal entre editores superpuestos; altura del control acorde al bloque; menú por encima del Peek y scroll limitado a conversiones para no recortar submenús. |
| Menú del registro | Buscador y tipografías conservados; acciones agrupadas según la referencia; una sola entrada Exportar…; última edición y palabras. | Se omiten funciones de colaboración/IA que Atlas no ofrece. El texto del contador describe palabras en Markdown. |
| Exportar | Diálogo con formatos, contenido, vistas, subpáginas y carpetas dependientes; ZIP con manifiesto y alcance explícito. | [Contrato y límites](DATABASE_EXPORT_OPTIONS.md). Markdown & CSV, HTML, PDF y JSON de Atlas producen archivos reales. Default view = primera vista guardada es una adaptación local explícita. |
| Controles / vistas | Selectores y opciones usan colores del tema y esquema claro/oscuro heredado; foco visible. Configuración por entradas y submenús con regreso. | Separada de Personalizar diseño de los registros. Comprobado Board → Diseño y Tabla → Diseño. |
| Dashboard | Constructor con uso/edición, fuentes canónicas, vistas existentes o propias, tamaños, arrastre/flechas, duplicación, retirada, filtros/orden/grupo y Peek. | [Detalle](DATABASE_DASHBOARD_BUILDER.md). Configuraciones de vista copiadas al widget, registros vivos. Redimensionado discreto, no libre con tiradores. |

## REA utilizado realmente

Se ejecutaron `mcp__rea__list_browser_targets`, `mcp__rea__inspect_web_page` y
`mcp__rea__capture_web_screenshot`. Conexión al WebSocket leído de
`DevToolsActivePort`, en `127.0.0.1:9222`. No se cambió la configuración ni se
expuso el puerto. Las capturas y los árboles accesibles son observación real de
Notion; la mera configuración del servidor no se usa como prueba.

El usuario abrió los primeros diálogos. CUA abrió/canceló menús y desplazó el
contenido; REA capturó sus estados. `capture_browser_scenario` no se utilizó:
la versión instalada exige endpoint HTTP para ese flujo, mientras esta conexión
autorizada funciona mediante el WebSocket publicado por el navegador. No se
reintentaron URLs HTTP que ya habían fallado. No se exportó contenido de Notion,
no se editaron registros y se canceló la previsualización de diseño sin aplicarla.

Evidencia conservada con IDs y nodos pertinentes, sin inventario de páginas del
workspace ni UUID de conexión: JSON de esta ronda (`NOTION_REA_REVIEW_ROUND_EVIDENCE.json`, evidencia/herramienta local no publicada).

| Observación | Evidencia REA |
| --- | --- |
| Formatos PDF, HTML, Markdown & CSV | `ev_682105c15ead7553f538a21e83f259482fbb4886befaa4ad80d3e3432b9136db` |
| Current view / Default view | `ev_ffe7ef389dede6acc8e552e5f8c16d0bedd888e928d11291da9634eb26280461` |
| Everything / Exclude files and images; carpetas deshabilitadas sin subpáginas | `ev_2c8eec4e6ffa3b2381fe6bce2f503809b22d23755483a9fd80dd367c128ef312` |
| Menú completo de acciones del registro | `ev_e9a40e12fcf287377596aa848c05daba093736c6b671686fc4908bc89c924b20` |
| Parte inferior tras desplazamiento real | `ev_4516f04fd1860bcf815f63a6703fc70dde1e74d0ac7e57dbf91a26ed0395e859` |
| No backlinks en diseño de página, Simple/Tabbed y propiedades | `ev_ead918b317b160ed17e028273f86ec5552a0a5170fc365351a5c6206f512134a` |
| Settings de vista: Layout, Property visibility, Filter, Sort, Group y ajustes de fuente separados | `ev_0de7f5ffb704644364d15a3034d2f2479edc5c908be7514c4bed779a44336f93` |

El árbol accesible contiene opciones fuera del área visible: su presencia por sí
sola no demuestra que se desplazó el menú. Se contrastó con scroll real del
listbox, altura visible 703 px frente a 828 px de contenido. En la previsualización
de diseño, pulsar No backlinks abrió ajustes del encabezado; no se verificó una
lista poblada ni sus interacciones. No se presenta esa comprobación como una
equivalencia del panel Relacionadas de Atlas.

La [documentación oficial de backlinks](https://www.notion.com/help/create-links-and-backlinks)
describe referencias de enlaces/menciones a páginas. Las
[relaciones](https://www.notion.com/help/relations-and-rollups) conectan registros
mediante propiedades explícitas. El API antiguo de backlinks de Atlas utiliza
coincidencias de título y tampoco establece por sí solo un índice exacto de
menciones. Queda pendiente definir ese índice si se desea equivalencia canónica.
Se mantienen las Relaciones explícitas existentes bajo el contenido.

La [documentación oficial de exportación](https://www.notion.com/help/export-your-content)
orienta formatos, recursos y descendientes. No precisa en este caso el significado
exacto de Default view; la interfaz observada tampoco lo explica. La
[documentación de dashboards](https://www.notion.com/help/dashboards) es la referencia
funcional del constructor, no una pantalla de suscripción.

## Validación efectuada

- Backend: **370 pruebas aprobadas**, incluyendo identidad, aislamiento, migración,
  registros, Dashboard y exportaciones. Avisos: fechas UTC antiguas del proyecto
  y contrato del cargador WeasyPrint; no fallos.
- Frontend: `npm test` aprobado, incluidos round-trip de Markdown, recuperación de
  guardado, editor frontal, representaciones y modelo/SSR del Dashboard.
- `npm run build`: aprobado, 1123 módulos. JavaScript estático verificado con
  `node --check`. Fuente y documentos sin errores de espacios.
- El bundle generado conserva tabuladores literales de una dependencia de HTML;
  `git diff --check` los señala también en el respaldo anterior. No se recortan
  cadenas de la dependencia. En archivos nuevos, `git diff --no-index --check
  /dev/null archivo` devuelve 1 por las diferencias; sin salida no es un error
  de espacios. Se comprobaron 59 fuentes/documentos nuevos sin diagnósticos.
- Revisión real en navegador: (+) insertó un párrafo escrito como D; el asa abrió
  acciones y Color mediante clic; arrastre nativo A → después de C produjo
  **B, C, A, D**. El orden persistió tras clic exterior, reapertura y página
  completa. Se comprobó el ID de la copia antes de editar.
- Durante la primera secuencia se editó el registro ficticio original por una
  transición asíncrona de duplicación. Se restauraron exclusivamente título y
  cuerpo desde historial. Comparación con el respaldo: propiedades, identidad,
  pertenencia, contenido y orden originales conservados; sólo cambian metadatos
  de última vista/edición. La prueba final se repitió en
  `record-24f31fc30fb54d4a`, «Prueba de arrastre — revisión».
- Exportar desde el diálogo preparó correctamente el ZIP. El evento download del
  conector agotó su espera; no se usa como prueba de un archivo guardado por el
  navegador. Se obtuvo el mismo artefacto por POST al API local y se abrió con
  `zipfile`: un Markdown y manifest, propiedades correctas y B,C,A,D; ninguna fila
  hermana. En pruebas temporales se abren ZIP/CSV/HTML/PDF, se comparan bytes de
  medios, exclusiones, carpetas, filtros, orden y enlaces; PDF con PyMuPDF.
- Dashboard: se crearon tabla A y galería B; tamaño 8/12 y 4/12, altura 260 px;
  duplicación y retirada sin copiar filas. Flechas y arrastre físico reordenaron
  widgets. Filtro global Nombre contiene Alfa, vinculado explícitamente a ambas
  fuentes, mostró A=1 y B=0; persistió tras recarga. Quedó desactivado para revisar
  ambos widgets. Peek abrió `beta-sólo-b`; cambiar 8.5 a 9 actualizó la galería y
  se restituyó 8.5. Segunda recarga conservó orden A/B, tamaños y dos widgets.
- Temas Aero Ámbar y Porcelana: texto/fondo legibles y `color-scheme` dark/light
  en controles; Tab mueve el foco. Se restituyó Aero Ámbar. No se afirma cobertura
  de todos los temas, lectores de pantalla o dispositivos. El ajuste de viewport
  del conector no alteró el viewport de esta pestaña; la prueba responsive a
  900 px queda pendiente. No se modificó la navegación global para forzarla.

Capturas actuales: tabla amplia (`atlas-review-wide-table.png`, evidencia/herramienta local no publicada),
menú del asa (`atlas-review-block-menu.png`, evidencia/herramienta local no publicada),
orden persistido (`atlas-review-drag-persisted.png`, evidencia/herramienta local no publicada),
exportación (`atlas-review-export.png`, evidencia/herramienta local no publicada), Dashboard (`atlas-review-dashboard.png`, evidencia/herramienta local no publicada).

## Cómo revisarlo y límites pendientes

Demo conservado: <http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento>.
Contraseña temporal `atlas-db-demo`. Tabla Todo → copia «Prueba de arrastre —
revisión» → OPEN; ahí se prueban (+), asa, arrastre y Exportar…. En Dashboard,
Editar permite configurar, añadir, mover, duplicar y quitar widgets. Filtros
globales conserva una condición desactivada para probar su correspondencia.

Para reanudar sin regenerar ni borrar los datos del demo:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --resume-demo /tmp/atlas-database-demo-hjrjs3m0
```

Límites explícitos: archivos remotos no se descargan y constan en el manifiesto;
CSV/HTML representan datos de la vista, no una captura de Board; resize de widgets
discreto; configuración de vistas copiada al widget y no enlazada en vivo; no se
anidan dashboards/formularios ni widgets libres de texto. Falta revisión de
responsive estrecho, volumen y todas las combinaciones de temas. Colaboración,
IA y equivalencia completa del índice de menciones no forman parte de esta ronda.
La paridad general con Notion sigue siendo una etapa abierta.
