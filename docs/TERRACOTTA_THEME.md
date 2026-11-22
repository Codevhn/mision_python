# Terracota y código adaptativo

**Apariencia → Atmósferas** incluye **Terracota · Oscuro** (`terracotta-dark`) y **Terracota · Claro** (`terracotta-light`). Son opciones del catálogo compartido; no reemplazan ni activan automáticamente la preferencia actual.

El escritorio combina una cuadrícula de 40 px y un degradado de cobre a carbón (oscuro) o arena (claro). Las tarjetas de Inicio son marfil con texto oscuro. Las páginas y el Peek mantienen una superficie de lectura sólida, menús y controles del mismo tema. Las portadas existentes conservan sus imágenes. El catálogo y las hojas se cargan también en acceso y finanzas mediante sus mecanismos actuales.

## Código

Todos los temas claros usan el lienzo `#f6f8fa`, texto `#24292e` y tokens **GitHub Light High Contrast**. Los oscuros conservan el lienzo `#1e232b` y la paleta **GitHub Dark**. El analizador de Shiki genera ambas variantes de una vez; CSS selecciona los colores según `data-theme`. No es necesario recrear el editor, cambiar el lenguaje ni reescribir el Markdown al alternar temas.

La cabecera, búsqueda de lenguajes y controles siguen la paleta de Atlas. El terminal mantiene su superficie propia. Las reglas compartidas de la página y el componente consumen los mismos tokens de fondo y texto para evitar rectángulos de otro color dentro del código. No se aplican filtros de inversión.

## Encabezados

En el contenido de página y Peek, H2 tiene una barra vertical de 3 px y H3 un pequeño cuadrado de 5 px. Las marcas usan el acento del tema con transparencia, sin cambiar los colores explícitos de los títulos. Son pseudo-elementos decorativos: no forman parte del texto seleccionado, del contexto del asistente ni del Markdown. Se limitan a pantalla, sin cambiar la exportación.

## Verificación

- `npm test` y `npm run build` en `knowledge_base/editor-src`.
- `tools/check_terracotta_theme.cjs`: selector real, persistencia, ambas paletas, degradado/cuadrícula, tarjetas, lectura, H2/H3 y sintaxis en página/Peek, escritorio/móvil y acceso. Comprueba contraste de los tokens claros y que el contenido no cambia.
- `tools/check_code_block_surfaces.cjs`: cambios de lenguaje, búsqueda, copia, ejecución simulada, superposición del menú y alternancia claro/oscuro.
- `tools/check_paper_theme.cjs`: lectura de Papel y código claro, persistencia y restauración de otros temas.

Los scripts de navegador usan el servidor local desechable; no modifican contenido personal ni invocan proveedores externos.
