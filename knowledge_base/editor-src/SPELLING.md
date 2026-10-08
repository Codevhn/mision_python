# Ortografía de Atlas

El corrector local usa nspell y los diccionarios Hunspell de `dictionary-es`
y `dictionary-en`. Acepta una palabra si cualquiera de ellos la reconoce.
No envía el texto a un proveedor de IA ni sustituye palabras sin aprobación.

`src/technicalVocabulary.json` es un vocabulario complementario de Atlas,
organizado por ámbito. Es una colección inicial revisable, no un diccionario
universal ni un servicio externo actualizado automáticamente. Para ampliarlo,
añadir el nombre canónico en la categoría correspondiente y verificar su
ortografía en la documentación del producto. No agregar errores deliberados.
La misma colección sirve para reconocer palabras y proponer correcciones.

Las sugerencias combinan los dos idiomas y el vocabulario técnico. Se validan
contra el diccionario, se deduplican y se comparan mediante distancia de edición
con intercambios de letras adyacentes. Se permiten hasta un cambio en palabras
cortas y dos en palabras largas, con un límite proporcional de 34 %. A igual
distancia se priorizan nombres técnicos, semejanza proporcional y orden del
motor. Para palabras con mayúsculas internas, si hay un candidato técnico
cercano, solo se muestran esos candidatos para evitar formas artificiales
como «REdiL». El filtro es conservador: puede omitir correcciones de errores graves.
No entiende semántica ni garantiza cuál es la palabra que quiso escribir el
usuario. Si no hay candidatos cercanos, la interfaz lo indica.

Los nombres técnicos conservan su grafía canónica. Las palabras comunes
conservan mayúsculas iniciales o completas. El diccionario personal sigue
guardándose en el navegador; ignorar una palabra dura la sesión. El texto
marcado como código y enlaces queda fuera del análisis.

Validación: `npm test` y `npm run build`. Las pruebas cubren REPiL → REPL,
Pychram → PyCharm, Thony → Thonny, errores en español e inglés, candidatos
lejanos, Unicode y conservación de mayúsculas.
