# Restauración de módulos de Cursos

## Defecto reproducido

Con `7eedb45`, abrir una lección Python, recargar Inicio, usar **Continuar
estudiando**, volver a Cursos y pulsar Python dejaba un `nav.course-inline-tree`
vacío, aunque `expandedCourses[python]` era verdadero. El título del resumen
también estaba vacío. Al abrir CSS, `renderCourseList` reconstruía ambos árboles
y aparecían los tres módulos de Python. Reproducido en Chromium con cursos y
lecciones creados exclusivamente en una instancia local temporal.

Inicio restauraba `_activeCourseSlug` directamente, sin actualizar el árbol.
`switchSpace` y `setActiveCourse` confundían la existencia del contenedor HTML
del resumen con haber cargado el curso; el segundo solo quitaba la clase de
colapso al árbol vacío. No era una pérdida de módulos en el servidor.

## Corrección

La carga exitosa de una lección restaura curso activo, expansión y navegación
desde sus metadatos, también al llegar desde Inicio, búsqueda o enlaces.
Se comprueba la identidad y finalización del resumen (`courseReady`) antes de
restaurarlo. Al desplegar un árbol se renderizan sus módulos desde los datos
disponibles, conservando el estado de los módulos y los cursos independientes.

Un contador de solicitudes invalida resúmenes pendientes al abrir una lección,
cambiar de espacio, cerrar el curso o solicitar otro resumen. También se valida
después de obtener estadísticas: una respuesta tardía no puede reemplazar la
lectura ni dejar un resumen incompleto marcado como listo.

No cambia el contenido de cursos, sus módulos, sus lecciones ni los temas.
El identificador de assets ya depende del hash de `app.js`.

## Validación

Con un servidor local desechable y Playwright/Chromium instalados, desde la raíz:

```bash
node tools/check_course_navigation.cjs
node tools/check_sidebar_layout.cjs
```

El primer script usa por defecto `http://127.0.0.1:8131` y la contraseña de
prueba `atlas-courses-test-password`. Se pueden cambiar con `ATLAS_TEST_URL`
y `ATLAS_TEST_PASSWORD`. Rechaza hosts ajenos a localhost. Crea dos cursos con
tres módulos/lecciones cada uno, guarda actividad de estudio y recarga la app.

Resultado: **9 combinaciones aprobadas**, Hyprland/Aero Ámbar/OpenCode en
escritorio 1916×960, tableta táctil 1480×924 y móvil táctil 412×915. Comprueba
restauración desde Inicio, título/contenido del resumen, módulos visibles antes
de abrir CSS, lecciones, colapso/reapertura y expansión independiente de cursos.
En cada perfil también retiene una respuesta de resumen y otra de estadísticas
para verificar cancelación y recuperación al navegar. No hay errores de JavaScript.
Los tamaños táctiles se emulan; no son una validación sobre dispositivos físicos.

La prueba existente del sidebar también pasa en 944, 1024, 769, 768 y 412 px,
restauración a escritorio y carga inicial compacta. `node --check` y
`git diff --check` pasan.

Capturas e informe se generan en `/tmp/atlas-course-navigation`. La reproducción
contra la versión anterior falla intencionadamente esperando los módulos de
Python, sin abrir otro curso:

```bash
node tools/check_course_navigation.cjs --baseline=7eedb45
```

Arranque del servidor: desde `knowledge_base`, usar el Python del entorno virtual,
un `DATA_ROOT` creado con `mktemp -d`, `SECRET_KEY` de prueba,
`KB_PASSWORD=atlas-courses-test-password`, `SECURE_COOKIES=false` y
`ENABLE_CODE_EXECUTION=false`, con `python -m flask --app app run --host 127.0.0.1 --port 8131`.
