> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Notion Native: integración y límites de la presentación

16 de octubre de 2026. Este documento explica la implementación; los estados y
criterios de aceptación se mantienen únicamente en [DATABASE_PLAN.md](DATABASE_PLAN.md),
requisitos DB-THEME-01–07, DB-PAGE-02 y DB-QA-01–02.

## Arquitectura y activación

En Apariencia → categoría **Notion Native** se añaden **Notion Native** (oscuro)
y **Notion Native Claro**. Se conservan todas las entradas anteriores, sus IDs y
preferencias. Ambos usan `theme-registry.js` y el mecanismo existente
`setAtlasTheme`: atributos de la raíz y persistencia en `kb_theme` del navegador.
No se sustituyen documentos ni se vuelve a crear el editor al cambiar de tema.
BlockNote ya observa `data-theme` para ajustar su esquema claro/oscuro.

`static/notion-native.css`, cargada después de las hojas anteriores, es el único
puente visual de esta familia. Centraliza tokens `--native-*` y los proyecta a
las variables compartidas de Atlas, Aero heredado, BlockNote/Mantine y ADB. Los
componentes agrupan superficies, controles, menús y estados; no hay un juego de
excepciones de tema repartido entre cada vista. Por heredar de la raíz, los
portales en `body` reciben la misma familia. El iframe de Finanzas ya copiaba
atributos mediante `MutationObserver`; ahora carga esta misma hoja.

La revisión del demo detectó dos reglas heredadas de `database-preview.css` que
no heredaban el tema: paleta/fuente locales en el overlay y un `font` con
`!important` que fijaba h1 en 26 px. La hoja central restablece los tokens en
esas fronteras y deja el tamaño de h1/h2/h3 relativo al contenedor del bloque,
conservando Serif/Mono. No se añadieron offsets a las asas para compensarlo.

El marco guardado en `data-frame` no se cambia. Native oculta su ornamentación y
neutraliza bordes/sombras/espacios ornamentales de ventanas; al salir del tema,
las ventanas recuperan su marco anterior. El área central de edición permanece
sin marco en todas las familias por `editing-surface.css`.

Serif, Mono, texto pequeño y ancho completo siguen siendo preferencias de
registro. El tema consume `--adb-record-font` / `--adb-record-size` cuando existen;
no escribe en la presentación guardada de una página ni cambia la vista activa.

## Referencia observada y adaptaciones

Se reutilizan las capturas y estados de REA documentados en
[DATABASE_PEEK_REA_REFINEMENT.md](DATABASE_PEEK_REA_REFINEMENT.md) y
[DATABASE_REVIEW_ROUND.md](DATABASE_REVIEW_ROUND.md). La nueva observación REA de
esta ronda añadió la captura de referencia (`notion-native-rea-reference.png`, evidencia/herramienta local no publicada):
`ev_35339b51b22ea7a3daaa32acb84cd810eb2f68806d9d4ed5a6740bdc84763626`.
El árbol accesible correspondiente tiene ID
`ev_dfc1eaa07fbe08d099cf821756e597c1bdc2501fe20b4fd072c7c6e9c4a988e0`.
REA realizó lectura real; no se atribuyen a REA clics ni mediciones CSS que no
ejecutó. Notion no se editó.

La imagen oscura sustenta superficies centrales aproximadamente `#191919`,
Peek/navegación `#202020`, separadores discretos, título de Peek cercano a 32 px,
propiedades cercanas a 14 px y controles superiores compactos. Son estimaciones
visuales, no valores extraídos de las reglas CSS de Notion. Los tokens y su
aplicación se contrastan en el demo de Atlas; una prueba de registro no demuestra
fidelidad visual.

La variante clara es una adaptación del mismo sistema, con papel blanco,
navegación cálida clara e indicadores azules. No se presenta como una inspección
de Notion claro. La navegación por módulos de Atlas, cursos, mapas, biblioteca,
asistente, finanzas y acceso no tiene equivalente inspeccionado en esas capturas:
se conserva su estructura funcional y se aplica el sistema compartido de
superficies/tipografía. Los iconos de módulos usan el componente Jinja
`atlas_nav_icon`: conserva el SVG Aero y ofrece un símbolo monolineal alternativo
de `native-icons.svg` únicamente en Native, con trazo `currentColor`. Estos
dibujos mantienen el significado de las funciones de Atlas; son una adaptación
original y no el catálogo de iconos extraído de Notion. Los colores semánticos de etiquetas, gráficos,
advertencias y resaltado de código se mantienen.

Los encabezados nativos h1/h2/h3 usan escalas 1.875/1.5/1.25 em; h4/h5/h6,
existentes en Atlas, se adaptan a 1.125/1/1 em y conservan Serif/Mono. No se
atribuye a Notion la ampliación de niveles h4–h6 de Atlas.

El canvas de código sigue oscuro incluso en temas claros, con la paleta Shiki
existente. Es una decisión previa para conservar los tokens de sintaxis, no una
interacción distinta de Native.

## Cursos y alcance de la preferencia

Al entrar en cualquier curso permanece el tema general de Atlas, incluido Native.
La selección automática por lenguaje y el selector contextual de tema de curso
se retiraron después de esta revisión. Las antiguas preferencias locales de
curso no se borran, pero ya no se aplican. Las preferencias de tipografía de
las páginas se conservan.

## Verificación técnica y límites de la evidencia

`node test/themeRegistry.test.js`, desde `knowledge_base/editor-src`, ejecuta el
registro y la función real de aplicación en un contexto de navegador simulado:

- Conservación de temas existentes e identificadores únicos del selector.
- Oscuro/claro, persistencia, reaplicación de la preferencia y restauración
  exacta de los atributos de un tema anterior.
- Conservación de atributos ajenos al tema, incluida la preferencia de marco.
- Selección automática de curso subordinada a Native general y conservación de
  temas propios explícitos; comportamiento anterior en otras familias.

La hoja se analiza con PostCSS; los dos scripts pasan `node --check`. Estas
comprobaciones no acreditan por sí solas posición de asas, edición pendiente,
legibilidad de todos los módulos, contraste de cada etiqueta ni responsive.
La matriz visual/interactiva y su estado se registran en el plan principal por
el responsable de la revisión del demo, sin cerrar requisitos por inferencia.
