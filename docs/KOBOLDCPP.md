# Probar KoboldCpp con Atlas

Atlas usa la API OpenAI de KoboldCpp (`/v1/models` y `/v1/chat/completions`).
El modelo anunciado por el servidor aparece como **Local · KoboldCpp**. Cambiar el
modelo en Atlas no carga otro GGUF: hay que cambiarlo en KoboldCpp y comprobar
la conexión de nuevo. No se necesitan servicios de pago para esta conexión.

## Primera prueba, ambos programas en tu PC

1. Carga en KoboldCpp un solo modelo que ya funcione en su interfaz. Activa su
   servidor API y anota el puerto (habitualmente 5001). No habilites un enlace
   público de KoboldCpp. Conserva el acceso limitado a tu equipo.
2. Comprueba el catálogo desde una terminal:

   ```bash
   curl --fail http://127.0.0.1:5001/v1/models
   ```

   Debe devolver JSON con `data` y el identificador del modelo. Si devuelve
   HTML/404, comprueba la versión de KoboldCpp, el puerto y la API compatible
   con OpenAI. Si activaste autenticación, usa tu clave sin compartirla.
3. Ejecuta Atlas en tu PC con el entorno Python y sus dependencias habituales.
   La configuración local es:

   ```bash
   export KOBOLDCPP_BASE_URL=http://127.0.0.1:5001/v1
   export KOBOLDCPP_MAX_OUTPUT_TOKENS=1024
   ```

   Conserva `SECRET_KEY` y `KB_PASSWORD` de tu instalación de Atlas. Para una
   prueba separada, el lanzador siguiente pide una contraseña sin mostrarla,
   genera una clave temporal de sesión y guarda todo en un directorio nuevo:

   ```bash
   .venv/bin/python tools/run_atlas_local.py
   ```

   Abre `http://127.0.0.1:8080`, entra con esa contraseña y abre el asistente.
   Esta instancia usa datos de prueba separados, no los datos de Fly.
4. Selecciona **Local · KoboldCpp**. Para la primera prueba desactiva
   **Consultar Atlas** y pregunta algo breve: «Explica una variable de Python
   con un ejemplo». Después puedes probar con contexto y documentos.
5. En **Estado de modelos → Comprobar KoboldCpp** se verifica la conexión y se
   actualiza el selector cuando cambias el modelo cargado.

Si falta la conexión, Atlas muestra el error y no anuncia modelos obsoletos.
Seleccionar KoboldCpp nunca activa el fallback a una API de pago. Tampoco se
usa el modelo local como respaldo de otros proveedores sin seleccionarlo.

## Atlas en Fly y KoboldCpp en tu PC

`127.0.0.1` en Fly es la máquina de Fly, no tu PC. Configurar una dirección de
Tailscale en Atlas tampoco conecta por sí sola la máquina de Fly a Tailscale.
Antes de configurar el proveedor, ambos extremos necesitan un enlace privado
operativo (por ejemplo, Tailscale con un cliente/proxy en Fly y permisos
restringidos a este servicio). La configuración de ese enlace depende de la
instalación del usuario y se prepara por separado.

Una vez que Fly pueda consultar el catálogo a través del enlace privado:

```bash
fly secrets set -a mision-pythonhn KOBOLDCPP_BASE_URL=http://DIRECCION-PRIVADA:PUERTO/v1 KOBOLDCPP_MAX_OUTPUT_TOKENS=1024
```

No uses ese ejemplo con una dirección pública sin protección. No publiques el
puerto 5001 en el router. Si el servicio o el puente requiere un bearer token,
configura `KOBOLDCPP_API_KEY` como secreto de Fly; Atlas no lo envía al navegador.
No pegues claves en el chat, en documentación ni en el repositorio.

## Alcance de esta primera versión

- Admite respuestas normales y streaming de la API compatible con OpenAI.
- La consulta del catálogo espera hasta tres segundos.
- Limita la salida a 1024 tokens por defecto; es configurable entre 128 y 8192.
- No modifica el contexto ni la aceleración GPU de KoboldCpp. Configura un
  contexto suficiente para Atlas; las entradas largas y revisiones documentales
  pueden excederlo. Prueba primero consultas cortas y comprueba velocidad/RAM.
- Una revisión documental puede hacer varias llamadas al modelo local. El límite
  de salida no garantiza que el contexto de entrada quepa en un modelo pequeño.
- No fuerza extensiones `response_format` o `stream_options` que algunas versiones
  de KoboldCpp no admiten. Las tareas que requieren JSON siguen validándolo en Atlas.
- No carga modelos, no consulta archivos de tu PC y no habilita ejecución de código.
- Validación de implementación con un servidor de prueba compatible. La conexión
  con el KoboldCpp y GPU reales del usuario requiere ejecutar los pasos anteriores.
