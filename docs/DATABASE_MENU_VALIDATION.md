> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Validación de menús compartidos de Tabla y Peek

17 de octubre de 2026 · rama `feat/database-identity-stage1`.
La lista principal y los estados están en [DATABASE_PLAN.md](DATABASE_PLAN.md).
Este informe registra evidencia; no añade un plan ni amplía el alcance.

## Conservación y alcance

Antes de cambiar fuentes se separaron las comprobaciones abiertas de los contratos
verificados en el plan, conservando los 94 IDs anteriores y sus referencias.
Antes de implementar se añadieron DB-MENU-01–09 y DB-CHECK-01–06 con aceptación concreta. Al cerrar la documentación se separó también el pendiente anterior de reordenación de opciones en DB-CHECK-07, sin implementar esa capacidad en esta ronda.
Respaldo externo: `/tmp/atlas-menu-baseline-9zmjeela`: 149 archivos locales,
manifiesto SHA256, conocimientos del demo y copia SQLite consistente.

Se conservó `local-demo/atlas-database-demo-my0jmtud`. Las pruebas que modifican
esquema, propiedades, papelera y presentación utilizan exclusivamente la página
**QA menús Tabla y Peek**, creada para esta ronda, fuente
`db_27bf3d10f7ed453a82b6e13339fd70ed`, con dos registros ficticios.
Los diez documentos originales del demo, su historial y los metadatos de sus diez
IDs se compararon con el respaldo: sin diferencias. Los 149 archivos locales
previos siguen presentes. Catálogo, menús de bloques, alineación, editor completo,
registro de temas y CSS global de Notion Native conservan sus hashes anteriores.
No se modificaron backend, identidad ni migración en esta ronda.

## Referencia de Notion y procedencia

Se consultaron los JSON y capturas existentes de REA, sin nuevas llamadas ni
recorridos de Notion. **No se afirma una conexión MCP nueva en esta ronda.**
Las herramientas que produjeron la evidencia histórica fueron
`mcp__rea__inspect_web_page` y `mcp__rea__capture_web_screenshot`, precedidas por
`mcp__rea__list_browser_targets`. No se presentan como ejecuciones actuales.

| Observado por REA anteriormente | Evidencia reutilizada | Aplicación de Atlas |
| --- | --- | --- |
| Cabecera compacta del Peek, modos y separación de título/propiedades | Peek R02 (`NOTION_REA_PEEK_EVIDENCE.json`, evidencia/herramienta local no publicada), captura (`notion-rea-peek.png`, evidencia/herramienta local no publicada) | Se conservan los controles reales y se miden sus grupos, estados y foco. |
| Búsqueda, Default/Serif/Mono, copiar, duplicar, mover, papelera, preferencias, bloqueo, importar/exportar e historial | Acciones (`NOTION_REA_PEEK_ACTIONS_EVIDENCE.json`, evidencia/herramienta local no publicada), captura desplazada (`notion-rea-peek-actions.png`, evidencia/herramienta local no publicada) | Agrupación sin separadores vacíos, búsqueda fija, cuerpo desplazable y regreso de subpaneles. |
| Parte inferior desplazada de acciones | `ev_4516f04fd1860bcf815f63a6703fc70dde1e74d0ac7e57dbf91a26ed0395e859`, ROUND (`NOTION_REA_REVIEW_ROUND_EVIDENCE.json`, evidencia/herramienta local no publicada) | El pie y las acciones inferiores se alcanzan mediante scroll real. |
| Configuración de vista: Layout, Property visibility, Filter, Sort, Group; diseño de página separado | `ev_0de7f5ffb704644364d15a3034d2f2479edc5c908be7514c4bed779a44336f93`, ROUND (`NOTION_REA_REVIEW_ROUND_EVIDENCE.json`, evidencia/herramienta local no publicada) | Índice Diseño/Propiedades/Filtrar/Ordenar/Agrupar/Abrir páginas; navegación por niveles. |
| Superficies y densidad de la variante oscura | NATIVE REA (`NOTION_NATIVE_REA_EVIDENCE.json`, evidencia/herramienta local no publicada), captura (`notion-native-rea-reference.png`, evidencia/herramienta local no publicada) | Tokens compartidos y misma geometría oscuro/claro. Claro es una adaptación de Atlas. |

Las medidas 290/420 px de panel, filas de 30 px, iconos de 16 px y botones
28/30 px son valores implementados y medidos **en Atlas**, no CSS extraído de
Notion. Las etiquetas «Propiedad compartida»/«Sólo esta vista», el regreso en el
mismo panel, la recuperación local, Iconos de propiedades y el contador Markdown
son adaptaciones explícitas. Nuevo crea una fila; se retiró su flecha que sugería
un selector de plantillas inexistente. No se añaden acciones de colaboración, IA
o integraciones ausentes. Se conservan las capacidades de exportación e historial
anteriores; abrir sus paneles no vuelve a acreditar la descarga o restauración.

## Cambios de implementación

- `databaseUI.jsx` / `databaseMenuNavigation.js`: submenús con chevron y etiquetas
  accesibles; flechas, Home/End y retorno; inputs y selectores conservan sus teclas
  nativas. Foco después de la colocación visible y antes de aceptar la siguiente tecla, retorno al disparador al cerrar
  y conservación del propietario del portal. No se enfoca un portal oculto.
- `DatabaseWorkspace.jsx`: nombre de propiedad controlado, Enter guarda una vez;
  Escape cancela. Abrir configuración/tipos y volver conserva ese nombre pendiente.
  Se elimina el guardado por blur del encabezado que podía escribir al cancelar.
  Regreso desde tipos, configuración, filtro y cálculo; distinción esquema/vista,
  estados expandidos e iconos de copiar/papelera. Un guardado asíncrono de un panel
  no cierra otro menú abierto posteriormente.
- `databaseViewConfig.jsx`: índice ordenado, sección única, Escape/Izquierda y
  regreso al disparador; apertura de filtros/orden mantiene la configuración.
- `databasePeek.jsx`: grupos no vacíos, búsqueda fija, mensajes sin resultados,
  regreso con búsqueda/foco conservados de diseño/mover/papelera/importar/historial;
  exportación retorna al mismo menú mediante su diálogo existente. Se conservan
  fuentes y acciones implementadas, sin tocar el cuerpo BlockNote.
- CSS del módulo: filas, iconos, campos, foco y scroll compartidos con tokens del
  tema. Se corrigió el contraste de acciones destructivas en claro y Ámbar.

## Matriz de aceptación ejecutada

Las acciones de navegador siguientes se hicieron con **CUA sobre Atlas**, no con
REA ni sobre Notion. Las medidas e inventarios están en
[ATLAS_DATABASE_MENU_VALIDATION.json](ATLAS_DATABASE_MENU_VALIDATION.json).
Los registros `record-9af4d0e0ea034dd2` / `record-ba35619d135c4bdc` conservaron su
identidad. La fuente QA tiene dos vistas Tabla existentes creadas como fixture;
no se añadió ningún tipo de vista ni capacidad nueva al producto.

| ID | Resultado comprobado | Evidencia |
| --- | --- | --- |
| DB-MENU-01 | Pestañas a la izquierda; filtro/orden/búsqueda/configuración/más/Nuevo a la derecha. Botones 30×30 px, iconos16; tooltip/etiqueta y estados. Abrir/cancelar menús no crea filas. | Medidas toolbar en JSON; capturas de encabezados. |
| DB-MENU-02 | Diseño y Agrupar abren sólo su sección; Escape desde select regresa al índice y foco a Diseño; flecha baja pasa a Propiedades. Filtro se abre con Derecha desde índice y vuelve. Altura mediana persiste tras recarga sólo en Tabla QA. | Configuración (`atlas-menu-view-config.png`, evidencia/herramienta local no publicada); estado final de las dos vistas en JSON. |
| DB-MENU-03 / DB-CHECK-04 | Inventarios Título/Texto/Número/Estado recorridos en Native oscuro y claro. Título no ofrece conversión/duplicación/eliminación/ocultación. Texto renombrado aparece en ambas vistas. Ocultar Texto y Suma de Número en Otra tabla no afectan Tabla QA. | Inventarios JSON; oscuro (`atlas-menu-header-dark.png`, evidencia/herramienta local no publicada) / claro (`atlas-menu-header-light.png`, evidencia/herramienta local no publicada). |
| DB-MENU-04 / DB-CHECK-03 | (+) crea URL QA y persiste tras recarga; desde Peek se crea Casilla QA. Buscar tipos y End alcanza Editado por: scroll280, contenido660, área380 px. Estado conserva nueva opción Revisión QA; Número porcentaje muestra850/950% con valores8.5/9.5 intactos y se restituye. | UI, fuente QA final y pruebas API. |
| DB-MENU-04 | Escribir un nombre y Escape conserva el anterior; regresar de Cambiar tipo conserva el borrador. Convertir Texto protegido a Número muestra409 y dos valores incompatibles, exige confirmación; cancelar conserva tipo/valores. | Interacción y API final; pruebas de conversiones/recuperación. |
| DB-MENU-03 | Filtro Nombre contiene principal muestra una fila; quitarlo devuelve dos. Orden descendente pone9.5 antes de8.5. Agrupar Estado muestra Pendiente2 y opciones vacías; se retira. Congelar y ajustar texto se activan y revierten. Duplicar copia valores; eliminar/recuperar propiedad conserva Texto protegido. | UI y esquema final QA; sin cambios a fuentes reales ni originales del demo. |
| DB-MENU-05 | Dos grupos de controles; botones28×28 e iconos16; anterior/siguiente deshabilitados en límites. Side→Center y navegación usan mismos IDs; página completa conserva encabezado, párrafo, lista y propiedades. Título32 px. | Medidas JSON; capturas Peek y comprobación de página completa. |
| DB-MENU-06 / DB-CHECK-05 | Default/Serif/Mono se aplican y se restituye Default. Copiar contenido devuelve el Markdown del registro, enlace el mismo ID. Bloqueo deshabilita importación y se revierte; favorito se activa/revierte. Papelera y restauración mantienen cuerpo y valores; añadir propiedad desde Peek no cierra el panel. | UI, portapapeles QA y fuente final. |
| DB-MENU-06 | Búsqueda diseño abre Personalizar diseño con Derecha; Escape retorna con búsqueda diseño y foco en esa entrada. Sólo un grupo, sin líneas vacías. Buscar texto inexistente muestra sin resultados. Exportar… abre diálogo; Escape devuelve búsqueda exportar y foco. Importar también regresa con Izquierda. | UI y primitivas de navegación compartidas. |
| DB-MENU-06 | Ventana **de escritorio**1888×600, menú580 px: cuerpo522 frente a620 de contenido. Scroll real98 px; búsqueda queda top16, pie bottom579.5 dentro de menú bottom590. Se restituye viewport1888×879. No es prueba móvil/táctil. | Scroll real (`atlas-menu-scroll-desktop.png`, evidencia/herramienta local no publicada), medidas JSON. |
| DB-MENU-07 | Flechas/Home/End recorren acciones, Derecha abre y Escape/Izquierda vuelve; Enter crea propiedad y Espacio activa papelera. Home/End de inputs conservan edición nativa. Cancelar configuración devuelve foco al encabezado; Escape de menú devuelve al ancla. Menús/diseño/exportación pertenecientes al Peek no lo cierran. | Prueba nueva databaseMenus y recorridos CUA; retornos de foco medidos. |
| DB-MENU-08 | Native oscuro/claro, Ámbar y Porcelana conservan geometría, grupos, iconos y edición. Cambio oscuro→claro→Ámbar→Porcelana mantiene vista Tabla QA y título pendiente distinto del título de tabla; se restituye antes de cerrar. Tema claro, vista Otra tabla, Texto oculto y Suma18 persisten tras recarga. | Capturas y JSON; registro de temas sin cambios. |
| DB-MENU-09 | La matriz separa observación REA histórica, implementación, medición CUA, contratos automáticos y limitaciones. | Este informe y plan único. |

## Pruebas y límites

- Suite backend: **371 aprobadas, 41 advertencias** preexistentes (datetime y
  contrato WeasyPrint). Primer intento restringido:368 aprobadas/3 fallos por
  sockets denegados; repetición autorizada completa aprobada, sin cambiar pruebas.
- `npm --prefix knowledge_base/editor-src test`: aprobado, incluida prueba nueva
  de navegación, edición nativa/IME/modificadores, foco y semántica de submenús;
  conserva catálogo25, editor, identidad, vistas, Dashboard, Markdown y temas.
- `npm --prefix knowledge_base/editor-src run build`: aprobado,1129 módulos.
- Contraste se calcula sobre colores efectivos de superficies opacas del menú,
  no como certificación WCAG global ni prueba de lector de pantalla. Las primeras
  medidas claro/Ámbar previas a la corrección se mantienen identificadas en JSON.
  Contraste final texto/acción destructiva: Native oscuro11.92/7.37, claro12.26/9.09,
  Ámbar10.82/4.65 y Porcelana12.26/6.11. Foco inmediato comprobado en tres ciclos
  encabezado→configuración→Escape sin pausas artificiales tras la corrección.
- Las interacciones esperaron a terminar los guardados antes de la acción siguiente;
  los primeros intentos con selectores equivocados o estados aún en transición no
  se cuentan como pruebas aprobadas. No se infiere fidelidad visual de la suite API.
- No se ejercitó cada acción de negocio en cada combinación de tema, vista y tipo;
  hay inventario en ambos Native, recorridos funcionales representativos y regresión
  Ámbar/Porcelana. La cobertura global de DB-THEME-02/04 y DB-QA-01/02 sigue parcial.
- DB-CHECK-01 (cancelación de resize),02 (descarga guardada en navegador),06 (otros
  portales BlockNote) y07 (orden manual de opciones ya declarado) siguen abiertos. Recursos remotos, fórmulas, layouts,
  colaboración y demás pendientes anteriores se conservan. No se hicieron cambios
  de móvil/táctil, nuevas vistas, migración real, Notion, commit, push o despliegue.

## Revisión local

<http://127.0.0.1:5059/?open=qa-men%C3%BAs-tabla-y-peek>, contraseña `atlas-db-demo`.
Tabla QA permite revisar todos los encabezados; Otra tabla conserva Texto oculto
con Suma18 y sus mismos dos registros. OPEN abre sus páginas; (…) muestra acciones,
búsqueda y subpaneles. ◐ permite comparar los temas anteriores y ambos Native.
El tracker original y el Dashboard permanecen disponibles con sus datos intactos.
