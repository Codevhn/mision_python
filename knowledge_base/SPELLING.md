# Corrector ortográfico

Abre **Abc✓** en la barra superior. También puedes seleccionar un fragmento del
editor y elegir **Revisar ortografía…**, o pulsar **Abc✓** junto al envío del
borrador del asistente. Sin selección, el botón usa el último campo de texto
enfocado; también permite pegar un texto y copiar la propuesta.

## Corrección dentro del editor

El editor carga un diccionario español local y subraya posibles errores mientras
escribes. Pasa por una palabra marcada o tócala para elegir una sugerencia;
por ejemplo, «abjeto» propone «objeto». El panel permanece abierto al mover el
ratón o desplazar la página; se cierra al pulsar fuera, usar Escape o aplicar
una acción. Pasar sobre otra palabra no reemplaza la sugerencia abierta.
**Ignorar esta palabra** guarda la
excepción en este navegador. El análisis no envía el contenido a una API ni a IA.
Se excluyen el código y los enlaces.

**Corregir párrafo…**, en las sugerencias o en **Más**, muestra todas las
propuestas del párrafo y una vista previa. Puedes elegir otra sugerencia o
conservar cada palabra. **Aplicar correcciones** realiza los cambios juntos,
conservando el formato y los bloques vecinos; Ctrl+Z los deshace. Si cambió el
documento durante la revisión, se rechaza la aplicación. El diccionario detecta
ortografía; la revisión gramatical sigue disponible mediante los otros métodos.

El diccionario procede de `dictionary-es` 4.0.0 y el motor es `nspell` 2.1.5.
Sus licencias se incluyen en `static/spelling/`. `npm run build` copia los
archivos del diccionario al directorio estático para servirlos desde Atlas.

## Tres métodos adicionales

- **Navegador**: revisión nativa con subrayados y sugerencias mediante clic
  derecho. Activa español en la configuración de corrección del navegador.
  Atlas no envía texto a LanguageTool ni a un modelo en este modo. La calidad,
  los idiomas instalados y la disponibilidad en móvil dependen del navegador;
  su propia opción de corrección mejorada puede utilizar un servicio externo.
- **LanguageTool**: pulsa **Revisar texto** para analizar ortografía y gramática
  sin IA. Elige las sugerencias deseadas; **Conservar original** permite
  descartar una sugerencia ya elegida. El servicio público gratuito se utiliza
  sin clave y tiene límites de uso. Los errores de conexión y de cuota no
  bloquean los otros métodos.
- **IA**: elige cualquier modelo disponible en Atlas y pulsa **Revisar texto**.
  Solo se envía el fragmento, sin contexto de Atlas ni historial. La propuesta
  puede editarse antes de aplicarla. Usa las claves y las tarifas del proveedor
  elegido; no necesita una integración nueva con OmniRoute.

Ningún método reemplaza automáticamente el texto. **Aplicar al fragmento**
reemplaza la selección capturada o el texto del campo elegido. Si el texto
cambia mientras se revisa, se rechaza el reemplazo y se pide abrir de nuevo el
corrector. **Copiar propuesta** funciona para textos pegados o de solo lectura.

En el editor, el reemplazo directo se limita a una selección dentro de un
párrafo y excluye código. Solo se modifican los segmentos distintos: se
conservan los bloques vecinos y el formato del texto intacto. Los cambios son
transacciones del editor, se guardan mediante su autosave existente y se pueden
deshacer con Ctrl+Z. Selecciones de varios párrafos o de código pueden revisarse
y copiarse, pero no se reemplazan directamente. El corrector nativo está
activado en el editor, el título y el chat, y desactivado en bloques de código.

## Configuración de LanguageTool

La URL predeterminada es `https://api.languagetool.org/v2/check`.
`LANGUAGETOOL_URL` permite usar el endpoint `/v2/check` de una instancia propia.
La URL solo se configura en el servidor; no la controla el navegador.

En Fly, si se dispone de otra instancia accesible:

```bash
fly secrets set LANGUAGETOOL_URL=https://TU-INSTANCIA/v2/check -a mision-pythonhn
```

No hace falta configurar nada para probar el servicio público. Los límites y
las políticas de ese servicio pueden cambiar; una instancia propia requiere
un servidor accesible y sus propios recursos. La revisión remota acepta hasta
10 000 caracteres por fragmento y siempre requiere una sesión de Atlas.

## Validación

`tests/test_proofreading.py` verifica autenticación, límites de entrada,
selección del modelo, respuesta de cuota y offsets UTF-16 (incluidos emojis).
`editor-src/test/textEdits.test.js` prueba reemplazos conservadores y Unicode.
El editor se construye con `npm run build`; sus archivos compilados se incluyen
en el repositorio para que Fly no necesite compilarlo durante el despliegue.
