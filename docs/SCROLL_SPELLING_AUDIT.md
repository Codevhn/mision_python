# Auditoría de desplazamiento y ortografía en contenido mixto

Fecha: 2026-11-17. Base reproducida: `504bf53`.
Estado: auditoría reproducible y correcciones verificadas; véanse resultados y límites.

## Resultado

El cuadro sí participaba en una pausa reproducible, pero no por el mero hecho de
estar visible. Al cerrarlo se recorría de nuevo el documento y se reconstruía el
conjunto de marcas. Cuando un resultado contextual quitaba errores del primer
párrafo, los índices de los errores restantes cambiaban y obligaban a actualizar
marcas de otros párrafos que no habían cambiado.

En 1.600 párrafos sintéticos (752.657 caracteres, 1.734 bloques contando los
encabezados), esa actualización duró **132,6–147 ms** en dos repeticiones
instrumentadas. El cierre local sin un resultado nuevo también hacía trabajo
innecesario: **54,4–54,8 ms**. Un cuadro de 16,7 ms corresponde aproximadamente a
60 Hz; una pausa de 140 ms puede sentirse claramente aunque el percentil 95 del
resto del desplazamiento parezca fluido.

El segundo problema era lingüístico: forzar español o inglés sobre toda una página
confundía «no pertenece al idioma seleccionado» con «está mal escrito». Esto
producía falsos positivos en apuntes técnicos y aumentaba las decoraciones del
editor. Reconocer palabras válidas de ambos idiomas y mezclar indiscriminadamente
sus candidatos no son la misma operación: se deben resolver por separado.

Atlas también está sujeto al coste de documentos extensos. Se comprobó que el
editor monta todos los bloques del documento; no hay virtualización del cuerpo
que garantice un coste constante al crecer el contenido. No sería correcto
prometer que nunca puede tener problemas de rendimiento por su longitud.

## Método y controles

Instancia desechable de Flask, documentos sintéticos, Chromium headless con
viewport de 1440×1000. No se leyeron entradas del usuario ni se consumieron
solicitudes de IA. Las respuestas de LanguageTool fueron controladas para aislar
el procesamiento de una respuesta de la latencia de red.

Se compararon:

- 80, 800 y 1.600 párrafos, según el experimento.
- Plugin retirado de ProseMirror frente a plugin activo y cuadro abierto/cerrado.
- Cierre local sin cambios frente a cierre tras una respuesta contextual sin
  hallazgos en el párrafo consultado.
- Mediciones instrumentadas de funciones y verificación adicional con el bundle
  de producción, sin instrumentación.
- Un contraste adicional en Hyprland con cuadro abierto, sin backdrop-filter y
  con el plugin retirado.

La instrumentación se compiló en `/tmp`, sin reescribir los fuentes o el bundle
de producción para medir. Se registraron tiempos de funciones, intervalos de
requestAnimationFrame, tareas largas del navegador, métricas CDP, elementos DOM,
marcas y llamadas al callback de cambios.

Las comparaciones instrumentadas del cierre tuvieron dos repeticiones por caso.
La verificación de producción y el contraste de Hyprland tuvieron una repetición
por caso: son pruebas diagnósticas, no un estudio estadístico ni una certificación
de hardware Samsung. Los tamaños de documentos son de prueba, no una medición de
la entrada real mostrada en la captura.

La primera exploración de scroll colocaba el origen del gesto sobre texto y podía
abrir un menú incidental. Para el contraste controlado del cierre se movió el
origen al margen del contenido. Los resultados exploratorios no se utilizan para
atribuir un coste al simple hecho de ocultar el subrayado.

## Hallazgos

### 1. Cerrar el menú provocaba un análisis global sin necesitarlo

`inlineSpelling.js::closePopup` programaba `check()` aun en el modo local sin
ningún cambio. `check()` recorría los bloques, recreaba decoraciones y enviaba una
transacción. Se reutilizaban algunos análisis léxicos, pero todavía se recorría el
documento y se reconstruían sus marcas.

Esto queda aislado en el control de cierre local. No hubo escritura ni necesidad
de consultar otro proveedor para producir el coste.

### 2. Una respuesta de un párrafo afectaba marcas de toda la entrada

El atributo DOM era un índice en la lista global de errores. Al eliminar hallazgos
al principio de la entrada, muchos índices posteriores cambiaban. Esa identidad
no representaba la ocurrencia de una palabra ni el bloque revisado.

Las nuevas marcas se identifican por bloque/ocurrencia y rango. Actualizar un
resultado contextual no renumera el resto. La actualización elimina y añade solo
las decoraciones del párrafo afectado. Párrafos repetidos —incluso con nodos
inmutables compartidos— tienen destinos distintos para corregir la ocurrencia
señalada.

### 3. El selector de idioma provocaba falsos positivos masivos

Con el diccionario español se marcaban palabras inglesas válidas; al cambiar a
inglés ocurría lo contrario. Esto se reprodujo con tablas equivalentes a las
capturas, incluyendo identificadores, tipos primitivos, staging, commits, merges,
widening, narrowing y casting.

La corrección reconoce vocabulario válido de español e inglés simultáneamente.
Los candidatos siguen separados: se usa el idioma sugerido por pistas léxicas y
conectores del párrafo; la preferencia del usuario resuelve ambigüedades. Una
alternativa claramente más cercana puede corresponder a una palabra extranjera
insertada en la frase. No se presenta esto como comprensión semántica infalible.

El modo inicial pasa a **Automático · español e inglés**. Las preferencias
antiguas que forzaban un idioma se migran a este comportamiento, conservando
método y preferencia visual de subrayado. Los otros valores son preferencias, no
prohibiciones de utilizar palabras correctas del otro idioma.

Las reglas genéricas de diccionario de LanguageTool tampoco se utilizan para
volver a marcar vocabulario válido del otro idioma. El backend conserva el ID de
la regla para distinguir esos hallazgos de reglas gramaticales específicas, que
siguen disponibles. El vocabulario técnico complementario cubre abreviaturas y
nombres como PRs, repo y Javadoc que no tienen por qué figurar en un diccionario
general.

Una palabra válida mal usada o una expresión ambigua sigue necesitando contexto;
aceptarla léxicamente no garantiza que su uso sea correcto. La revisión local no
sustituye a la revisión gramatical.

### 4. El scroll continuo no mostró el mismo bloqueo que cerrar el menú

En OpenCode, el desplazamiento continuo con el cuadro abierto se mantuvo cerca de
16,7 ms por cuadro en la prueba. El reposicionamiento acumuló aproximadamente
35–41 ms durante unos dos segundos, repartidos entre muchas llamadas; no se debe
confundir ese total con un bloqueo de 40 ms en cada evento.

No se observaron llamadas al callback de guardado durante esos recorridos sin
edición. No hay evidencia en estas pruebas para atribuir la pausa a autosave o a
una escritura remota.

### 5. Hay un componente visual residual que no debe atribuirse todo al corrector

En el contraste de Hyprland con 1.600 párrafos aparecieron intervalos ocasionales
de 33 ms también con el plugin retirado. Desactivar backdrop-filter no eliminó
ese percentil. Por tanto, el corrector no explica todos los costes de composición
del documento y del tema.

Este contraste corto no identifica una propiedad CSS o un problema de GPU
concreto. No se cambian efectos visuales ni se aplica una optimización de CSS a
ciegas. Para diagnosticar ese componente en el dispositivo real haría falta un
perfil del navegador con su documento, zoom, GPU y resolución efectivos.

## Corrección y resultados

| Documento / interacción | Antes: trabajo síncrono de `check()` | Después: trabajo síncrono de `check()` |
| --- | --- | --- |
| 800 párrafos, cerrar tras respuesta contextual | 54,1–68,2 ms | 3,8–4,1 ms |
| 1.600 párrafos, cerrar tras respuesta contextual | 132,6–147 ms | 4,6–15,8 ms |
| 1.600 párrafos, cerrar menú local sin cambios | 54,4–54,8 ms | No se ejecuta `check()` |

Estas cifras corresponden a la versión instrumentada durante el diagnóstico.
La verificación adicional del bundle de producción original registró una tarea
larga de **141 ms** en el caso contextual de 1.600 párrafos. La producción
corregida no registró tareas largas en ese mismo contraste. Los datos completos,
versiones de navegador y controles están en `SCROLL_SPELLING_PERFORMANCE_EVIDENCE.json`.

En el documento sintético de 1.600 párrafos había 6.400 marcas locales. Reconocer
el inglés válido redujo ese número a 3.200, correspondientes a las erratas
introducidas intencionadamente en la muestra. No es una estimación del número de
marcas que tiene la entrada del usuario.

Además:

- Cerrar el cuadro local no vuelve a revisar si nada cambió.
- Los resultados contextuales actualizan el párrafo afectado y conservan los
  elementos DOM de sus vecinos.
- Una edición mapea las decoraciones existentes en vez de vaciarlas todas antes
  de la revisión posterior.
- Se conservan las protecciones de solo lectura, selección, Unicode y respuestas
  obsoletas. La preferencia de ocultar marcas mantiene el hover operativo.
- No se añadió una petición remota por palabra ni se requiere IA para reconocer
  la mezcla de idiomas.

Una última repetición sin instrumentación volvió a confirmar el caso contextual
sin tareas largas, pero registró una tarea de 114 ms en otro recorrido local,
con mayor tiempo de recálculo de estilos. Sin una traza de esa tarea no se
atribuye su causa a una función concreta ni se omite ese resultado. Se conserva
en `production_final` de la evidencia. La eliminación de la reconstrucción global
del corrector no demuestra que hayan desaparecido todas las pausas del navegador.

La carga inicial y las ediciones de documentos muy grandes conservan un coste.
Esta corrección elimina trabajo innecesario del corrector; no convierte todo el
editor en virtualizado ni garantiza tiempos idénticos en cualquier dispositivo.

## Reproducción

```bash
# Instancia temporal, con datos ficticios:
python tools/run_library_assistant_fixture.py

# En otra terminal: bundle diagnóstico fuera del repositorio.
node tools/build_scroll_audit.mjs
node tools/audit_scroll_performance.cjs --quick

# Caso de cierre con control explícito:
ATLAS_AUDIT_SIZES=800,1600 \
ATLAS_AUDIT_MODES=context-close,escape-local \
ATLAS_AUDIT_REPEATS=2 \
ATLAS_AUDIT_OUTPUT=/tmp/atlas-scroll-close.json \
node tools/audit_scroll_performance.cjs --quick

# Verificación sin instrumentación:
node tools/audit_scroll_performance.cjs --quick --production
```

Para volver a comprobar la producción anterior, extraer su bundle a un archivo
temporal y utilizar `ATLAS_AUDIT_BUNDLE` junto con `--production`. El arnés admite
`ATLAS_TEST_URL`/`ATLAS_TEST_PASSWORD` únicamente para una instancia local
desechable, `CHROMIUM_PATH`, tamaños, modos, temas y repeticiones.

Regresiones funcionales: `npm test`,
`node tools/check_spelling.cjs`, `node tools/check_spelling_hover.cjs` y
`node tools/check_editor_paste.cjs`. El checker del corrector incluye tablas reales
con texto de las capturas bajo las tres preferencias; comprueba que solo se marca
la errata introducida, que el código inline se protege y que los párrafos vecinos
conservan su DOM. El backend completo pasó **481 pruebas**, con 63 avisos existentes.
