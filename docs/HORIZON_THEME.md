# Horizonte

En **Apariencia → Paisajes vivos → Horizonte** se activa un paisaje fijo detrás
de Atlas. La elección se guarda con las demás preferencias de tema. El terreno
incluye tres cordilleras, laderas arboladas y un río; la luz, la vegetación, la
bruma y las cumbres cambian entre día, noche, lluvia, nieve y tormenta. El cielo
reutiliza las nubes, estrellas, sol/luna y precipitación del encabezado existente.
No usa imágenes externas, vídeos ni nuevas dependencias.

Los paneles usan cristal oscuro translúcido. Campos, menús y zonas de texto tienen
más opacidad. El paisaje permanece al navegar a Biblioteca, Finanzas y otras
secciones. Finanzas copia el identificador del tema al iframe y deja transparente
su fondo para ver el mismo paisaje, sin ejecutar otro motor meteorológico.
Los cursos conservan Horizonte en modo automático; una elección personalizada
explícita del curso sigue teniendo prioridad. Los libros y PDF conservan sus
opciones de lectura y el fondo propio del documento.

La animación se pausa con el botón de viento de la barra superior. Se comparte
la preferencia de movimiento del cielo de Inicio. Se respeta el movimiento
reducido y se detiene el dibujo al ocultar la pestaña. Al salir de Horizonte se
eliminan el Canvas, el botón, los observadores y el intervalo del paisaje, y se
restaura el cielo del encabezado si Inicio está visible.

El renderer dibuja las nubes y el terreno en superficies auxiliares reutilizadas:
no reconstruye las montañas ni genera textura por fotograma. Se mantiene el límite
de 20 fps y DPR 1 en móvil, 30 fps y DPR 1.5 en escritorio. En móvil se reduce el
desenfoque de las tarjetas.

Usa la geolocalización y el endpoint meteorológico existentes. Comparte los datos
de Inicio y mantiene una sola actualización periódica cada diez minutos mientras
la pestaña está visible. Sin ubicación o datos muestra un paisaje ilustrativo
neutro, sin inventar temperatura ni condición. El login usa este paisaje neutro y
no solicita ubicación; el clima se obtiene dentro de la aplicación autenticada.

## Verificación

- 301 pruebas del servidor aprobadas.
- Chromium: selección desde la galería, persistencia, movimiento de píxeles y pausa,
  paisaje fijo entre secciones, transparencia de Finanzas, herencia de cursos,
  estados meteorológicos diurnos/nocturnos, movimiento reducido y pestaña oculta.
- Vista móvil de 412 × 820, Canvas con DPR 1, control de pausa pulsable, sin
  desbordamiento horizontal; restauración del tema anterior y del cielo de Inicio.
- Login neutro y cambio de apariencia; ubicación no disponible sin clima inventado.
- Regresión del cielo de Inicio: ocho estados, cuatro temas, pausa, persistencia,
  movimiento reducido, navegación y error del endpoint.

Datos meteorológicos y financieros simulados en el entorno local de pruebas.
No se validó en un Samsung físico ni se desplegó esta revisión en Fly.

Capturas: [día](../design/atlas-horizon-day.png),
[lluvia](../design/atlas-horizon-rain.png), [noche](../design/atlas-horizon-night.png),
[móvil](../design/atlas-horizon-mobile.png), [login](../design/atlas-horizon-login.png).
