# Diferencia entre texto normal y negrita

Atlas usa una escala semántica compartida: prosa normal en peso 400 y `strong`/`b`
en 700. `emphasis.css` se carga después de los temas en la aplicación, acceso y
el documento de Finanzas. El hash de recursos incluye la hoja para renovar caché.

Los párrafos y listas del editor y Peek reciben el peso regular explícitamente,
para evitar heredar seminegrita de otro contenedor. La regla de negrita se aplica
al marcado, conservando tamaños, familias elegidas, cursivas,
encabezados o tokens de sintaxis. Se usan Inter y Lora Bold ya incluidas.
La plantilla HTML/PDF aplica también 700 a `strong` y `b`; su cuerpo sigue en 400.
La caché de recuentos de cursos incluye el HTML/CSS, por lo que recalcula la
paginación si la nueva fuente cambia saltos de línea.

Validación:

- `tools/check_text_emphasis.cjs`: 400/700 en los 79 temas del catálogo, a 1440 y
  412 px; listas y párrafos del editor, Peek, focus, respuesta simulada del
  asistente, documento de Finanzas y acceso. Comprueba familia conservada y que
  el Markdown no cambia. Solo usa datos desechables.
- 27 pruebas de PDF/editorial, impresión, ajuste a una hoja y paginación continua.
  La prueba editorial inspecciona la fuente real del PDF: el texto enfatizado
  usa Bold y la prosa adyacente conserva la variante regular.
- Revisión visual en Chromium de la diferencia de peso en el tema Gris oscuro.

Esto regula el texto renderizado por Atlas; no altera fuentes grabadas en un PDF
importado ni las hojas del editor de una publicación EPUB externa.

## Acentos de lectura selectivos

La auditoría visual posterior comparó los colores calculados de H2/H3/H4,
marcado fuerte y prosa en los 79 temas. Se adapta la lectura en 31 opciones:

| Grupo | Opciones |
| --- | --- |
| Atmósferas oscuras | Terracota oscuro y las nueve variantes adicionales |
| Editor | OpenCode oscuro, Dracula, Nord, Tokyo Night, Gruvbox, Catppuccin |
| Lenguajes | Las catorce variantes oscuras |
| Neutro adicional | Plata Glass |

Las Atmósferas tenían encabezados y negritas del mismo color que la prosa;
OpenCode y las variantes de lenguajes compartían el color de H2 con el cuerpo.
Plata se incluye por su acento casi neutro. Cada opción usa su propio acento
mezclado con la tinta del tema; Gris, Gris oscuro, Negro, Plata y C/C++ oscuro
usan azul hielo para aportar una distinción cromática real.

Las otras 48 opciones conservan los colores previos. Notion Native en ambos
modos, Papel, los temas claros, Hyprland, Horizonte y las demás familias Aero ya
diferenciadas quedan fuera. No se activa la mejora por la mera condición de
«tema oscuro».

Los acentos se limitan al contenido: H2/H3/H4, palabras en negrita y marcadores de
listas numeradas, viñetas, anidaciones y casillas. La explicación conserva su tinta.
Un brillo estático tenue se aplica solo a las marcas decorativas; las letras
mantienen bordes nítidos. Se preservan colores explícitos del autor, sintaxis de
código, familia/tamaño de texto, navegación y controles. Son reglas de pantalla:
el HTML/PDF editorial conserva su paleta de impresión.

`tools/check_reading_accents.cjs` compara la hoja activada y desactivada en todos
los temas, a 1440 y 412 px. Comprueba 31 adaptaciones y 48 exclusiones, diferencia
azul real en los grises, contraste de al menos 4,5:1 sobre la superficie elevada,
marcadores de cada tipo, preservación de un título rojo explícito y del código,
Peek, asistente y Markdown intacto. Se revisaron capturas de Gris oscuro y Óxido.
