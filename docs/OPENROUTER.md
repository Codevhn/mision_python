# OpenRouter directo en Atlas

## Selección y configuración

El selector ofrece el catálogo público de modelos de chat de OpenRouter,
incluidos gratuitos y de pago. Los identifica con «Gratis vía OpenRouter» o
«De pago vía OpenRouter». Se excluyen modelos que no acepten texto y produzcan
texto, por ejemplo los dedicados exclusivamente a imágenes o embeddings.
El catálogo se conserva en memoria durante una hora. Si su consulta falla,
se muestra un aviso y se conserva la última lista obtenida correctamente.

La opción cuyo proveedor es **OpenRouter** envía la consulta directamente a
`https://openrouter.ai/api/v1/chat/completions`, utilizando `OPENROUTER_API_KEY`.
Debe estar configurada en la aplicación Fly que ejecuta Atlas. No hace falta
crear otra clave por haber añadido saldo a la misma cuenta; sí revisar sus
límites y permisos si el proveedor rechaza la solicitud.

El combo llamado **OpenRouter** cuyo proveedor es **OmniRoute** sigue siendo
una ruta diferente: usa la configuración y la clave de OmniRoute. Esa conexión
no se modifica ni se sustituye al habilitar OpenRouter directo.

Después de desplegar, recargar Atlas, buscar el modelo deseado y seleccionar
la opción con proveedor **OpenRouter**. La selección anterior puede seguir
apuntando al combo de OmniRoute. Los modelos directos de OpenRouter no se
añaden a la rotación automática de alternativas; se usan al seleccionarlos.

## Diagnóstico y validación

Antes de esta corrección, existía una función que filtraba solo gratuitos,
pero el selector ni siquiera la llamaba: ocultaba todo el proveedor directo.
Por tanto, añadir saldo no incorporaba modelos de pago a la lista de Atlas.

También se ignoraban los errores enviados dentro de un stream HTTP 200,
que podían terminar apareciendo como una respuesta vacía. Ahora se propagan
al asistente. Un error 402 indica revisar saldo o límite de la clave; un 429,
la cuota o disponibilidad del modelo.

`test_openrouter.py` comprueba catálogo gratuito/de pago, compatibilidad,
caché, fallos de catálogo, configuración independiente, envío a la API directa,
errores durante el stream y exclusión de la rotación automática. Las respuestas
de la API se simulan: estas pruebas no gastan crédito ni acreditan que la clave
de producción o un modelo concreto estén funcionando en Fly.
