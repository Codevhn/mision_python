# Marcos Aero: Titanio y Centinela

[Abrir el prototipo](atlas-window-customization.html).

En Atlas publicado: abre **Apariencia** con el botón de tema de la barra superior y pulsa **Probar nuevos marcos**. Se abre una pestaña independiente con las propuestas. También está disponible en `/static/previews/atlas-window-customization.html` del mismo dominio de Atlas. Los tres archivos del prototipo están en `knowledge_base/static/previews/`, por lo que el Dockerfile existente los incluye en el deploy.

Dos propuestas interactivas para personalizar los marcos sin sustituir el estilo Aero de Atlas. El selector incluye un Aero clásico de referencia. El prototipo importa las variables del archivo real `knowledge_base/static/themes.css`; las paletas azul eléctrico, ámbar, rubí, esmeralda y Aero claro cambian cristal, bordes, controles y superficies.

| Propuesta | Anatomía del marco |
| --- | --- |
| **Titanio** | Doble bisel metálico, fijaciones discretas, placa de título y borde inferior ensamblado. |
| **Centinela** | Esquinas angulares, rieles segmentados, conductos de luz y controles encastrados. |

Las reglas decorativas están delimitadas por `data-frame` y `.demo-frame` en [el CSS del prototipo](../knowledge_base/static/previews/atlas-window-customization.css). Cambiar de propuesta mantiene el mismo contenido y los mismos colores. Ese CSS solo se carga en la pestaña de vista previa, no en el espacio de trabajo de Atlas. Integrarlo más adelante requerirá asociar esta anatomía a las ventanas y paneles reales, guardar la preferencia y verificar cada superficie; estas propuestas no representan una integración ya terminada.

## Probar en tu equipo

Desde la raíz del repositorio actualizado:

```bash
python3 -m http.server 8092 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8092/design/atlas-window-customization.html` en el navegador de **ese mismo equipo**. Se recomienda servirlo así para que los iconos SVG compartidos carguen correctamente. No requiere instalar dependencias adicionales ni iniciar el backend de Atlas.

- Alternar las dos propuestas y el Aero de referencia.
- Cambiar las cinco paletas; probar también el tamaño de un teléfono.
- Minimizar la ventana y restaurarla desde la barra inferior; ampliar y restaurar su tamaño.
- Contraer y expandir la ventana de la meta.
- Pasar a Conocimiento para comparar los marcos en una pantalla de aprendizaje representativa.
- Registrar un ingreso o gasto de muestra y consultar Movimientos y Presupuestos.

## Finanzas como escenario de la propuesta

La pantalla utiliza datos ficticios en lempiras (HNL). Incluye cuentas, ingresos, gastos, patrimonio neto, presupuestos y una meta. Los movimientos actualizan saldos, distribución de gastos y presupuestos en memoria. Se calculan importes en centavos enteros y se rechazan gastos superiores al saldo de la cuenta de muestra. Recargar o pulsar **Restablecer muestra** vuelve al estado inicial.

El saldo inicial es L 18,000.00: banco L 13,000.00, ahorro L 4,000.00 y efectivo L 1,000.00. Los movimientos del mes agregan L 18,000.00 de ingresos y L 8,250.00 de gastos. Así, el total en cuentas es L 27,750.00 y el patrimonio neto, descontando L 4,500.00 de deuda, es L 23,250.00. El balance del mes es L 9,750.00; no se confunde con el saldo total.

No hay persistencia, llamadas a API, acceso a bancos ni consultas a modelos. La meta y la deuda son ejemplos fijos. Las entradas de aprendizaje son una vista representativa para comparar el marco. El módulo real de Finanzas queda para una etapa posterior a elegir la personalización.

## Comprobación

Se verificaron en Chromium las propuestas y sus paletas, la navegación, los controles de ventana, los cálculos de movimientos en centavos, los límites de saldo, el texto introducido por el usuario, el reinicio y el cierre de diálogos con Escape. Se comprobaron anchos de 320, 390, 768, 1024 y 1440 px, así como la preferencia de movimiento reducido, sin desbordamiento horizontal ni llamadas a API.

También se verificó el recorrido en el servidor real de Flask: inicio de sesión → Apariencia → Probar nuevos marcos → pestaña de vista previa. Cargaron el HTML, CSS, JavaScript, fuentes e iconos desde `/static/`, se comprobó que el tema guardado de Atlas no cambia al probar las propuestas y que **Volver a Atlas** recupera el tema original. El enlace y la vista previa se comprobaron en escritorio y teléfono.

Capturas del mismo escenario y la misma paleta para comparar:

- [Titanio](atlas-frames-titanium.png)
- [Centinela](atlas-frames-sentinel.png)
- [Aero claro](atlas-frames-light.png)
- [Teléfono](atlas-frames-mobile.png)
