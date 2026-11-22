# Exportar roadmap

En el menú del roadmap, **Exportar roadmap (.md)** descarga únicamente el nombre del curso, los módulos, las lecciones y sus temas principales. No incluye explicaciones desarrolladas, ejemplos, código, tablas ni la guía de la lección.

Los temas se extraen de los encabezados principales del documento guardado, conservando su orden y formato en línea. Se admite el scaffold manual con encabezados de nivel 3 y los temarios antiguos formados exclusivamente por listas simples. Los subtítulos de las explicaciones y los encabezados dentro de código o citas no se convierten en temas. Las lecciones sin estructura explícita conservan su título sin inventar subtemas.

La descarga usa `GET /api/courses/<id>/export/md`. Los módulos y lecciones mantienen su orden de exportación y los temas se escriben como viñetas, evitando confundirlos con nuevas lecciones al importar el Markdown.

**Exportar curso completo (.md)** conserva la copia con todo el contenido mediante `?include_content=1`. La exportación de documentos individuales conserva su comportamiento. Ambas opciones son de lectura y no modifican el texto ni los metadatos de las lecciones.

Verificación: `test_course_outline_export.py`, `test_course_roadmap_generation.py`, `test_document_export.py` y `tools/check_course_roadmap_export.cjs` (servidor local desechable, escritorio y móvil).
