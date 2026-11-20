# MP Dashboard Cliente · Calidad V2

Prototipo de control de calidad en React, Express y SQLite. Registra **un consolidado por operario y fecha de jornada**, sin códigos individuales de caja. Conserva la identidad MP360 y los roles administrador/visualizador.

## Iniciar

Requiere Node.js 22.13 o superior.

```bash
cp .env.example .env
```

Configura `DATABASE_ADAPTER=sqlite` y reemplaza `ADMIN_PASSWORD` con una contraseña local. Después ejecuta:

```bash
npm install
npm run seed
npm run dev
```

Abre `http://127.0.0.1:5173`. `seed` crea el administrador si no existe; no cambia su contraseña ni añade datos ficticios al dashboard. El administrador importa Excel y administra cuentas de visualización. Un visualizador consulta las cuatro vistas y sus filtros. Eliminar su cuenta invalida sus sesiones; la cuenta administradora no se puede eliminar. No se añaden roles nuevos.

El login admite cinco intentos por IP en 15 minutos; el contador se guarda en memoria. Actualizar la pestaña conserva el acceso; al abrir la aplicación en una pestaña nueva se solicita iniciar sesión y se revoca la sesión anterior. La cookie no tiene persistencia entre sesiones del navegador. Algunos navegadores restauran el almacenamiento de una pestaña al usar «Reabrir pestaña cerrada»; en ese caso también pueden restaurar el acceso. La API verifica sesión y rol antes de aceptar una importación.

## Reglas del consolidado

- Jornada = fecha + identificador de operario. Usa siempre el mismo identificador; se distinguen mayúsculas/minúsculas. No hay desglose por caja, lote, producto ni turno.
- Cada caja contiene **20 unidades**. Inspeccionadas = aprobadas + bloqueadas.
- Tolerado, Menor, Mayor y Crítico cuentan **unidades observadas**, en clasificaciones excluyentes: cada unidad se cuenta una sola vez. Todas implican bloqueo, incluido Tolerado.
- Cada caja bloqueada tiene entre 1 y 20 unidades observadas. Por tanto: bloqueadas ≤ suma de clasificaciones ≤ bloqueadas × 20. Una caja aprobada no tiene unidades observadas.
- Cajas y unidades son enteros no negativos. Las horas son mayores que 0 y como máximo 24; admiten decimales. Una jornada trabajada sin inspecciones puede tener todas sus cantidades en 0.
- Productividad individual = suma de cajas inspeccionadas del operario ÷ suma de sus horas trabajadas. La productividad general usa todas las cajas y todas las horas seleccionadas; no promedia tasas individuales.
- Horas-persona acumuladas = suma de las horas registradas por cada operario y día. El número de operarios del periodo cuenta personas distintas, aunque no trabajen todos los días; por eso no se multiplican operarios × días para obtener las horas.
- Días con registros = cantidad de fechas distintas con al menos un consolidado de operario dentro de los filtros. Varios operarios en un mismo día cuentan como un solo día; las fechas sin registros no cuentan.
- Aprobación = aprobadas ÷ inspeccionadas × 100. Sin inspecciones, las tasas son 0.

## Importar Excel

Sube un `.xlsx` de hasta **2 MB** desde **Cargar Excel**. La única hoja requerida es `CONTROL_DIARIO`, con los encabezados en su primera fila y hasta 3000 jornadas. El orden de las columnas puede variar.

| Fecha | Operario | Horas trabajadas | Cajas aprobadas | Cajas bloqueadas | Tolerado | Menor | Mayor | Crítico |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-11-18 | Ana | 2 | 8 | 2 | 1 | 2 | 0 | 1 |
| 2026-11-18 | Luis | 2 | 19 | 1 | 0 | 0 | 1 | 0 |
| 2026-11-19 | Ana | 6 | 27 | 3 | 2 | 1 | 2 | 1 |

Todas las celdas requeridas deben tener valor; usa `0` para cantidades vacías. Fecha admite `AAAA-MM-DD` o fechas nativas de Excel (sistemas 1900 y 1904). Las fórmulas necesitan un resultado guardado por Excel. Si se incluye la columna opcional `Cajas inspeccionadas`, debe coincidir con aprobadas + bloqueadas.

Una jornada duplicada dentro del archivo o ya guardada rechaza **todo el archivo**, sin sobreescrituras ni cargas parciales. La pantalla informa los errores con su fila. El formato V1 por lote no se convierte automáticamente: no contiene la atribución por operario necesaria. `INCIDENCIAS` y `RESUMEN_KPI` ya no se consumen; los indicadores se calculan desde el consolidado.

El ejemplo produce 60 cajas inspeccionadas, 54 aprobadas, 6 bloqueadas, 1200 unidades inspeccionadas y 11 observadas (3 Tolerado, 3 Menor, 3 Mayor, 2 Crítico). Ana: 40/8 = **5 cajas/h**; Luis: 20/2 = **10 cajas/h**; general: 60/10 = **6 cajas/h**.

## Vistas y API

- **Resumen general:** indicadores, inspección diaria, aprobación, productividad y últimas jornadas.
- **Productividad:** comparación y totales por operario.
- **Control diario:** consolidado por fecha/operario con horas, cajas y productividad.
- **Clasificaciones:** cantidades y porcentajes de unidades observadas y detalle por jornada.

Las cuatro vistas comparten los filtros de fechas y operario, así como los estados de carga, error y ausencia de datos.

`GET /api/dashboard?from=2026-11-01&to=2026-11-30&operator=Ana` requiere sesión y devuelve `summary`, `daily`, `operators`, `classifications`, `records` y `options.operators`. El filtro `operator` es opcional. Los antiguos filtros producto/turno ya no forman parte del contrato V2.

`POST /api/uploads` requiere administrador, recibe el archivo binario con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y devuelve `{ "recordCount": 3 }`. Una entrada inválida devuelve 400; una jornada existente, 409; sin sesión, 401; sin permiso, 403. Las rutas de autenticación y usuarios conservan su contrato.

## SQLite y alcance Oracle

`SQLITE_PATH` indica la base local (por defecto `data/dashboard.db`, excluida de Git). Al abrir una base del prototipo anterior, la migración transaccional a `user_version=2` **recrea únicamente las tablas de calidad**: elimina los antiguos registros por lote y las tablas de cajas individuales. **Conserva usuarios y sesiones.** Los datos anteriores no se transforman. Las aperturas siguientes conservan Calidad V2.

`quality_workdays` guarda fecha/operario como clave única, horas, cajas aprobadas/bloqueadas, las cuatro cantidades y procedencia de la carga. SQLite aplica tipos estrictos, claves foráneas y restricciones de cantidades, fechas, horas y capacidad, además de la validación en el servicio.

El adaptador y el esquema Oracle preexistentes se conservan como referencia V1 y no se migran en esta entrega. Las rutas de calidad devuelven 503 con un mensaje explícito si se selecciona Oracle. Adaptar y validar Oracle contra una instancia real queda pendiente y fuera de este alcance SQLite.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren cálculos con el ejemplo anterior, filtros por fecha/operario, ausencia de datos, clasificación Tolerado como bloqueo, validación de capacidades, importación hasta los indicadores, carga atómica, duplicados, fechas Excel, migración y reapertura, sesión, permisos y revocación de acceso.

La verificación de navegador se realiza con una base temporal en memoria: acceso administrador/visualizador, carga de un Excel de tres jornadas, cuatro vistas, filtros y diseño móvil. No requiere modificar los datos locales ni guardar credenciales de prueba en el repositorio.
