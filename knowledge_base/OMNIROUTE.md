# OmniRoute en Fly.io

La aplicación admite OmniRoute como proveedor compatible con OpenAI, incluyendo
las respuestas en streaming. Aparece en el selector cuando hay una clave y modelos disponibles.

Configura `OMNIROUTE_BASE_URL` con la URL base terminada en `/v1` y
`OMNIROUTE_API_KEY` con una clave nueva de OmniRoute. La aplicación consulta
`/v1/models` con autenticación y conserva el catálogo durante cinco minutos.
Si tus combos no aparecen en ese catálogo, configura `OMNIROUTE_MODELS`
con sus identificadores exactos separados por comas. Esta opción reemplaza
el catálogo automático. Los identificadores se envían sin modificaciones.

Desde una terminal Bash con Fly CLI autenticado, en la raíz del proyecto:

```bash
fly secrets set OMNIROUTE_BASE_URL=https://sms-jacket-aus-amenities.trycloudflare.com/v1 -a mision-pythonhn
read -rsp 'Nueva clave de OmniRoute: ' omniroute_key
printf '\n'
printf 'OMNIROUTE_API_KEY=%s\n' "$omniroute_key" | fly secrets import -a mision-pythonhn
unset omniroute_key
# Opcional: reemplaza estos ejemplos por los identificadores de tus combos.
# fly secrets set OMNIROUTE_MODELS='combo-estudio,combo-codigo' -a mision-pythonhn
fly deploy -a mision-pythonhn
```

Abre el proyecto, inicia sesión y selecciona OmniRoute en el selector de IA.
Prueba una consulta y una respuesta en streaming con uno de tus combos.
No se ha verificado la conexión real durante la implementación: los tests usan
respuestas simuladas, sin consumir tus proveedores.

El túnel y OmniRoute deben seguir encendidos en tu computadora.
Un Quick Tunnel puede cambiar de dirección al reiniciarse; actualiza
`OMNIROUTE_BASE_URL` si cambia. Para uso permanente, configura una URL estable.
Revoca cualquier clave que haya quedado visible en capturas.
