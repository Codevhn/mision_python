# Cielo animado en Inicio

La escena ocupa sólo el encabezado del saludo. Conserva el marco Centinela y la
paleta del resto de Atlas; no hay vídeos, imágenes externas ni librerías nuevas.
Usa los datos del endpoint meteorológico existente y su indicador de día/noche.

Estados: sol y nubes ligeras, nubes parciales, cielo cubierto, niebla, lluvia,
nieve y tormenta; de noche hay luna y estrellas cuando corresponde. La tormenta
usa un resplandor lento y tenue, sin relámpagos ni flashes de pantalla. El cielo
cambia de color gradualmente y el texto mantiene contraste claro sobre una
capa oscura. Sin datos meteorológicos queda el fondo normal del tema.

El cielo usa un degradado vertical y bancos de nubes con silueta, iluminación,
sombras inferiores y textura de vapor. Las capas tienen distintos tamaños,
opacidades y velocidades para dar profundidad. Las nubes se pintan una sola
vez en superficies auxiliares y se reutilizan durante la animación; no se
genera textura por fotograma. El sombreado del saludo se concentra a la
izquierda para conservar los detalles del cielo.

El botón circular de viento en la esquina del encabezado permite pausar o
activar el movimiento. La preferencia se guarda localmente. Se respeta el
movimiento reducido del sistema, mostrando una escena estática y explicándolo
en el título del botón. Se detienen Canvas y el pulso del sol/luna cuando el
encabezado sale del área visible, se oculta la pestaña o se cambia de sección.
Los observadores y listeners se retiran al sustituir la escena.

Canvas limita la densidad de píxeles a 1 en móvil y 1.5 en escritorio, con dibujo
a un máximo aproximado de 20/30 fps y menos partículas en móvil. El clima se
consulta al entrar y cada diez minutos mientras Inicio está abierto y la pestaña
visible. Se usa la geolocalización existente con caché de diez minutos y timeout
de diez segundos; no se añaden solicitudes concurrentes durante el render.

Se retiró el antiguo motor de partículas para el fondo de toda la pantalla,
que los temas actuales ocultaban. También se registra Inicio como sección activa
antes de renderizarlo para que el cielo se reactive al volver desde otra sección.

## Validación

Pasaron 301 pruebas del servidor. La revisión en Chromium con datos meteorológicos
simulados cubre ocho estados, día/noche, cambio real de píxeles en lluvia, pausa
del botón, persistencia tras recarga, movimiento reducido, pausa al desplazar el
encabezado fuera de vista, visibilidad de pestaña simulada y salida/regreso a Inicio.
Se comprobaron Aero rubí, eléctrico, claro y OpenCode; ancho móvil de 412 px,
densidad de Canvas y ausencia de desbordamiento. Un error del endpoint conserva
el tema sin inventar una escena meteorológica. No se probó en hardware Samsung
físico ni se alteraron los datos meteorológicos de producción.

Capturas de la integración con datos de prueba: [lluvia](../design/atlas-weather-rain.png),
[noche](../design/atlas-weather-night.png), [móvil](../design/atlas-weather-mobile.png).
