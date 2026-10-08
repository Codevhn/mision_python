# Apariencia de Atlas

El botón de tema, disponible también desde la búsqueda y en móvil, abre una
colección centrada con categorías y filtros. Hay 18 opciones:

- **Aero clásico**: Claro, Azul Windows 7 y Nocturno.
- **Aero neón**: Rubí, Eléctrico, Naranja Ámbar, Esmeralda y Negro Neón.
- **Aero intenso**: versiones más saturadas de las ocho opciones Aero.
- **OpenCode**: dos estilos inspirados en interfaces de herramientas de código,
  claro y oscuro, con tipografía monoespaciada, superficies planas y acentos verdes.

Naranja Ámbar usa cristal naranja, no tonos café desaturados. Las variantes
intensas refuerzan marcos, reflejos y fondos, conservando superficies de lectura
con contraste. Cada opción tiene vista previa y el tema actual queda marcado.
La cabecera y los filtros permanecen disponibles al desplazarse por la colección.

La elección se guarda localmente en `kb_theme`. Las preferencias antiguas
`light` y `dark` migran a Aero Claro y Nocturno. Una opción desconocida utiliza
Aero Nocturno. Cambiar de familia limpia la paleta y la intensidad anteriores.
El esquema dark/light sigue aplicándose al editor y al lector de biblioteca.

`ATLAS_THEMES` registra esquema, estilo, variante, paleta e intensidad;
`THEME_CATALOG` y `THEME_GROUPS` organizan títulos, vistas previas y categorías.
La colección se construye a partir del catálogo, sin opciones vacías. Para una
familia futura se registran sus temas, categoría y estilos; no hace falta añadir
botones manualmente al diálogo. Los tokens y componentes están en `themes.css`.

Validación en Chromium: 18 opciones, filtros, contraste de texto secundario en
superficies de lectura de al menos 4,5:1, selección actual, persistencia al recargar,
limpieza al cambiar de familia, cierre con Escape y límites del diálogo en móvil.
Las variantes intensas mantienen el efecto Aero; OpenCode oculta la ambientación
animada de Inicio para conservar su presentación plana.
