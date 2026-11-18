# Rebote tras caída y vigilancia del activo abierto

## Qué cambia

Una recuperación en V puede comenzar cuando EMA20 sigue por debajo de EMA50 y el precio permanece bajo las medias. Exigir una tendencia alcista previa sirve para un retroceso de continuación, pero puede llegar tarde a ese otro patrón. Se añade **Rebote confirmado tras caída** como sexto setup, con reglas propias de precio y participación; no reemplaza los filtros de riesgo ni identifica el mínimo futuro.

La regla usa únicamente las velas ya cerradas de la sesión en curso, sin localizar pivotes con velas futuras:

1. Examina hasta las últimas 14 velas contiguas de esa sesión. Necesita al menos seis y tres descensos de cierre antes del suelo candidato.
2. La caída desde el máximo previo al suelo debe ser de al menos 1.5 ATR. El suelo tiene que preceder al menos dos velas de recuperación y estar dentro de la ventana reciente.
3. Las velas posteriores deben mantener mínimos estrictamente crecientes. Una nueva perforación del suelo no confirma la recuperación.
4. La confirmación es el primer cierre que supera el máximo de la primera vela de recuperación. Exige cuerpo alcista, volumen ≥1.2× las veinte velas anteriores y el filtro de rechazo de mecha existente.
5. No exige EMA alcista ni esperar el cruce de MACD. La estructura de precio y el volumen son la evidencia de este patrón; no se cuentan como una probabilidad calibrada.
6. Rechaza una recuperación ya superior a dos ATR desde el suelo. El stop utiliza el mínimo estructural y ATR; el objetivo bruto 2R debe caber bajo el máximo previo conocido. No se inventa un objetivo por encima de esa resistencia para hacer atractivo un rebote pequeño.

Se mantienen sesión/calendario, espera inicial en acciones, bloqueo de rupturas erráticas, datos actuales, expiración, invalidación posterior y precio máximo para no perseguir la subida. La calculadora exige aplicar el mismo plan, completar costos, respetar límites y obtener tamaño positivo antes de indicar **Posible compra ahora**. Una pequeña subida bruta puede no cubrir spread/deslizamiento o no cumplir beneficio/riesgo neto.

Se añade también una comprobación de cierre: si la última consulta es anterior al final de la vela, esa instantánea no puede confirmar su volumen final, incluso cuando el proveedor no informa la hora del precio. Hay que recibir una consulta posterior. Esto evita convertir una vela incompleta almacenada en una confirmación por el simple paso del reloj.

## Avisos y prioridad

En la ficha, **Activar avisos para [símbolo]** activa la vigilancia, da prioridad al activo y conserva el gráfico abierto. **Day trading → Vigilancia prioritaria** muestra hasta diez selecciones manuales y permite retirarlas. No son un límite de oportunidades del mercado; las posiciones propias también reciben prioridad por separado. La prioridad es de la sesión de la app, no una lista persistida en el intermediario.

Con la vigilancia activa, las lecturas del gráfico abierto alimentan los avisos directamente, sin esperar a completar el trabajo de ese símbolo en el barrido general. Usan la misma validación y el mismo registro de disparadores para evitar duplicar el aviso entre ambos caminos. Un nuevo aviso detectado en el gráfico visible tiene aviso individual; las compras generales masivas siguen agrupándose. El cuerpo del aviso incluye el intervalo de sus velas.

**La app y la pestaña tienen que permanecer visibles.** Cambiar a Robinhood en el teléfono puede ocultar TraderUSA y pausar consultas/avisos. Este cambio no implementa vigilancia permanente en servidor ni notificaciones push con la app cerrada, y tampoco garantiza latencia o ejecución. La frecuencia de consulta de diez segundos del gráfico no equivale a un feed garantizado de tiempo real.

## Caso de la captura de Lucid

La imagen identifica Lucid Group (LCID) y un rango **1D**: representa una sesión, no la duración de cada vela. No muestra una escala suficiente para obtener el mínimo, las horas, el spread, los volúmenes numéricos ni el intervalo exacto. Tampoco demuestra si TraderUSA estaba visible, si LCID fue revisada a tiempo, qué datos recibió o qué filtros se cumplieron.

No se ha reconstruido esa operación ni se afirma que la nueva regla habría avisado en ese punto. La consulta de OHLC de LCID desde este entorno fue rechazada por el proxy de red. Las pruebas de una caída y recuperación similar usan **datos sintéticos**, identificados como tales, no precios históricos de LCID.

## Comprobaciones y límites

Las pruebas de reglas cubren confirmación con mínimos crecientes antes de las medias alcistas en velas de uno y cinco minutos, ausencia de señal en el suelo o con vela abierta, volumen insuficiente, mecha sin cierre, nuevo mínimo, precio tardío, falta de espacio hasta la resistencia, invalidez con rebote posterior, consulta anterior al cierre, invariancia al añadir velas futuras y rechazo por costos.

El recorrido en Chromium verifica vigilancia sin cerrar la ficha, activación y retirada de prioridad, aviso único entre gráfico y barrido, detección de rebote y conexión al plan/riesgo. Incluye una prueba con otros avisos generales simultáneos, un spread que impide validar la compra, costos explícitos, ausencia de órdenes/cambios de posiciones y anchos de 1366/440/320 píxeles. No certifica Safari físico ni recepción de notificaciones del sistema.

Se volvió a ejecutar el archivo de comprobación de TSLA de [ENTRADAS_SALIDAS.md](ENTRADAS_SALIDAS.md), con SHA conservado y las mismas hipótesis de costos y ejecución. La revisión `entry-setups-v3-closed-rebound` mantiene sus ocho operaciones y +30.67 USD del modelo. **Ese archivo no aporta evidencia de rendimiento para el patrón nuevo:** no añade operaciones allí y la muestra sigue siendo demasiado pequeña para afirmar una ventaja. Hacen falta datos de otros activos/períodos y evaluación prospectiva; no se ajustaron umbrales para mejorar ese resultado ni se presenta una ganancia garantizada.
