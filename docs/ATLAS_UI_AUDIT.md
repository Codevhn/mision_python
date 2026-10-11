# Auditoría de integración visual: Finanzas y meta

Revisión del 10 de octubre de 2026, a partir de las capturas del sistema publicado. Se revisaron Inicio, Finanzas, sus cuatro formularios y los selectores compartidos de las ventanas de Atlas.

| Problema observado | Corrección |
| --- | --- |
| Barras horizontal y vertical en un formulario que cabía en pantalla | Los adornos sobresalían tres píxeles y generaban desbordamiento. El marco permanece fuera del área desplazable; solo el cuerpo del formulario puede desplazarse verticalmente cuando falta altura. |
| Menús de Moneda y Cuenta con selección azul del navegador | Reutilización de los selectores de Atlas, incluidos Tipo y Cuenta de destino. Conservan los valores del formulario, validación y eventos. |
| Mes y Fecha con calendario del navegador y textos en inglés | Calendarios con colores de Atlas y textos en español, operables con ratón y teclado. |
| Menús flotantes que podían desplazarse respecto al campo dentro del cristal | Los menús usan la capa superior del navegador para evitar que el efecto del marco altere sus coordenadas. |
| Acciones como «Cuenta» y «Presupuesto» demasiado pequeñas | Botones con superficie Aero, borde, altura y respuesta al foco/hover coherentes con el resto de controles. |
| Espacios vacíos altos y ahorro con indicaciones repetidas | Estados vacíos compactos, indicación única para empezar y barras de comparación vacías cuando no existen importes. |

La comprobación en Chromium cubre Meta, Cuenta, Movimiento y Presupuesto; selectores en Inicio y Finanzas; selección de mes y fecha; Tab, flechas y Escape; alineación de menús; temas claro, ámbar y esmeralda; y pantallas estrechas o bajas. También se verificaron los selectores compartidos de otros diálogos con cinco temas, opciones deshabilitadas y retirada del menú al cerrar la ventana.

Se repitió el recorrido de Finanzas para comprobar guardado, transferencias, presupuestos y gráficos después de sustituir los controles. Esta revisión cubre las superficies indicadas; no representa una auditoría completa de todos los espacios de Atlas.

Capturas de la implementación:

- [Meta y selector de moneda, sin barras del marco](../design/atlas-finance-goal-polished.png)
- [Calendario y estados vacíos de Finanzas](../design/atlas-finance-calendar-polished.png)
