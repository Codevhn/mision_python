# Enlaces sin marco y selección de procedencia en Peek

Fecha: 2026-11-17 (hora de Honduras). Base: `06f667e`.

## Diagnóstico

El borde azul pertenece a la selección de nodos de ProseMirror/BlockNote; no es
un borde almacenado en el contenido ni un indicador de la página visitada.
BlockNote dibuja el marco sobre nodos sin contenido editable, como `pageLink`.
El renderizador React puede situar la clase de selección en su contenedor.

Al importar Markdown, `main.jsx::applyMarkdown` coloca la selección en el primer
bloque. Cada regreso al padre reconstruye el editor, por lo que el primer enlace
volvía a seleccionarse aunque se hubiera salido desde Recursos. El navegador del
Peek conservaba el scroll y los títulos, pero no el bloque seleccionado.

## Cambios limitados al Peek

- La ruta del Peek conserva la selección junto a su posición de lectura.
  Al seguir un enlace, registra el ID de la página destino. Al regresar,
  localiza ese enlace y restaura la selección con la API nativa de BlockNote.
  No depende del título visible ni de los IDs de bloque que se regeneran al
  importar Markdown. Elegir otro enlace sustituye la procedencia anterior.
- La selección de otros tipos de bloque puede conservarse por su posición en el
  árbol y tipo. La restauración solo se aplica cuando existe un destino compatible.
- La restauración se realiza tras preparar el documento y antes de restablecer
  el scroll. No se fuerza el foco del navegador ni se cambia el documento.
- CSS específico de `#pagePeekEditor` retira outline y sombra de los contenedores
  seleccionados de tipo `pageLink`. No borra la selección real ni cambia los
  indicadores de código, tablas, multimedia o editores fuera del Peek.

No se modifica el código del proveedor BlockNote, la API backend, los enlaces
persistidos ni las preferencias globales de apariencia.

## Verificación

Con el servidor desechable habitual:

```bash
python tools/run_library_assistant_fixture.py
# En otra terminal desde la raíz:
node tools/check_peek_link_selection.cjs
node tools/check_peek_navigation.cjs
```

El nuevo checker crea cuatro subpáginas y sigue primero Recursos (cuarto enlace)
y después Cronograma (segundo). Al regresar por el breadcrumb verifica el bloque
seleccionado y la ausencia real de outline/sombra en Aero, OpenCode, Hyprland y
Notion Native. Comprueba tanto Side como Center Peek en 1697×1000, 1480×924 y
412×915.

Además enfoca el editor, pulsa Delete y comprueba que se elimina el enlace de
procedencia, no el primero; deshace y verifica que el Markdown guardado coincide
con el original. Así se comprueba la selección real y su comportamiento de
edición, no solo una apariencia CSS. El fondo sigue siendo la base ROADMAPS.

Las capturas se guardan en `/tmp/atlas-peek-link-selection-*.png`. Se ejecutan
además `npm test`, el build y la regresión de navegación del Peek. Las pruebas
usan datos sintéticos y perfiles Chromium; no hardware Samsung físico ni una
sesión de Notion. No consumen consultas a IA ni modifican contenido personal.
