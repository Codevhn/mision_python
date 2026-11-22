# Terracota y código adaptativo

**Apariencia → Atmósferas** incluye **Terracota · Oscuro** (`terracotta-dark`) y **Terracota · Claro** (`terracotta-light`). Son opciones del catálogo compartido; no reemplazan ni activan automáticamente la preferencia actual.

El escritorio combina una cuadrícula de 40 px y un degradado de cobre a carbón (oscuro) o arena (claro). Las tarjetas de Inicio son marfil con texto oscuro. La cuadrícula y el degradado continúan bajo el contenido de páginas, lecciones y Peek; sus capas internas son transparentes para no ocultarlos. La versión clara usa arena y cobre visibles, con menús y controles del mismo tema. Las portadas existentes conservan sus imágenes. El catálogo y las hojas se cargan también en acceso y finanzas mediante sus mecanismos actuales.

## Código

Todos los temas claros usan el lienzo `#f6f8fa`, texto `#24292e` y tokens **GitHub Light High Contrast**. Los oscuros conservan el lienzo `#1e232b` y la paleta **GitHub Dark**. El analizador de Shiki genera ambas variantes de una vez; CSS selecciona los colores según `data-theme`. No es necesario recrear el editor, cambiar el lenguaje ni reescribir el Markdown al alternar temas.

La cabecera, búsqueda de lenguajes y controles siguen la paleta de Atlas. El terminal mantiene su superficie propia. Las reglas compartidas de la página y el componente consumen los mismos tokens de fondo y texto para evitar rectángulos de otro color dentro del código. No se aplican filtros de inversión.

## Encabezados

En el contenido de página y Peek, H2 tiene una barra vertical de 3 px y H3 un pequeño cuadrado de 5 px. H2 usa un tamaño de 1,5 veces el texto base, más espacio y un separador fino; H3 usa 1,2 veces el tamaño base. Ambos tienen peso 700. Esta jerarquía se comparte entre los temas y respeta el tamaño de lectura del Peek. Las marcas usan el acento del tema con transparencia, sin cambiar los colores explícitos de los títulos. Son pseudo-elementos decorativos: no forman parte del texto seleccionado, del contexto del asistente ni del Markdown. Se limitan a pantalla, sin cambiar la exportación.

## Verificación

- `npm test` y `npm run build` en `knowledge_base/editor-src`.
- `tools/check_terracotta_theme.cjs`: selector real, persistencia, ambas paletas, degradado/cuadrícula, tarjetas, lectura, H2/H3 y sintaxis en páginas, lecciones reales y Peek, escritorio/móvil y acceso. Comprueba contraste de los tokens claros y que el contenido no cambia.
- `tools/check_code_block_surfaces.cjs`: cambios de lenguaje, búsqueda, copia, ejecución simulada, superposición del menú y alternancia claro/oscuro.
- `tools/check_paper_theme.cjs`: lectura de Papel y código claro, persistencia y restauración de otros temas.

Los scripts de navegador usan el servidor local desechable; no modifican contenido personal ni invocan proveedores externos.

## Más atmósferas oscuras

El mismo grupo incluye cuatro opciones adicionales:

| Tema | Identificador | Paleta |
| --- | --- | --- |
| Océano · Oscuro | `atmosphere-ocean` | Azul profundo y turquesa |
| Bosque · Oscuro | `atmosphere-forest` | Pino y jade |
| Ciruela · Oscuro | `atmosphere-plum` | Berenjena y malva |
| Grafito · Oscuro | `atmosphere-graphite` | Carbón y champán |

Comparten la base de `terracotta.css`, con variables `--atmosphere-*` para el
lienzo y las tarjetas y `--native-*` para los controles y portales. Las tarjetas
de las cuatro variantes son oscuras; las tarjetas marfil de Terracota se conservan.
La selección es global, persiste al recargar y se restaura también en acceso.
No cambia el contenido, las portadas, las preferencias tipográficas ni el PDF.
El hash de recursos incluye la hoja de atmósferas para renovar la caché al editarla.

`node knowledge_base/editor-src/test/themeRegistry.test.js` comprueba registro,
persistencia y reversibilidad. `tools/check_dark_atmospheres.cjs` comprueba el
selector real, tarjetas oscuras y su contraste, cuadrícula bajo las capas de
lectura, sintaxis, H2/H3, portadas y contenido conservados, acceso y restauración a
Papel, a 1440 y 412 px. `tools/check_terracotta_theme.cjs` verifica que las dos
opciones previas mantienen su comportamiento.
