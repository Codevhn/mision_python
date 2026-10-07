# Apariencia de Atlas

El botón de tema abre **Apariencia** con Clásico oscuro, Clásico claro y Aero
Glass. En móvil está en el menú de navegación. La elección se guarda localmente
en `kb_theme`; no cambia los datos ni requiere variables de Fly.

Aero es una primera vista de Inicio, navegación y Asistente: azul frío,
tipografía sin serif, reflejos, marcos translúcidos y controles con relieve.
El contenido del chat conserva un fondo casi opaco para lectura. El tema usa
CSS y fondos de degradado, sin imágenes remotas ni dependencias nuevas. Hay un
fondo opaco de respaldo para navegadores sin desenfoque de superficies.

La configuración `ATLAS_THEMES` de `static/app.js` separa el esquema de color
(`data-theme`: dark/light) del estilo visual (`data-style`: classic/aero).
Así el editor y el lector existentes siguen recibiendo un esquema compatible.
`static/themes.css` contiene el selector de apariencia y las reglas de Aero.
Los temas clásicos conservan su apariencia y pueden recuperarse desde el selector.

La adaptación completa de otras vistas, familias de iconos y nuevos estilos como
OpenCode o terminal queda para siguientes etapas. Añadirlos requiere registrar
el estilo y definir sus tokens, tipografía y componentes; no basta cambiar el
color de fondo. No aparecen opciones que todavía no estén implementadas.
