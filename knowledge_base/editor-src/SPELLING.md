# Ortografía de Atlas

Implementación: `src/inlineSpelling.js` (detección, decoraciones y aplicación),
`src/spellingWords.js` (diccionarios/candidatos) y `src/spellingReview.js`
(preferencias, contrato de rangos y transporte contextual compartido con Abc✓).
La documentación de uso y configuración está en `../SPELLING.md`.

Se carga solo el diccionario del idioma seleccionado: español o inglés. El
vocabulario de `src/technicalVocabulary.json` es una colección complementaria de
nombres canónicos, no un diccionario general ni un sustituto de revisión contextual.
NFC se usa para consultar y comparar palabras, sin normalizar el documento ni
alterar sus posiciones UTF-16.

En modo local los candidatos se validan, deduplican y ordenan por distancia de
edición con intercambios adyacentes. Se permiten hasta uno o dos cambios según
longitud, con límite proporcional del 34 %. Los nombres técnicos conservan su
forma canónica. Este criterio no mide frecuencia ni significado: la UI lo
identifica como revisión sin contexto.

El modo contextual predeterminado muestra primero candidatos locales identificados
y consulta LanguageTool por párrafo. Al recibir su respuesta, el popup filtra los
hallazgos por rango. Si falla el servicio conserva los candidatos locales con un
estado explícito. El hover actualiza la palabra activa y permite alcanzar el menú.
El servidor recibe el idioma explícito. Las marcas del párrafo ya revisado usan
los hallazgos contextuales, sin arrastrar marcas locales que el servicio no confirmó.

Las revisiones empiezan conservando el original. Toda aplicación comprueba
editabilidad y versión del documento, excluye código/enlaces/átomos del recorrido
inline, usa transacciones y separa el historial para deshacer la corrección.
Las respuestas tardías no reabren el popup ni se aplican sobre otro documento.

Construcción y pruebas: `npm test`, `npm run build` y, desde la raíz,
`node tools/check_spelling.cjs`. Este último utiliza respuestas controladas del
servicio y el editor real en tres perfiles. No certifica calidad del proveedor.

El subrayado es una preferencia visual independiente: las decoraciones conservan
`atlas-spelling-target` como destino de hover y añaden `atlas-spelling-error` solo
cuando está activado. No se eliminan decoraciones ni se desactiva la interacción
para ocultar las marcas. Los números romanos se validan estructuralmente.
