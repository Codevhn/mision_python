# Centinela en Atlas

Centinela es ahora el marco compartido del sistema, no una vista previa. Se activa por defecto y mantiene la paleta, los reflejos y la tipografía del tema elegido. En **Apariencia → Marco de las ventanas** puedes elegir **Centinela** o **Aero clásico** sin cambiar los colores. La elección se guarda en este navegador (`kb_frame`), permanece al recargar y se sincroniza entre pestañas y con Finanzas.

## Superficies

- Navegación, barra superior y panel contextual.
- Inicio, entradas de Conocimiento, Cursos y su estado vacío, Teamspace y Páginas.
- Tableros, mapas mentales y conceptuales, Diagramas, Grafo, Radar, Práctica y Biblioteca, incluido el marco del lector.
- Asistente, notas rápidas, diálogos, búsqueda global y paneles auxiliares.
- Finanzas y sus paneles; sus ventanas y la meta conservan el diseño Centinela ya aprobado.
- Acceso al sistema y páginas compartidas de lectura.

Las ventanas usan biseles, esquinas angulares y un riel segmentado. Los paneles secundarios reciben un borde más ligero y la barra superior una línea discreta. El texto de estudio, las tarjetas del mapa y las explicaciones transparentes conservan su presentación. El marco no añade botones de ventana sin función.

## Integración

`atlas-frames.js` reconoce las superficies compartidas y añade una decoración vacía, oculta para tecnologías de asistencia e inerte. También recupera el marco cuando una vista vuelve a renderizar su contenido. No sustituye formularios, controles ni datos. `atlas-frames.css` usa los tokens del tema; no cambia la fuente ni el fondo del contenido.

Todos los adornos nuevos quedan dentro del perímetro para evitar barras de desplazamiento. Se conservan las posiciones absolutas, fijas y sticky de los contenedores; los contenedores estáticos pasan a ser relativos para anclar su decoración. Los menús de formularios siguen usando la capa superior del navegador. Las ventanas existentes de Finanzas se sincronizan con la preferencia sin añadir otro marco encima.

El brillo se desplaza sobre el borde fijo cada 14 segundos. En los nuevos marcos se pausa fuera de pantalla y cuando la pestaña está oculta. Movimiento reducido desactiva la animación. Al imprimir se oculta la decoración.

## Verificación

La revisión en Chromium cubre acceso, Inicio, navegación, apertura de un formulario real, Asistente, cambio entre espacios, renderizado dinámico, elección y persistencia del marco, cinco temas, lectura de conceptos, sincronización con Finanzas, movimiento reducido y pantallas de 320, 390 y 900 px, incluidas alturas reducidas.

Se repitieron las comprobaciones de los cuatro formularios financieros, calendarios y selectores compartidos, con teclado, opciones deshabilitadas, cierre y retirada de menús. También pasó la prueba de mapas con quince relaciones y el caso de estrés de sesenta relaciones. La suite del servidor pasó con **283 pruebas**. Los mapas usados para las capturas y las respuestas de sus API son datos de prueba; no se consultaron proveedores de pago.

Capturas de la implementación integrada:

- [Inicio](../design/atlas-centinela-system-home.png)
- [Asistente](../design/atlas-centinela-system-assistant.png)
- [Mapa conceptual](../design/atlas-centinela-system-map.png)
- [Teléfono](../design/atlas-centinela-system-mobile.png)
