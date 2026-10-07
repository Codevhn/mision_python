# Apariencia de Atlas

El botón de tema abre **Apariencia**. En móvil está en el menú de navegación.
Hay tres variantes de la misma familia visual:

- **Aero Claro**: cristal celeste y superficies de lectura azul claro uniformes.
- **Aero Azul Windows 7**: cristal azul y superficies de lectura de un azul más intenso.
- **Aero Nocturno**: cristal azul oscuro y contenido oscuro.

La elección se guarda localmente en `kb_theme`; no cambia los datos ni requiere
variables de Fly. Los temas clásicos ya no están disponibles: la preferencia
antigua `light` migra a `aero` y `dark` a `aero-night`. Una preferencia desconocida
o un navegador nuevo comienza en Aero Nocturno. Se guarda el identificador migrado.

Las tres variantes comparten tipografía, marcos de doble borde, reflejos,
controles agrupados y cierre rojo. La lectura del asistente utiliza fondos casi
opacos. El esquema se aplica a los tokens del sistema; las adaptaciones de Inicio,
Asistente, navegación y la cabecera del curso incluyen reglas específicas.
La revisión detallada de otras vistas e iconos continúa por etapas.
En las dos variantes claras, el área de contenido, el editor, el asistente y el
panel de cursos comparten un fondo azul opaco. Los campos y barras usan tonos
cercanos; los reflejos se concentran en el marco. Se conservan los colores
elegidos por el usuario para bloques y las imágenes de portada. Aero Nocturno
mantiene su paleta.

`ATLAS_THEMES`, en `static/app.js`, registra el esquema de color (`data-theme`:
dark/light), el estilo (`data-style`: aero) y la variante (`data-variant`:
light/blue/night). Así el editor y el lector existentes siguen recibiendo un
esquema compatible. `static/themes.css` define los tokens y componentes de las
variantes, con fondos opacos de respaldo si no hay desenfoque de superficies.

La animación meteorológica no se modifica en esta etapa. Nuevos estilos como
OpenCode o terminal quedan para después y no aparecen como opciones vacías.
