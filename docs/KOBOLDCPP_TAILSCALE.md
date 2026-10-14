# KoboldCpp en tu PC y Atlas en Fly: enlace privado

La implementación está preparada; una cuenta Tailscale y la configuración del
PC/Fly son requisitos externos. No aparece un modelo local hasta que Fly pueda
consultar `/v1/models`. No se cambia automáticamente a un proveedor de pago.

## 1. PC conectado y modelo cargado

Instala Tailscale desde https://tailscale.com/download e inicia sesión. En Arch:

```bash
sudo pacman -S tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
curl --fail http://127.0.0.1:5001/v1/models
tailscale ip -4
```

Adapta el puerto si KoboldCpp usa otro. Debe anunciar el modelo cargado. Conserva
KoboldCpp escuchando en localhost; no actives enlaces públicos ni abras puertos
en el router. Tailscale Serve expone el puerto sólo dentro de tu red privada:

```bash
sudo tailscale serve --bg --tcp=5002 tcp://127.0.0.1:5001
tailscale serve status
```

Este comando usa **Serve**, no **Funnel**. Son dos puertos distintos:
KoboldCpp escucha localmente en 5001 y Tailscale lo publica en 5002. Usar 5001
en ambos puede impedir que KoboldCpp arranque si escucha en todas las interfaces.
Si habías configurado la versión anterior, retírala antes de habilitar 5002:

```bash
sudo tailscale serve --tcp=5001 off
```

Si KoboldCpp usa otro puerto, cambia sólo el destino `127.0.0.1:5001`, manteniendo
distinto el puerto publicado por Serve.
Si tu cliente es antiguo, actualízalo antes de usar estas opciones.

## 2. Restringir el acceso de Fly

En https://login.tailscale.com/admin/acls configura una etiqueta `tag:atlas`
y permite que los nodos con esa etiqueta accedan únicamente a la IP del PC y
puerto de KoboldCpp. Ejemplo para una cuenta nueva, sustituyendo la IP:

```json
{
  "tagOwners": { "tag:atlas": ["autogroup:admin"] },
  "grants": [{
    "src": ["tag:atlas"],
    "dst": ["100.100.100.100"],
    "ip": ["tcp:5002"]
  }]
}
```

Las reglas se suman: una regla anterior que permite todo también permite el
acceso de Fly a otros servicios. En una cuenta recién creada, sustituye la
política inicial permisiva por este ejemplo. En una cuenta con otros equipos,
revisa/combina las reglas sin borrar su política a ciegas. Este ejemplo no
autoriza conexiones de otros equipos; añade sólo las que necesites.

## 3. Clave de registro para Fly

En https://login.tailscale.com/admin/settings/keys crea una auth key con etiqueta
`tag:atlas`, reutilizable y no efímera. Si la cuenta usa aprobación de dispositivos,
preautorízala o aprueba posteriormente el nodo. La clave permite registrar Fly;
no es la contraseña de Atlas. No la pegues en el chat ni en el repositorio.

Con la sesión de flyctl iniciada en tu PC, usa el asistente desde la raíz del repo:

```bash
git pull origin main
bash tools/connect_kobold_fly.sh
fly deploy -a mision-pythonhn
```

El script pide la IP privada, el puerto de Serve (5002) y la clave (entrada oculta). Prepara los
secretos por stdin para el próximo despliegue de Fly, evitando introducir el valor de la clave en el historial
de comandos. Si configuraste un bearer token en KoboldCpp, añade también
`KOBOLDCPP_API_KEY` mediante la interfaz de secretos de Fly, sin compartirlo.

## 4. Comprobación

Con el PC y KoboldCpp encendidos, abre Atlas e inicia sesión. En el asistente:
**Estado de modelos → Comprobar KoboldCpp**. Debe indicar Conectado y el modelo.
Selecciona **Local · KoboldCpp** y pregunta algo breve. Para la primera prueba,
desactiva **Consultar Atlas** y el contexto de la vista actual: así no envías
documentos extensos al modelo antes de comprobar el enlace. Cambiar un GGUF requiere
cambiarlo en KoboldCpp y volver a comprobar; Atlas no carga modelos en el PC.

En la consola de Tailscale debe aparecer `atlas-fly-...` con la etiqueta adecuada.
La URL usada desde Fly es `http://IP-PRIVADA:5002/v1`; la comprobación local en el
PC sigue siendo `http://127.0.0.1:5001/v1/models`. Si ya habías configurado Fly con
el puerto antiguo, actualiza `KOBOLDCPP_BASE_URL` a 5002 mediante los secretos de
Fly o ejecuta de nuevo el asistente; cambia también la regla de acceso a tcp:5002.
Si el registro falla, Atlas continúa sirviendo su web; el proveedor local queda
inaccesible y el diagnóstico muestra el fallo. Revisa clave, etiqueta, aprobación,
IP/puerto, Serve y política. La conexión completa requiere validación contra el
PC real; las pruebas de código no la sustituyen.

## Funcionamiento y costes

- Tailscale se ejecuta en modo userspace: no usa `/dev/net/tun` ni privilegios extra.
- Su proxy HTTP sólo escucha en `127.0.0.1:1056`. Únicamente las solicitudes a
  KoboldCpp lo usan; las demás APIs mantienen su conexión normal.
- El estado se guarda en `/data/tailscale` con permisos restringidos. Contiene la
  identidad privada de Fly: protege el volumen y sus copias de seguridad.
- La clave temporal de arranque se borra y no se hereda al proceso de Atlas.
- El contenedor usa una imagen Tailscale verificada y fijada por digest. No descarga
  ni ejecuta un instalador remoto durante el arranque.
- No hay otra máquina Fly; sí hay algo de consumo adicional de CPU/RAM y tráfico
  en la máquina existente. Se conserva la política de autoapagado de fly.toml.
- El arranque inicial puede tardar hasta unos 45 segundos. No se alquila una GPU:
  la inferencia y sus límites de memoria/contexto siguen estando en tu PC.

Para desactivar el enlace y retirar el proveedor local:

```bash
fly secrets unset -a mision-pythonhn ATLAS_TAILSCALE_ENABLED TAILSCALE_AUTHKEY KOBOLDCPP_BASE_URL
```

También puedes revocar la clave y retirar el nodo Fly desde Tailscale. En el PC,
`sudo tailscale serve reset` retira todos los servicios Serve: úsalo sólo si no
compartes otros servicios con esa configuración.

## Validación de implementación

Pasaron 295 pruebas del servidor, incluidas consultas reales a un proxy HTTP
local de prueba (catálogo, respuesta y streaming), aislamiento de otros
proveedores, arranque con registro exitoso/fallido simulado y envío de secretos
por stdin sin imprimirlos. La imagen Docker se construyó y arrancó: login y
diagnóstico autenticado funcionan con el enlace desactivado; también se verificó
el arranque sin clave y los binarios Tailscale copiados. El build de prueba usó
el certificado del proxy de desarrollo sólo durante la instalación, sin
incorporarlo al runtime ni desactivar la verificación TLS. La conexión autenticada
con la red Tailscale y el PC del usuario sigue siendo una comprobación externa.
