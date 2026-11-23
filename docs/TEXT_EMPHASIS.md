# Diferencia entre texto normal y negrita

Atlas usa una escala semántica compartida: prosa normal en peso 400 y `strong`/`b`
en 700. `emphasis.css` se carga después de los temas en la aplicación, acceso y
el documento de Finanzas. El hash de recursos incluye la hoja para renovar caché.

Los párrafos y listas del editor y Peek reciben el peso regular explícitamente,
para evitar heredar seminegrita de otro contenedor. La regla de negrita se aplica
al marcado, sin recolorear texto ni cambiar tamaños, familias elegidas, cursivas,
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
