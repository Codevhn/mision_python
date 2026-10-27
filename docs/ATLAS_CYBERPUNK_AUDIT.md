# Revisión de la mezcla Aero/Cyberpunk

**Histórico, sustituido:** esta superposición terminó anulando la identidad de
todos los temas Aero. La corrección actual la aísla en el tema independiente
Hyprland y restaura el resto de la cascada. Véase [HYPRLAND_THEME.md](HYPRLAND_THEME.md).

La hoja Cyberpunk se carga después de los estilos de Aero. En una lección real con
`language-python-dark`, el tema de curso sobrescribía `--aero-toolbar` y
`--aero-button`: los encabezados del código, la barra contextual, la navegación
de Cursos y el selector de temas recuperaban gradientes azules y bordes dorados.
El selector de temas conservaba además un botón de cierre rojo con relieve.

Se elevó la prioridad de los tokens Cyberpunk frente a los temas de lenguaje,
sin cambiar el fondo ambiental. Se sustituyó la pintura heredada en la navegación
lateral, el editor de código, los encabezados, controles de cierre y marcos
decorativos. Los temas de lenguaje siguen disponibles en el selector global;
entrar en un curso ya no activa uno automáticamente ni aplica preferencias
antiguas por curso. Esas preferencias permanecen guardadas, sin borrarse.

Validación: inspección de sólo lectura en Atlas de Inicio, lección, Biblioteca,
Finanzas, navegación y selector; prueba local aislada con la cascada completa de
CSS y `language-python-dark`/`language-python-light`. En la prueba, barra,
encabezado y copia de código, navegación y selector ya no muestran gradientes de
Aero; el texto mantiene contraste sobre las superficies oscuras. PostCSS analiza
las hojas y la prueba del registro de temas verifica persistencia y navegación.
La comprobación visual local usa elementos representativos; la instalación
publicada no cambia hasta desplegar el commit.
