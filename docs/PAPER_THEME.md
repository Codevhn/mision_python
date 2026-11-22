# Tema Papel

Disponible en **Apariencia → Lectura → Papel**, con identificador persistente `paper`. El selector de acceso y el espacio de trabajo usan el mismo catálogo y la preferencia existente `kb_theme`. No se activa automáticamente ni reemplaza el tema elegido.

## Apariencia

- Hoja marfil mate `#f6f4ec`, navegación ligeramente más apagada, menús `#faf8f1`.
- Tinta carbón `#1d1e1b`, texto secundario `#5d6056`, enlaces en verde tinta sobrio.
- Prosa Lora local, controles y títulos Inter, código monoespaciado. El tamaño de lectura predeterminado es 20 px, con interlineado 1.8, igual en Peek y página normal. Los ajustes explícitos Serif/Mono y texto pequeño del registro conservan prioridad.
- Los bloques de código usan el fondo claro y la sintaxis GitHub Light compartidos por los temas claros. Los temas oscuros conservan su fondo grafito y GitHub Dark. Papel se aplica al texto de lectura y a los controles; no cambia el lenguaje, el código ni el mecanismo de ejecución.
- Separadores suaves, controles planos y vista previa sin degradado ni textura artificial. No aplica filtros sobre imágenes ni modifica el PDF original del lector.

## Integración

`paper.css` está acotado a `data-style="notion"` y `data-palette="paper"` en pantalla. Reutiliza el puente de componentes planos existente y aporta una paleta y tipografía propias. Cubre los límites de tokens locales del Peek y las reglas de código con ID que no heredan únicamente desde la raíz.

Se carga en el espacio de trabajo, acceso y módulo de finanzas. Los portales heredan la paleta; finanzas copia los atributos mediante su mecanismo existente. El hash de recursos incluye la nueva hoja. No modifica datos, instancias de editor, la preferencia de marco ni la presentación guardada de los registros. Cambiar de tema restaura las reglas de la familia anterior. La exportación usa su propia plantilla y no se altera por esta hoja de pantalla.

## Verificación

- `node knowledge_base/editor-src/test/themeRegistry.test.js`: catálogo único, persistencia, atributos, reversibilidad y preferencias de marco/página.
- `npm test` en `knowledge_base/editor-src`.
- `node tools/check_paper_theme.cjs` con el servidor desechable `tools/run_library_assistant_fixture.py`: selección real, recarga, contraste de tinta/navegación/menús, colores y fuentes calculados, código mate, paridad de Peek/tablas, tipografía explícita del registro, finanzas, acceso y restauración del tema anterior en 1440/900/412 px. Incluye capturas en `/tmp/atlas-paper-*.png`.

Los datos y capturas de estas pruebas son sintéticos. La apariencia de tinta electrónica es una dirección visual; el acabado físico y la emisión de luz dependen de la pantalla.
