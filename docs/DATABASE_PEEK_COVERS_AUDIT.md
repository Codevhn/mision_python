# Portadas de registros desde el Peek y previsualización en tarjetas

Fecha: 2026-11-17 (Honduras). Base: `6922ee1`.

## Diagnóstico

El Peek monta el mismo editor BlockNote, pero su cabecera no tenía los controles
que Atlas añade fuera del cuerpo del editor para manejar `meta.cover`. Por eso
no era posible añadir o cambiar una portada desde el panel.

Además, `RecordCard` usaba `row.cover` como `img.src`. El selector de Atlas guarda
portadas como fondos CSS: `url(...)`, degradados o colores. Una dirección como
`url(/static/covers/imagen.png)` no es un `src` de imagen válido. Esto producía
la imagen rota incluso cuando la portada estaba guardada correctamente.
El título de tarjeta también imprimía el valor de `row.icon` literalmente, en
lugar de renderizar sus identificadores Iconify.

## Implementación

- El Peek ofrece Añadir/Cambiar portada y Quitar portada. Utiliza directamente
  `openCoverPicker`: degradados, fotografías, URL y subida de archivo existentes.
  El selector se marca con el propietario del Peek antes de insertarse y queda
  sobre él; no cierra el registro al interactuar.
- Se conserva el endpoint `PATCH /api/entry/:id/cover`, el campo `cover` y el
  formato de Atlas. No se introducen otro almacenamiento ni otra API. El selector
  reutiliza también `/api/upload/cover` para subir archivos.
- `pageCover` normaliza los valores existentes: extrae la URL de `url(...)`,
  conserva imágenes con URL directa antiguas y representa degradados/colores como
  fondos. El Peek y las tarjetas comparten esta interpretación.
- Board, Gallery y demás representaciones que usan `RecordCard` distinguen fondo
  CSS de imagen. Una imagen ausente muestra «Portada no disponible» y una portada
  nueva restablece la previsualización. Los iconos con prefijo se renderizan como
  `iconify-icon`; los emojis y el icono por defecto se conservan.
- Tras guardar se emite el evento de base de datos existente para ese origen. La
  tarjeta del Board se actualiza aunque el Peek siga abierto. No se cambian las
  opciones de previsualización de la vista: cada vista sigue eligiendo portada,
  propiedad de archivos, contenido o ninguna. Una propiedad explícita no cambia
  silenciosamente a la portada de página.
- El cierre y la navegación esperan el guardado de la portada. Ante un error se
  conserva la portada anterior y el selector sigue disponible para reintentar.
  Las páginas bloqueadas deshabilitan los controles y la selección se valida
  contra el ID de la página actual. Los selectores del Peek se retiran al salir.

La función compartida del selector conserva el comportamiento de sus llamadas
existentes fuera del Peek. Solo la opción de propietario del Peek añade manejo
de errores y protección frente a clics repetidos en ese contexto. El editor de
página completa lee las mismas portadas guardadas; no hace falta migrar datos.

## Pruebas

Con `python tools/run_library_assistant_fixture.py`:

```bash
node tools/check_peek_covers.cjs
node tools/check_peek_navigation.cjs
```

El checker usa Board y Gallery reales con datos sintéticos y el selector de Atlas:

- portada CSS `url(...)` existente carga como imagen real, sin el marcador roto;
- degradado se ve como fondo en la tarjeta, no como una petición de imagen;
- URL y subida real de PNG guardan, actualizan la tarjeta y sobreviven a reabrir;
- un 404 muestra el estado alternativo y una subida posterior vuelve a cargar;
- un 503 al guardar conserva el valor anterior y mantiene el selector abierto;
- Quitar elimina la portada del Peek y de la tarjeta;
- al cerrar durante una petición retrasada, el cierre espera el guardado;
- la misma portada funciona al abrir explícitamente el editor de página completa;
- los iconos de tarjeta no imprimen `logos:python` y el Markdown del registro y
  la portada de otros registros se conservan.

Pasaron 1697×1000, 1480×924 y 412×915, la regresión de navegación en ambos modos,
`npm test`, el build y 38 pruebas backend de portadas, persistencia, acciones de
registro y workspace. Se añadieron casos unitarios de normalización de portada
y se mantuvieron los de prioridad de propiedades de archivos.

No se usaron datos personales ni consultas a IA. Las imágenes son archivos de
prueba locales; no se afirma haber comprobado la disponibilidad de proveedores
de fotografías externos ni hardware Samsung físico.
