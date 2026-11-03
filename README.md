# Turnario

Calculadora web estática para registrar turnos y controlar el cumplimiento de una jornada semanal de 44 horas.

## Funcionalidades

- Registro diario de ingreso y salida, incluyendo jornadas que cruzan medianoche.
- Jornada sugerida de 09:00 a 18:00 de lunes a jueves y de 09:00 a 17:00 los viernes.
- Sábados y domingos aparecen automáticamente como libres, pero pueden editarse para registrar una jornada excepcional.
- Registro de licencia por día entero, sólo mañana o sólo tarde; cada media jornada computa la mitad de la jornada esperada.
- Registro de comisión de servicio: el día se considera cubierto, pero no se contabiliza como horas efectivamente trabajadas.
- Registro de salida anticipada autorizada, que completa la jornada esperada sin generar descuento.
- Balance semanal y mensual, horas extra no remuneradas y alerta de descuento desde 59 minutos faltantes.
- Persistencia automática en `localStorage` del navegador.
- Exportación mensual en `JSON` (para versionar en GitHub) y `CSV` (compatible con Excel).
- Importación de un JSON previamente exportado para continuar el registro en otro dispositivo.
- Diseño responsive y modo instalable como aplicación PWA en teléfonos.

## Uso

Abrir [`index.html`](./index.html) en un navegador moderno. No requiere instalación ni servidor.

Cada mes puede guardarse con **Exportar mes**. Se generan dos archivos:

- `turnario-AAAA-MM.json`: fuente de datos mensual, recomendada para versionar en GitHub.
- `turnario-AAAA-MM.csv`: planilla compatible con Excel.

La app no contiene credenciales ni escribe directamente en GitHub: el archivo JSON exportado puede subirse mediante un commit o desde la interfaz web de GitHub. Esto mantiene los datos privados y permite revisar el historial mensual.

## Uso desde el teléfono

Publica el repositorio con GitHub Pages y abre la URL desde el teléfono. Desde el menú del navegador se puede elegir **Agregar a pantalla de inicio** o **Instalar aplicación**. Una vez instalada, la app puede abrirse incluso sin conexión y los registros se guardan en el almacenamiento del teléfono.

El almacenamiento local de cada navegador es independiente: registrar un turno en la computadora no lo hace aparecer automáticamente en el teléfono. Para consultar los mismos datos en ambos dispositivos, exporta el JSON desde un dispositivo e impórtalo en el otro. La sincronización automática con GitHub requeriría agregar autenticación y un backend o una función serverless; no se habilita desde esta versión para no exponer credenciales personales.

## Reglas aplicadas

- Objetivo semanal: 44 horas.
- Objetivo diario de referencia: 9 horas de lunes a jueves y 8 horas el viernes.
- Los sábados y domingos no agregan horas esperadas.
- Las licencias y comisiones computan para el cumplimiento semanal, sin sumarse a las horas efectivamente trabajadas.
- Un faltante de 59 minutos o más se marca como descuento estimado.
- Las horas por encima del objetivo se muestran como extra, pero no se agregan a una remuneración.
