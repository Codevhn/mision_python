# Auditoría del corrector ortográfico de Atlas

Fecha: 2026-11-16 (America/Tegucigalpa).
Base inspeccionada: `b020676`; funcionalidad sin cambios desde `12282a7`.
Estado: diagnóstico previo conservado como evidencia. La implementación posterior
y su uso se documentan en `../knowledge_base/SPELLING.md`.
Este informe sustituye `LANGUAGE_ASSISTANCE_AUDIT.md`, cuyo alcance era equivocado.

## Diagnóstico

Las sugerencias incoherentes tienen causas verificables en el corrector:

1. Mezcla español e inglés para decidir si una palabra es válida y para generar
   propuestas, sin determinar el idioma del párrafo.
2. Ordena propuestas por parecido ortográfico y prioridad técnica, sin frecuencia
   de uso ni contexto. Una forma existente en un diccionario no necesariamente
   corresponde a lo que el usuario quiso escribir.
3. No normaliza Unicode antes de consultar los diccionarios. Una palabra válida
   copiada con un acento descompuesto puede marcarse y recibir otra palabra.
4. La revisión de párrafo preselecciona el primer candidato para cada error.
   Pulsar «Aplicar correcciones» acepta todos esos candidatos sin elegirlos uno a uno.
5. La corrección inline puede modificar un editor puesto en solo lectura.

No basta con añadir términos o seguir ajustando distancias. Hace falta corregir
el contrato de idioma y candidatos, conectar revisión contextual cuando se elija
ese método y asegurar la aplicación de cambios en el editor.

## Qué existe y qué se comprobó

| Componente | Implementación actual |
| --- | --- |
| Marcas y popup del editor | `editor-src/src/inlineSpelling.js`: nspell con Hunspell ES/EN y vocabulario técnico; hover/clic en palabras desconocidas. |
| Generación y clasificación | `editor-src/src/spellingWords.js`: máximo seis resultados, distancia de edición, proporción, nombres técnicos y orden de los motores. |
| Revisión del párrafo | Misma función local de candidatos, sin revisión semántica del párrafo. El párrafo se usa para vista previa y posiciones. |
| Panel Abc✓ | `static/proofreading.js`: revisión nativa del navegador, LanguageTool o IA; propuestas antes de aplicar. |
| Servicio de revisión | `proofreading.py`: LanguageTool fijado a `language=es` o modelo con instrucciones de corrector español. |
| Ediciones conservadoras | `editor-src/src/textEdits.js`, `main.jsx`: cálculo de diferencias, captura de selección y comprobación de documento antes de aplicar. |
| Vocabulario personal | `localStorage`, compartido por las instancias de este navegador; ignorar una palabra durante la sesión. |

El popup local no consulta LanguageTool ni IA. Cambiar el método en Abc✓ no
cambia el motor de las sugerencias inline. Son recorridos distintos.

### Evidencia reproducible

Se ejecutaron los diccionarios reales instalados con las funciones de producción
y el bundle distribuido de BlockNote en Chromium, con documentos descartables.
Resultados completos: `docs/SPELLING_AUDIT_EVIDENCE.json`.

| Entrada | Resultado observado | Problema |
| --- | --- | --- |
| `Hécate` | `Sécate`, `Hecate` | Nombre no reconocido; verbo parecido priorizado sobre el nombre. |
| `canalizador` | `canalizados`, `catalizador`, `analizador`, `canalizado` | Vocabulario general válido ausente del diccionario; candidatos semánticamente distintos. |
| `abjeto` | `objeto`, `abeto`, `abject` | Incluye candidato inglés en la misma lista. |
| `reciept` | `receipt`, formas de `receptar` | Mezcla propuestas inglesas y españolas. |
| `librery` | `librera`, `librero`, `library` | Las formas españolas preceden a la corrección inglesa esperable en una frase inglesa. |
| `alomejor` | `alomemos` | No propone la separación esperada «a lo mejor». |
| `aver` | Aceptada por el diccionario inglés; no se marca | Puede ocultar «a ver» o «haber» mal escrito en una frase española. |
| `árbol` NFC / `árbol` NFD | Primera válida; segunda marcada, propone `arbor` | Equivalencia Unicode no respetada. |

Estos ejemplos no demuestran que nspell invente cadenas aleatorias: los motores
pueden generar flexiones válidas o poco frecuentes. Demuestran que pertenecer a
alguno de los dos diccionarios y estar cerca en letras no basta para recomendar
un reemplazo. La elección depende del idioma y, a menudo, de la frase.

En tres perfiles —escritorio 1440×900, teléfono táctil 412×915 y tablet táctil
1480×924— se comprobó sobre el editor real:

- Original: `Hécate abjeto reciept librery alomejor aver.`
- Aceptando las opciones predeterminadas del diálogo:
  `Sécate objeto receipt librera alomemos aver.`
- Tras `editor.setEditable(false)`, el botón de la propuesta cambia `abjeto` a
  `objeto`. Es una mutación real del documento, no solamente una vista previa.
- Si el documento cambia durante una revisión, se rechaza aplicar el resultado.
- El código y los enlaces no reciben marcas ortográficas en la muestra probada.
- Cero llamadas a servicios externos y cero errores JavaScript en la ejecución final.

No se probó hardware Samsung físico ni una sesión de producción. Los perfiles
emulados no certifican el teclado o menú nativo de cada navegador. No se evaluó
la calidad del servicio vivo de LanguageTool ni se consumieron solicitudes de IA.

## Hallazgos y prioridad

### Alta: candidatos sin idioma ni contexto

`createSpellingDictionary` acepta una palabra si la reconoce cualquiera de los
motores. `suggestionsFor` combina los candidatos de ambos y no recibe ni idioma
ni frase. Por tanto, no puede decidir entre una palabra española y una inglesa,
ni resolver términos válidos mal usados, tildes diacríticas o separaciones.

La frecuencia no participa en la clasificación. A igual distancia se prioriza
vocabulario técnico y similitud proporcional, no uso habitual. Ampliar esa lista
manualmente no resuelve el vocabulario general y puede añadir más ruido.

### Alta: primera propuesta elegida sin revisión individual

`reviewParagraph` añade las sugerencias antes de «Conservar» y deja seleccionado
el primer elemento. No modifica al abrir el diálogo, pero basta pulsar el botón
general para convertir candidatos inseguros en cambios. Se verificó la sustitución
incorrecta de nombres y palabras del ejemplo. El diálogo debería iniciar con
«Conservar original» y requerir una elección para cada propuesta, o una acción
explícita de aceptar propuestas revisadas.

### Alta: el corrector puede escribir en solo lectura

La función inline `apply` valida documento y ciclo de vida, pero no `isEditable`.
Se reprodujo la mutación con el editor bloqueado en los tres perfiles.
`captureSpellingSelection().apply` tampoco comprueba explícitamente editabilidad
al aplicar; este segundo recorrido se señala por inspección, no se afirma haberlo
reproducido en el diálogo completo. Hay que comprobar el permiso en captura y
aplicación, incluyendo cambios de estado mientras está abierta una revisión.

### Media: normalización Unicode inconsistente

La clasificación usa NFC y minúsculas, pero `correct` consulta nspell con la forma
original. Además, se descarta un candidato cuya clave normalizada coincida con la
entrada, lo que no permite resolver adecuadamente ciertas diferencias de
representación. Deben separarse la forma de comparación, la grafía mostrada y el
rango UTF-16 original; nunca normalizar el documento entero para calcular offsets.

### Media: revisión contextual desconectada del popup

LanguageTool recibe el fragmento y permite detectar reglas contextuales, pero
solo se invoca desde el panel explícito. El popup del usuario continúa mostrando
candidatos locales. Su configuración y la del motor inline no representan una
preferencia unificada. El servicio y el prompt de IA están fijados al español.

### Media: rendimientos y comportamiento asíncrono sin cobertura suficiente

Se reescanea el documento completo tras 450 ms de cambios y se regeneran
candidatos al abrir el menú. No se encontró caché local por token/idioma ni un
análisis incremental por bloque. No se midió una degradación de latencia y no se
presenta como fallo reproducido. Una revisión remota integrada necesitará
presupuesto por párrafo, deduplicación, caché y descarte de respuestas obsoletas.

El popup usa `innerWidth`/`innerHeight`, no `visualViewport`: queda pendiente probar
su posición con teclado virtual y zoom visual. El mouseover conserva el popup
abierto al pasar a otra palabra; es un comportamiento explícitamente documentado,
no prueba de un fallo de selección. La palabra de referencia debe quedar clara.

### Media: documentación y pruebas no detectan estos fallos

La documentación principal describe al final el corrector nativo como activo en
el editor, pero `main.jsx` configura `spellcheck=false` para evitar marcas dobles.
El propio documento explica esa desactivación en otra sección. Debe corregirse la
contradicción y explicar qué motor produce cada propuesta.

Las pruebas existentes validan algunos aciertos concretos, Unicode en rangos y
transporte, pero no aseguran calidad en lenguaje general, nombres propios,
idiomas, NFD, modo de solo lectura ni seguridad de las opciones predeterminadas.

## Protecciones existentes que deben conservarse

- Excluir código, enlaces y átomos inline del análisis local.
- No modificar por hover: la palabra solo cambia al elegir/aplicar.
- Comprobar que la versión del documento no cambió durante la revisión.
- Ediciones por posiciones y transacciones; evitar reconstruir toda la página.
- Revisión remota limitada al fragmento, con sesión y tamaño máximo.
- Manejo de cuota/conexión de LanguageTool y rechazo de salida IA truncada.
- Propuesta editable y aplicación explícita; diccionario personal e ignorados.

## Solución propuesta

### 1. Un contrato único de revisión, con idioma

Definir una preferencia persistente de idioma para el contenido: español por
defecto, opción inglesa y tratamiento explícito de texto mixto. Puede sugerirse
idioma por párrafo con suficiente texto; una palabra aislada no debe decidirlo.
La incertidumbre debe conservarse, no resolverse aceptando automáticamente todo
lo que exista en alguno de los dos diccionarios.

Cada hallazgo debe identificar rango UTF-16, original, idioma, motor, explicación
y reemplazos. Todos los recorridos —popup, párrafo, selección y Abc✓— deben usar
ese mismo contrato y comprobar versión de documento y editabilidad al aplicar.

### 2. Motor local correcto y revisión contextual real

Conservar Hunspell/nspell como detección local rápida y sin red, utilizando el
idioma elegido, normalización NFC para consultas y caché por token/idioma/versión.
Evaluar el diccionario con corpus general; ampliar o reemplazar sus datos si la
cobertura resulta insuficiente. El vocabulario técnico debe seguir siendo una
excepción específica, no una solución general a base de listas manuales.

Para propuestas contextuales, integrar LanguageTool en el recorrido del popup
mediante análisis del párrafo y el mismo contrato de hallazgos. Puede reutilizarse
el adaptador servidor existente, ampliado con idiomas, configuración, límites y
estados explícitos. No usar el servicio público gratuito como si ofreciera
capacidad ilimitada para escaneo continuo; producción necesita una capacidad
adecuada, instancia propia o servicio contratado según volumen.

La IA puede conservarse como revisión opcional explícita; no hace falta consumir
una solicitud de modelo por cada palabra. No depender de mecanismos internos del
corrector del navegador: no hay una API estándar para obtener sus candidatos.

El sistema debe distinguir propuestas locales de revisión contextual, y mostrar
que no hay una propuesta adecuada antes que forzar seis parecidos. Ningún motor
puede garantizar siempre la intención del autor, especialmente en nombres propios.

### 3. Integración eficiente y aplicación segura

- Analizar solo bloques modificados; reutilizar resultados al volver a un párrafo.
- Agrupar y limitar consultas remotas por párrafo, nunca una por palabra recorrida.
- Preferencia de método clara; no enviar automáticamente contenido por un método
  distinto al elegido ni cambiar silenciosamente a IA.
- Descartar respuestas de otra versión, idioma, palabra, página o instancia.
- Invalidar caché al cambiar texto, idioma o vocabulario personal.
- Conservar el original al abrir revisiones; no preseleccionar cambios inciertos.
- Comprobar editabilidad al abrir y al aplicar, incluso si se bloquea la página
  con la revisión abierta. En solo lectura, permitir consultar/copiar sin escribir.
- Mantener formato y bloques vecinos; una aplicación debe deshacerse correctamente.
- Validar offsets UTF-16 y bordes de caracteres; conservar emojis y marcas inline.
- Posicionar el panel dentro del área realmente visible en móvil y tablet.

## Qué se espera y cómo se aceptará

| Caso | Resultado exigido |
| --- | --- |
| Párrafo español con `abjeto`, `prueva`, `conosimiento` | Correcciones españolas pertinentes; no candidatos ingleses mezclados sin identificación. |
| Párrafo inglés con `librery`, `reciept` | Priorizar `library`, `receipt` en el contexto probado. |
| `Hécate` y otros nombres | No escoger un verbo parecido por defecto; conservar/permitir diccionario personal. |
| Palabra NFC o NFD | Mismo diagnóstico ortográfico; rangos intactos. |
| `aver`, `alomejor`, tildes contextuales | Evaluación de la frase por el motor contextual; sin ocultar un error español porque exista en inglés. |
| Abrir «Corregir párrafo» y aplicar sin elegir cambios | Conservar el original. |
| Solo lectura o bloqueo durante revisión | Ninguna modificación del editor. |
| Selecciones con negrita, emojis y varios errores | Aplicar únicamente rangos válidos, conservar formato y deshacer. |
| Documento/página modificados durante revisión | No aplicar resultados obsoletos. |
| Repetir consulta sin cambios | Reutilizar resultados vigentes; evitar llamadas duplicadas. |
| Cuota, desconexión o respuesta inválida | Estado claro; modo local identificado, sin fingir revisión contextual. |
| Teléfono/tablet con teclado | Panel y acciones visibles y accesibles. |

La evaluación deberá medir precisión de marcas, falsos positivos, presencia y
posición de la corrección esperada, latencia y solicitudes por interacción sobre
un corpus con español general, inglés, texto mixto, tecnicismos y nombres propios.
Las pruebas con mocks verifican integración, no calidad de LanguageTool o IA.
Una muestra contra el servicio real elegido es una etapa posterior necesaria.

## Reproducción y siguiente etapa

Desde la raíz del repositorio:

```bash
knowledge_base/editor-src/node_modules/.bin/vite-node tools/audit_spelling_words.mjs
node tools/audit_spelling.cjs
python -m pytest knowledge_base/tests/test_proofreading.py -q
```

Dentro de `knowledge_base/editor-src`:

```bash
./node_modules/.bin/vite-node test/spellingWords.test.js
./node_modules/.bin/vite-node test/textEdits.test.js
```

Resultados: las seis pruebas backend pasan, ambas suites JavaScript pasan y la
sonda del editor registra los resultados anteriores en los tres perfiles. Los
scripts de auditoría registran el comportamiento observado; no exigen conservar
los defectos y no modifican datos reales. `CHROMIUM_PATH` y
`ATLAS_SPELLING_AUDIT_OUTPUT` permiten ajustar navegador y salida del informe.

La siguiente etapa es implementar el contrato y los controles de aplicación,
corregir idioma/Unicode y conectar revisión contextual al popup con pruebas de
regresión sobre los defectos reproducidos. La entrega de auditoría sustituyó únicamente el reporte equivocado y aportó
evidencia. La implementación posterior corrige idioma, Unicode, selección de
cambios y modo de solo lectura e integra LanguageTool en el popup. Véanse
`../knowledge_base/SPELLING.md` y `tools/check_spelling.cjs` para comportamiento
y pruebas actuales. El servicio vivo no pudo evaluarse por un bloqueo 403 del
proxy de este entorno; no se presenta el mock como evidencia de calidad lingüística.

## Validación posterior a la corrección

`SPELLING_FIX_EVIDENCE.json` conserva la sonda posterior: en los tres perfiles
se conserva el párrafo por defecto y no se modifica el editor bloqueado.
La suite backend completa pasó: **480 pruebas**, con 63 avisos existentes.
También pasaron `npm test`, el build y las pruebas del corrector y del pegado
en escritorio, teléfono y tablet. El servicio contextual se simuló en esas
pruebas; su calidad real no se presenta como comprobada, por el bloqueo del proxy.
