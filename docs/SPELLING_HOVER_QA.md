# Regresión: palabras subrayadas sin propuestas al pasar el puntero

Base reproducida: `2e79eb6`.

## Causas verificadas

La versión anterior no mostraba candidatos hasta completar LanguageTool. Un error
de conexión/cuota dejaba el menú sin botones de corrección, mientras las marcas
locales seguían visibles. El handler `mouseover` solo abría un menú cuando no
existía otro: al pasar a una segunda palabra conservaba la anterior.

La reproducción en Atlas completo, con fallo controlado 503 del proveedor y los
estilos de producción, registró:

```json
{
  "word": "«abjeto»",
  "suggestions": [],
  "status": "LanguageTool no está disponible en esta prueba.",
  "afterMoving": "«abjeto»"
}
```

La página de prueba también marcaba IV, VII, JVM, JDBC, Spring, Boot, JPA,
Hibernate y otros términos de la captura. Las pruebas anteriores usaban clic y
no cargaban `themes.css`, donde se define el posicionamiento del menú. Por ello
no cubrían el recorrido real del puntero ni su geometría completa.

## Corrección

- Candidatos locales inmediatos, con su origen explícito. LanguageTool puede
  sustituirlos por propuestas contextuales; si falla, siguen utilizables y se
  muestra el error sin atribuirle al servicio las propuestas locales.
- Hover de otra palabra actualiza el menú con una breve espera de intención;
  entrar al menú cancela el cambio pendiente para poder elegir una propuesta.
- Números romanos canónicos excluidos de la detección léxica, sin ocultar todas
  las mayúsculas. El vocabulario técnico existente se amplía con nombres de Java
  y arquitectura de software. Esto complementa el motor; no sustituye los cambios
  de hover y disponibilidad de propuestas.
- Preferencia **Subrayar posibles errores** en Abc✓, guardada por navegador.
  Ocultar marcas conserva los destinos y eventos de hover; no desactiva el motor.

## Validación

`tools/check_spelling_hover.cjs` usa una instancia desechable de Flask y el Atlas
completo, incluidas sus hojas reales. Comprueba servicio 503, propuestas útiles,
hover entre palabras sin Escape/clic, cuatro temas (Aero, OpenCode, Hyprland y
Notion), visibilidad y acceso al botón real, aplicar/deshacer y subrayado opcional
con hover operativo. La respuesta del servicio está controlada; el editor,
diccionarios, página, navegación y temas son reales.

```bash
python tools/run_library_assistant_fixture.py
# En otra terminal, desde la raíz:
node tools/check_spelling_hover.cjs
node tools/check_spelling.cjs
```

Solo contra la instancia temporal, no contra los datos personales. El fixture usa
`127.0.0.1:8132` y credenciales ficticias. El checker acepta `ATLAS_TEST_URL`,
`ATLAS_TEST_PASSWORD` y `CHROMIUM_PATH`. `--baseline` registra el comportamiento
sin exigir el resultado corregido.

Pasaron el build, `npm test`, el recorrido completo de hover y las regresiones del
corrector en escritorio, teléfono y tablet. Se incluyó `themes.css` en ese último
checker para evitar verificar nuevamente un menú sin sus estilos reales.
No se consumieron solicitudes de IA ni se certifica disponibilidad/calidad del
servicio vivo o hardware Samsung físico mediante estos casos controlados.
