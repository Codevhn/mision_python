# Continuación de subtemas

Después de usar **Explicar** sobre un encabezado de una página o lección, el asistente puede proponer el siguiente subtema. La propuesta se calcula localmente a partir de los bloques actuales del editor, tanto en una entrada normal como en Peek.

- Busca un encabezado posterior del mismo nivel y dentro de la misma sección principal.
- Omite apartados que ya contienen texto, código, tablas o medios; los subencabezados de una explicación no se convierten en temas siguientes.
- «Pendiente» significa que la sección está vacía. No representa progreso académico ni afirma qué ha aprendido el usuario.
- No inventa temas, no cruza a otra lección y no adivina destinos cuando la selección es ambigua o el encabezado ha cambiado.
- **Desarrollar siguiente tema** reutiliza la acción Explicar, el contexto de origen y el modelo elegido. Revalida el destino antes del envío y conserva los borradores del usuario.
- **Ahora no** descarta la propuesta. No se inicia una generación ni se inserta contenido sin pulsar la acción correspondiente.
- La inserción conserva el destino y la cola de guardado del editor activo. Navegar a otra página invalida las propuestas anteriores.

Las preguntas generales, resúmenes, ejemplos, respuestas parciales, Biblioteca y los borradores de roadmap conservan sus flujos existentes; no reciben una propuesta de este tipo.

## Calidad del desarrollo

Cada lección muestra una **Guía de la lección** entre el título y los apuntes, con dos campos editables: **Objetivo de la lección** y **Orientación del desarrollo**. Se presentan en dos columnas sobre el fondo de la lección, con etiquetas discretas y un separador fino; en móvil se apilan. Los campos ajustan su altura al texto y **Guardar guía** aparece cuando hay cambios. Persiste ambos campos como metadatos propios de la lección (`lesson_objective` y `lesson_guidance`, hasta 4000 caracteres cada uno). Se pueden dejar vacíos o borrar. No se insertan en Markdown, copias del contenido ni exportaciones.

La próxima consulta del asistente recupera la guía guardada del servidor, incluso desde Peek. No se confía en objetivos enviados por el navegador. El texto aún sin guardar se identifica como tal y se conserva durante la navegación de la sesión; se debe guardar antes de recargar o pedir al asistente que lo use. Los bloqueos y la papelera impiden editar la guía. El endpoint específico actualiza solo esos metadatos en una transacción, sin reemplazar el documento ni otros campos.

Las instrucciones pedagógicas compartidas por todos los proveedores distinguen el contexto curricular del texto técnico potencialmente erróneo. Una respuesta anterior, un resumen de conversación o un extracto del editor no se convierten en fuentes verificadas. Cada entidad debe conservar sus propios atributos (organización, licencia, ediciones, funciones y requisitos), sin copiar los de herramientas vecinas.

En cursos, el servidor añade `learning_task` al contexto de cada petición: acción actual, selección cuando corresponde y campos que describen el currículo frente al contenido no verificado. Las preguntas libres no heredan un tema seleccionado anterior. El nivel ausente sigue sin especificar y el año del título no determina versiones de software. Página y Peek usan el mismo contrato del servidor.

El desarrollo debe evitar comparativas globales repetidas, etiquetas de instrucciones expuestas como títulos y recomendaciones falsamente atribuidas al curso. Los datos variables necesitan respaldo; los detalles inciertos accesorios se omiten y los esenciales se matizan. Estas reglas no certifican la veracidad de la salida ni añaden búsquedas externas. La revisión documental existente conserva su flujo.

La continuidad didáctica se define en el prompt global de todos los proveedores: un caso sencillo compartido cuando ayude a los apartados prácticos; una pregunta o criterios comunes para temas conceptuales, históricos o comparativos. No obliga a reutilizar un ejemplo inadecuado. La orientación editable concreta o ajusta la regla; al desarrollar una sola sección se aprovecha el contexto disponible sin reescribir las otras. El nombre de la regla y su lista de comprobación no deben aparecer en el material de estudio.

## Lección completa

**Desarrollar lección completa** aparece junto a la guía y en el asistente cuando la vista abierta es una lección, también desde Peek. Es una acción explícita distinta de Explicar: envía `lesson_action: develop`, el esquema actual y la guía guardada. Usa el modelo seleccionado y conserva el borrador de la pregunta. Si la guía tiene cambios pendientes, pide guardarlos primero.

El servidor limita el contexto a esa lección y solicita una planificación interna del conjunto, cobertura de los temas en su orden y bases comunes sin repeticiones. Un borrador completo pasa por contraste documental y revisión de ejemplos antes de la corrección final con el mismo proveedor y modelo. No se transmiten fragmentos del borrador sin revisar al navegador. La redacción y corrección tienen un presupuesto de hasta 8000 tokens cada una; los análisis intermedios tienen límites menores. Estas etapas añaden consultas y tiempo de espera. Si una revisión falla, devuelve una estructura incompleta o altera los temas, se informa del error y no se guarda una respuesta del asistente; la petición queda disponible para reintentar.

Solo se entrega y guarda la versión revisada, sin modificar el documento. Si la generación inicial está truncada se conserva como borrador incompleto, sin revisión ni posibilidad de aplicarlo. La revisión editorial no equivale a contraste documental ni garantiza obediencia o exactitud factual de todos los modelos.

**Aplicar borrador a la lección** valida todos los encabezados y su orden antes de editar. Tras una confirmación, coloca cada desarrollo debajo de su encabezado original, conservando sus identificadores y el texto previo al primer tema. Reemplaza las explicaciones existentes de esos apartados; el título y la guía se conservan. Si faltan temas, hay encabezados ambiguos o nuevos temas del mismo nivel, se rechaza la aplicación completa para evitar una distribución incorrecta. Los encabezados con contenido anidado no admiten esta aplicación. Un cambio de documento o destino durante la confirmación invalida la operación. Se guarda mediante las colas existentes del editor. Las explicaciones de un solo tema siguen usando su inserción individual.

### Contraste y ejemplos

`lesson_evidence.py` selecciona hasta seis páginas de un catálogo de documentación oficial según el curso, los temas y el borrador (Python, PEP, RFC, algoritmos, IDE y otras tecnologías catalogadas). No acepta destinos inventados por el modelo. Las referencias guardadas de la entrada tienen prioridad; una lista guardada vacía desactiva la consulta. No se adivinan fuentes para dominios sin catálogo. La descarga usa los límites y controles existentes en lotes de hasta tres páginas; un candidato solo cuenta como evidencia si pudo leerse.

El contraste reutiliza `audit_claims`: hasta veinte afirmaciones del borrador, con citas literales contrastadas contra los extractos. Los juicios sin trazabilidad se degradan a no confirmados. Se distinguen contradicción y falta de evidencia. La corrección final recibe los documentos, este contraste y la revisión de ejemplos; debe corregir errores, conservar condiciones y omitir detalles inciertos accesorios. Los informes corresponden al borrador anterior a la corrección, no certifican exhaustivamente el texto final.

`lesson_examples.py` solicita un análisis estructurado de hasta cuatro ejemplos, anclados con citas del borrador. Revisa enunciado, precondiciones, resultados, duplicados, vacíos, casos unitarios y mutación cuando correspondan. Puede proponer hasta seis casos numéricos por ejemplo. Un intérprete de AST restringido calcula aritmética básica y `sum`, `min`, `max`, `len`, `abs` sobre números y listas acotados: sin `eval`, `exec`, imports, atributos, comprensiones, archivos ni red. Tiene límites de tamaño y magnitud. Distingue coincidencia, discrepancia y expresión no admitida.

Los casos calculados verifican únicamente expresiones propuestas por el modelo, no la fidelidad de su traducción ni el programa completo. Los demás ejemplos reciben análisis del modelo, no ejecución. La interfaz separa fuentes y revisión de ejemplos del texto didáctico e indica cuando no hubo contraste documental o no se identificaron casos. Si hay evidencia, se añade una llamada de contraste de afirmaciones; siempre hay una llamada de análisis de ejemplos y una de corrección final para lecciones completas. Las explicaciones individuales reciben las reglas globales, sin iniciar este flujo completo.

Las pruebas de integración usan respuestas y documentos simulados: verifican el alcance, la distribución, las correcciones y el guardado, no certifican la calidad factual de cada modelo ni la disponibilidad de fuentes en producción.

## Navegación de cursos

Anterior/siguiente mantiene el orden y los manejadores existentes de las lecciones. La barra se fija al pie de la columna de lectura y limita su ancho para respetar el asistente y el Peek. En móvil queda sobre la zona del asistente, al pie del espacio de lectura disponible. Si otros paneles no dejan ancho suficiente, se oculta hasta recuperar espacio. El botón para abrir el asistente queda por encima de la barra y el contenido final conserva espacio para leerse.

## Verificación

- `npm test` en `knowledge_base/editor-src`, incluida la detección de apartados vacíos, contenido anidado, títulos duplicados y anclas eliminadas.
- `tools/check_study_continuation.cjs`: página/Peek y escritorio/móvil, API real con modelo simulado, selección correcta, borrador, inserción y cambio de página.
- `tools/check_course_navigation_dock.cjs`: barra fija, temas, asistente normal/ampliado, límites del curso y navegación real.
- `tools/check_library_assistant.cjs`: regresión de consultas, selecciones y fuentes de Biblioteca.
- `knowledge_base/tests/test_learning_guide.py`: validación, persistencia, permisos, conservación del documento y recuperación de la guía por el asistente.
- `knowledge_base/tests/test_lesson_quality.py`: contexto de la revisión, modelo elegido, encabezados, orden, secciones vacías y bloques de código.
- `knowledge_base/tests/test_lesson_evidence.py` y `test_lesson_examples.py`: selección y límites de fuentes, ausencia de evidencia y cálculos acotados sin ejecutar código generado.
- `tools/check_lesson_guide.cjs`: formulario real, recarga, separación del editor, temas claro/oscuro, móvil, borradores y recuperación tras errores de guardado.

Los scripts de navegador usan únicamente un servidor local desechable; no generan respuestas mediante proveedores externos ni usan cursos personales.
