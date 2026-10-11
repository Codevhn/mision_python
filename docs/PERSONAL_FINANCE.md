# Finanzas personales y meta Centinela

Abre **Finanzas** en la navegación de Atlas. En teléfono está en la lista de espacios. Es un módulo real, distinto de las propuestas de Apariencia: empieza vacío y guarda las cuentas, movimientos y presupuestos que registres.

## Empezar

1. Añade una cuenta, su moneda y su saldo inicial. Marca como **Ahorro** las cuentas destinadas a ahorrar; las demás son de **Uso diario**.
2. Registra ingresos, gastos o transferencias entre cuentas de la misma moneda. Los importes se calculan en centavos enteros. Los gastos y transferencias no pueden superar el saldo disponible.
3. Consulta por mes, moneda y cuenta. Selecciona una porción del gráfico de gastos o su nombre para filtrar los movimientos de esa categoría. La distribución del ahorro permite seleccionar una cuenta, y las barras de ingresos/gastos filtran por tipo. Las porciones también se operan con Tab y Enter o Espacio.
4. Define presupuestos por categoría, mes y moneda. Cada presupuesto compara el límite con los gastos de todas las cuentas de esa moneda durante el mes.

El total en cuentas y la distribución del ahorro incluyen todos los movimientos registrados. Los ingresos, gastos y balance mensual usan el periodo seleccionado. Las transferencias cambian los saldos sin contarse como ingresos o gastos. No se suman monedas diferentes ni se realizan conversiones. Eliminar un movimiento recalcula los saldos; la operación se rechaza si dejaría una cuenta con saldo negativo.

## Mi próximo equipo

La ventana **Mi próxima meta** aparece a la derecha de Inicio y de Finanzas, con el marco Centinela, la ilustración del equipo y su progreso. **Configurar mi meta** permite elegir nombre, moneda, importe objetivo y total reunido. El botón de configuración permite actualizarla y el botón de minimizar contrae su contenido.

El total reunido se actualiza manualmente y es independiente de los saldos de las cuentas. Registrar una transferencia al ahorro no modifica automáticamente la meta. No hay importes ficticios ni conexión con bancos.

## Apariencia y datos

Los cristales, reflejos y bordes siguen los colores de Atlas. Un brillo recorre el perímetro fijo de Centinela cada 14 segundos, con una pausa durante la mayor parte del ciclo. La preferencia del sistema de movimiento reducido desactiva el brillo y la flotación de la ilustración.

Los datos se guardan bajo el `DATA_DIR` existente: `finance.db` para el módulo y `personal_goal.json` para la meta. Ambos se incluyen en Exportar todo y en los respaldos; SQLite se copia mediante una instantánea consistente. En Fly siguen usando el volumen de datos de Atlas. Las API requieren la sesión autenticada del sistema.

La vista previa de **Apariencia → Probar nuevos marcos** sigue usando sus datos de muestra en memoria. No modifica tus finanzas ni tu meta reales.

Los filtros y formularios usan selectores y calendarios con la paleta de Atlas. Mes y Fecha se muestran en español. Los marcos no generan barras de desplazamiento; en pantallas bajas solo se desplaza el cuerpo del formulario. Los detalles de la revisión están en [la auditoría visual](ATLAS_UI_AUDIT.md).

## Verificación

Se verifican importes exactos, validación, transferencias, separación de monedas, eliminación con recálculo, persistencia de la meta y exportación de SQLite en las pruebas del servidor. La comprobación en Chromium cubre formularios, selección de porciones con ratón y teclado, presupuestos, errores con conservación del formulario, sincronización de temas, navegación, recarga y movimiento reducido.

La suite completa del servidor pasó con **283 pruebas**. Se comprobaron anchos de 320, 390, 768, 1024 y 1440 px, sin desbordamiento horizontal. Capturas de la implementación con datos de prueba:

- [Finanzas en escritorio](../design/atlas-finance-live.png)
- [Finanzas en teléfono](../design/atlas-finance-mobile.png)
- [Meta Centinela en Inicio](../design/atlas-goal-live.png)
