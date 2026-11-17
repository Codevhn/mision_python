# Corrector ortográfico

Abre **Abc✓** para elegir la preferencia de revisión (**Automático · español e
inglés**, **Español preferido** o **English preferred**) y el método de sugerencias. La elección se guarda en este navegador y se comparte
entre páginas, ventanas Peek y el panel de revisión. **Subrayar posibles errores**
permite quitar las marcas mientras lees sin desactivar el menú de sugerencias.

## Sugerencias al señalar una palabra

El editor reconoce palabras válidas tanto en español como en inglés. Elegir una
preferencia no convierte las palabras correctas del otro idioma en errores. Esto
permite leer párrafos y tablas técnicas mixtos sin subrayar «staging», «commits»,
«widening» o «identificadores» por pertenecer al otro idioma. El vocabulario
técnico complementario sigue reconociendo nombres y abreviaturas de productos.

Reconocer ambos idiomas no significa mezclar sus candidatos: las propuestas se
generan en una lista de un idioma, usando pistas léxicas del párrafo y la
preferencia en casos ambiguos. Una corrección claramente más cercana puede
corresponder a una palabra extranjera insertada en la frase. No es comprensión
semántica; una palabra válida mal usada necesita revisión contextual.
Las formas Unicode equivalentes de un acento se reconocen sin cambiar el texto
ni las posiciones de la selección.

El menú muestra candidatos locales inmediatamente, identificados como
**sin contexto**. Se actualiza al pasar a otra palabra y permite mover el puntero
al menú para elegir una propuesta, sin exigir un clic previo ni cerrar el anterior.

El método predeterminado es **LanguageTool · con contexto**. Al detener el puntero
o tocar una palabra marcada, Atlas envía únicamente su párrafo al endpoint de
revisión de Atlas, que consulta LanguageTool. No envía otras entradas, notas ni
historial y no llama a un modelo de IA. Cuando llega la respuesta, sustituye los candidatos locales por propuestas
contextuales limitadas a la palabra o frase señalada. Si el servicio no señala un
error, no se muestran candidatos locales como si fueran un resultado contextual.
Si no hay conexión o hay un error de cuota, los candidatos locales siguen siendo
utilizables y el panel explica que no se completó la revisión contextual. Los diagnósticos del párrafo
revisado se reutilizan mientras su contenido permanezca igual.

**Local · sin conexión ni contexto** utiliza nspell y Hunspell. Su panel identifica
las propuestas como candidatos locales, no como recomendaciones contextuales.
Puede servir sin red, pero no resuelve significado, homófonos o todas las
separaciones de palabras. La selección del menú es una preferencia para contextos ambiguos, no una
exclusión del otro idioma. La preferencia automática es el valor inicial y
sustituye las preferencias antiguas que forzaban un idioma sobre toda la página.

No se modifica el contenido al señalarlo. El usuario elige el reemplazo.
**Agregar al diccionario** guarda la palabra en este navegador; **Ignorar esta
palabra** dura la sesión. Código, enlaces y átomos inline están protegidos contra
las correcciones inline. Una página en solo lectura permite consultar propuestas,
pero sus botones de reemplazo están desactivados y la aplicación vuelve a
comprobar el bloqueo.

## Corregir un párrafo

**Corregir párrafo…**, en el menú de la palabra o en Más del editor, muestra los
hallazgos del método elegido. LanguageTool revisa también errores de contexto
que un diccionario puede aceptar como palabras válidas. El método local ofrece
un botón explícito para solicitar la revisión contextual del párrafo.

Todas las opciones empiezan en **Conservar**. Solo se habilita **Aplicar
correcciones** después de elegir cambios. La vista previa muestra el resultado;
no se aceptan cambios solapados. La aplicación conserva bloques vecinos, utiliza
posiciones del editor y se deshace con Ctrl+Z. Si el documento cambió, se cerró el
editor o la página fue bloqueada, el resultado no se aplica.

## Panel Abc✓

El panel permite revisar una selección, el último campo enfocado o texto pegado.
Comparte el idioma y la caché contextual con el menú de palabras.

- **Navegador**: corrección nativa dentro del campo del panel mediante clic
  derecho. Sus idiomas y disponibilidad dependen del navegador. No existe una API
  estándar que permita a Atlas leer sus sugerencias. En el editor BlockNote el
  subrayado nativo está desactivado para no duplicar el corrector de Atlas.
- **LanguageTool**: envía el fragmento al pulsar **Revisar texto**. Las propuestas
  se eligen individualmente; se puede conservar el original.
- **IA**: revisión explícita con el modelo elegido y el idioma seleccionado.
  Solo se envía el fragmento. Conserva la comprobación de respuesta truncada y
  utiliza la clave y las tarifas del proveedor ya configurado.

**Aplicar al fragmento** solo escribe si existe un destino válido y editable que
no cambió durante la consulta. En el editor se limita a una selección dentro de
un bloque, sin código ni átomos inline. Selecciones de varios bloques pueden
revisarse y copiarse, pero no se reemplazan directamente.

## Eficiencia y configuración

Cerrar un menú local no provoca otro análisis si el documento no cambió. Una
respuesta contextual actualiza únicamente las decoraciones del párrafo revisado,
con identificadores que no renumeran el resto de marcas. Durante una edición las
decoraciones existentes se mapean a las nuevas posiciones y después se revisan.

La detección local reutiliza el análisis de los nodos inmutables de ProseMirror y
memoriza consultas de diccionario; una edición no vuelve a analizar todas las
palabras de los bloques vecinos. Se mantiene el recorrido ligero para reconstruir
las posiciones y decoraciones.

La consulta por hover espera 350 ms. El servicio recibe un párrafo por solicitud,
no una solicitud por palabra. Popup y Abc✓ comparten solicitudes simultáneas y una
caché de cinco minutos, limitada a 64 fragmentos y separada por texto e idioma.
Los números romanos canónicos no se marcan como errores; el vocabulario técnico
incluye Java, Spring y arquitectura de software. No se ignoran todas las palabras
en mayúsculas: una errata como «ABJETO» sigue detectándose.

Se descartan respuestas de una página, documento o idioma que ya cambió. Un 429
activa una pausa de un minuto; errores de conexión, tiempo o cuota se muestran
sin presentar los candidatos locales como revisión contextual ni recurrir a IA.

Las faltas genéricas que LanguageTool atribuya a una palabra válida del otro
idioma se descartan utilizando el identificador de su regla. Se mantienen las
reglas gramaticales específicas: reconocer vocabulario bilingüe no desactiva
la revisión del uso de las palabras en la frase.

El endpoint predeterminado es `https://api.languagetool.org/v2/check`.
`LANGUAGETOOL_URL` permite usar `/v2/check` de una instancia propia. La dirección
solo la configura el servidor, nunca la petición del navegador. El servicio
público gratuito tiene límites; su disponibilidad y capacidad no están
garantizadas. Para uso intensivo debe configurarse una instancia con capacidad
adecuada. La revisión acepta hasta 10 000 caracteres y requiere sesión de Atlas. Puede
resolver el idioma por párrafo; si aún es ambiguo se permite detección automática
del servicio. La revisión con IA debe conservar el idioma de cada fragmento.

Los diccionarios son `dictionary-es` y `dictionary-en` 4.0.0 con `nspell` 2.1.5.
El build copia sus archivos y licencias a `static/spelling/`.

## Validación

- `tests/test_proofreading.py`: idioma, autenticación, límites, transporte,
  cuota, respuestas inválidas y offsets UTF-16 sin dividir emojis.
- `editor-src/test/spellingWords.test.js`: reconocimiento bilingüe con propuestas separadas, errores
  comunes, vocabulario técnico, NFC/NFD y candidatos.
- `editor-src/test/spellingReview.test.js`: rangos protegidos, inserciones,
  deduplicación y caché.
- `editor-src/test/textEdits.test.js`: diferencias conservadoras y formato.
- `tools/check_spelling_hover.cjs`: Atlas completo y cuatro temas reales; hover
  entre palabras, proveedor no disponible, términos de una página técnica,
  alcance del menú, deshacer y subrayado opcional sin perder sugerencias.
- `tools/check_spelling.cjs`: editor compilado y panel reales en escritorio,
  teléfono y tablet; solo las respuestas de LanguageTool están simuladas.

La solicitud de prueba al servicio público durante esta implementación fue
bloqueada por el proxy del entorno (`Tunnel connection failed: 403 Forbidden`).
No se certifica aquí la calidad ni disponibilidad del servicio vivo. Las pruebas
de integración controladas no equivalen a una evaluación lingüística del proveedor
ni a probar hardware Samsung físico.
