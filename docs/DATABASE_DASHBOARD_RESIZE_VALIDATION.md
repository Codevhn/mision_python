> Publicación: referencia privada anonimizada; capturas y trazas originales se conservan localmente y no se incluyen en Git.

# Evidencia de redimensionado y revisión Native — 17 de octubre de 2026

Estados y criterios exclusivamente en [DATABASE_PLAN.md](DATABASE_PLAN.md).
Se continuó en `feat/database-identity-stage1`, sin commit, push, despliegue ni
cambios en Notion. Respaldo de los 140 archivos locales existentes al empezar:
`/tmp/atlas-followup-baseline-g6row_q6`, con manifiesto SHA256.

## Implementación

El Dashboard conserva fuentes, IDs, filtros y representaciones independientes.
Los widgets admiten ahora ancho continuo relativo al contenedor y altura en píxeles,
con tirador inferior en modo Editar. El campo opcional `width` expresa porcentaje;
los `span` anteriores se interpretan con la misma proporción y se conservan. La
altura deja de normalizarse a tres valores predeterminados. No se recrean widgets,
registros ni vistas para cambiar el tamaño.

La distribución usa filas flexibles con salto de línea y conserva el orden de
lectura. Respeta el hueco entre widgets. Límites: ancho 10–100 %, mínimo de
presentación de 260 px cuando cabe, cuerpo de 160–1600 px. Son límites de Atlas;
no se atribuyen al constructor de Notion. No es un lienzo de posición absoluta.
El ancho porcentual se guarda con cuatro decimales; a un mismo ancho disponible
el ajuste es continuo, sin saltos a columnas o presets.

`DashboardResizeHandle.jsx` utiliza captura de puntero, previsualización local y
una escritura al soltar; no guarda cada evento de movimiento. La implementación
cancela la previsualización ante Escape, pointercancel o pérdida de captura.
**La cancelación de un arrastre en curso no se ejercitó físicamente** en esta ronda;
no se presenta como una interacción visual verificada.
Las flechas cambian 10 px, Mayús+flechas 40 px; también se pueden introducir ancho
porcentual y altura en los campos del widget. La geometría distingue píxeles del
viewport y píxeles CSS para respetar escala. El tirador no inicia el arrastre de
reordenación del widget ni opera sobre los registros. Una comprobación final
detectó deriva por redondeo subpíxel al reconstruir el ancho durante un cambio
sólo de altura. Se corrigió para conservar exactamente el porcentaje guardado;
la prueba de regresión usa 47.3 % guardado frente a 47.2984 % medido. La UI confirmó después
47.3 % exacto durante487→497→487px.

Las reglas de adaptación dependen del ancho disponible del Dashboard, incluido
el espacio que deja el Peek. A 640 px disponibles o menos, los widgets se apilan
y ocupan todo el ancho, conservando su ancho guardado para volver a escritorio.
En ese modo el tirador y el teclado ajustan sólo altura. La configuración sigue
permitiendo establecer la proporción para el diseño amplio.

Se corrigieron además dos defectos reproducidos:

- La flecha girada de `summary` sobresalía de su caja y añadía scroll horizontal
  al menú móvil. Ahora rota dentro de una caja cuadrada; el panel mide 348 px
  de ancho cliente y 348 px de contenido, frente a 350 px de contenido antes.
- Configuración de vista dejaba un canvas de sólo 86 px en un viewport de 390 px.
  En contenedores estrechos se coloca encima de la vista: panel y canvas miden
  ambos 316 px. Es adaptación responsive de Atlas, no una observación de Notion
  móvil. El panel recibe foco al abrirse, Escape lo cierra y devuelve el foco al
  botón Configuración de vista. No se introdujo un diálogo modal ni se atrapa Tab.

Los popovers compartidos recalculan su posición ante scroll de ancestros y cambios
del viewport visual. Se conserva el tema y el propietario del Peek.

## Revisión real de UI y persistencia

Mediante CUA en el demo aislado, no mediante REA:

| Prueba | Resultado |
| --- | --- |
| Arrastre del tirador de Tabla A | Ancho renderizado 791→654 px; cuerpo 400→313 px. |
| Teclado y recarga | Derecha, Abajo y Mayús+Abajo: ancho664px/alto363px; recarga conservó ambas medidas. |
| Campos numéricos | Se guardaron 47.3 %/487 px para A y 50 %/317 px para B, fuera de los presets anteriores. |
| Fuentes y representaciones | A mantiene Tabla con Alfa y número0; B mantiene Galería con Beta y8.5. El tamaño no copió filas ni cambió de fuente. |
| Móvil | Documento sin desbordamiento horizontal a1200/900/640/390 px. A390 px, ambos widgets=316 px. A900 px, el Dashboard dispone de 610 px y apila; a1200 px dispone de 910 px y muestra dos widgets. |
| Teclado móvil | Abajo cambia altura; Derecha conserva47.3 % guardado. Al volver a escritorio reaparece la proporción original. |
| Escala CSS125 % | Altura507 px guardada y633.75 px renderizada, incremento de 10 px CSS mediante teclado. Se restauró100 %. |
| Native claro/oscuro | Selector claro fondo#fff/texto#37352f; oscuro usa tokens compartidos. Cambio reversible conservó Dashboard, fuentes y medidas. También se comprobó el resize por teclado en Naranja Ámbar:487→497→487px y regreso a Native sin cambiar vista. |
| Peek de fuente externa | Alfa abrió propiedades Nota/Número y cuerpo de A; navegación anterior/siguiente desactivada por tener una sola fila visible de esa fuente. |
| Asa de BlockNote | En H1 Cuerpo editable, centro de primera línea y controles=339 px. Clic abrió acciones; Flecha abajo movió foco de Párrafo a Encabezado1; Escape cerró sólo el menú, manteniendo Peek. No se editó ese cuerpo. |
| Foco de configuración | Foco inicial Cerrar configuración; Escape cerró el panel y devolvió foco a Configuración de vista. |

[Medidas JSON](ATLAS_DASHBOARD_RESIZE_VALIDATION.json). `clientHeight` puede excluir
10px del scrollbar horizontal: a390 px, el cuerpo de A conserva altura CSS y caja
renderizada487 px, con477 px de área cliente. No es una modificación del tamaño
guardado. Capturas:
Dashboard (`atlas-dashboard-free-resize.png`, evidencia/herramienta local no publicada),
Native claro (`atlas-dashboard-native-light.png`, evidencia/herramienta local no publicada),
menú móvil (`atlas-dashboard-mobile-config.png`, evidencia/herramienta local no publicada),
widgets apilados (`atlas-dashboard-mobile-stacked.png`, evidencia/herramienta local no publicada),
configuración móvil (`atlas-dashboard-mobile-view-config.png`, evidencia/herramienta local no publicada).

El intento de zoom nativo con Ctrl+equal no cambió innerWidth1888 ni DPR1.
**Zoom nativo sigue sin verificar**; no se confunde con CSS zoom. La matriz no
cubre interacción táctil, todas las representaciones ni todos los módulos/temas.

## REA: intento de esta ronda, sin observación nueva

Se leyeron instrucciones reales del skill y evidencia previa. El endpoint vigente
se obtuvo de `DevToolsActivePort`; sólo WebSocket explícito de 127.0.0.1:9222.
Se ejecutó realmente `mcp__rea__list_browser_targets`, filtrado por
`https://app.notion.com`. Devolvió `provider_timeout`: descubrimiento del socket
CDP superior a 10000 ms. No devolvió target ni evidencia de contenido.
No se ejecutaron `inspect_web_page` ni `capture_web_screenshot` en esta ronda y no
se afirma nueva inspección de Notion. La causa específica del timeout no quedó
establecida; no se inventó un requisito de permisos ni se cambiaron endpoints,
configuración o exposición de red. Se reutilizaron capturas/evidencia REA anteriores,
en particular NOTION_NATIVE_REA_EVIDENCE.json (`NOTION_NATIVE_REA_EVIDENCE.json`, evidencia/herramienta local no publicada).
La revisión interactiva aquí descrita corresponde únicamente a CUA sobre Atlas.
`ss -ltnp` confirmó5059 y 9222 escuchando exclusivamente en127.0.0.1.

## Datos del demo y reanudación

Al empezar, `/tmp/atlas-database-demo-hjrjs3m0`, sus respaldos y el entorno Python
anterior ya no estaban presentes. **Los registros de ese demo anterior no se
recuperaron ni se presentan como conservados.** No se conoce aquí la causa de su
eliminación. No se tomaron datos reales para reemplazarlos.

Se creó un fixture nuevo con el generador existente, explícitamente independiente:
`/tmp/atlas-database-demo-my0jmtud`. Se comparó con su respaldo de inicialización:
10 IDs conservados, 7 registros sin cambios en propiedades o cuerpo, ninguna fila
nueva por configurar widgets. Se modificó la presentación de la página anfitriona
para añadir Dashboard. La página de recuperación ya cambia durante la preparación
del propio fixture, antes de las pruebas de UI; no es migración del corpus real.

Después se detuvo el servidor, se copió el almacén completo y SQLite de forma
consistente a **`local-demo/atlas-database-demo-my0jmtud`**, excluido mediante
`.gitignore`, y se reanudó con el mismo estado/sesión. Se conserva la copia temporal
como respaldo adicional mientras exista. Esta carpeta local sobrevive a limpiar
`/tmp`, pero no sustituye un respaldo externo del equipo. Contiene sólo el demo y
su secreto de sesión local; no debe añadirse a Git.

`--resume-demo` acepta ahora únicamente almacenes marcados `atlas-database-demo-*`
en `/tmp` o en `local-demo/` de este repositorio. No permite reabrir arbitrariamente
el directorio de datos reales. Para reanudar sin sembrar otra vez:

```sh
/tmp/atlas-stage1-venv/bin/python tools/run_database_identity_demo.py --port 5059 --resume-demo local-demo/atlas-database-demo-my0jmtud
```

Demo: <http://127.0.0.1:5059/?open=mi-tracker-de-entretenimiento>, contraseña
`atlas-db-demo`. Dashboard→Editar; arrastrar esquina inferior, usar flechas o abrir
Configurar widget→Distribución y apertura. Banco responsive:
<http://127.0.0.1:5059/__demo__/responsive>, restaurado a1200 px/100 %.
El entorno Python continúa temporal; si desaparece hay que recrearlo con
`python -m venv /tmp/atlas-stage1-venv` y las dependencias de `requirements-dev.txt`.

## Pruebas y límites

- `npm test` aprobado, con casos de tamaños no predeterminados, valores antiguos,
  duplicación, serialización, límites, mínimo útil, escala y ancho bloqueado en móvil.
- Contrato API de Dashboard ampliado a 43.2175 % y 487 px: vuelve a leer medidas
  continuas y conserva otras vistas, IDs, propiedades y cuerpo; operaciones sobre
  fuente ajena rechazadas. La UI comprobó además 47.3 %.
- Backend completo: **371 passed, 41 warnings**,8.84 s. El primer intento dentro
  del sandbox tuvo tres fallos por sockets de pruebas; el reintento autorizado fuera
  de esa restricción pasó. No se alteró código ajeno para ocultar esos fallos.
- Build final:1128 módulos, CSS 303.38 kB, JS 4510.51 kB,8.56 s. Sin dependencias nuevas
  de runtime. Los avisos anteriores datetime/WeasyPrint siguen presentes.

Siguen abiertos en el plan la cancelación visual del resize en curso, táctil,
zoom nativo, volumen/concurrencia y cobertura visual completa de módulos, vistas
y portales. Continúan los pendientes comprometidos de exportación remota, fórmulas,
layouts y colaboración; no se reclasificaron como aplazados por esta implementación.
