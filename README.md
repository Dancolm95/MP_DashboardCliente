# MP Dashboard Cliente · Bellia

Dashboard de control de calidad para Bellia, construido con React, Express y SQLite. Esta rama usa una base propia y no modifica la base del dashboard anterior. Conserva el acceso de administrador y visualizador: solo el administrador puede importar Excel y gestionar visualizadores.

## Iniciar

Requiere Node.js 22.13 o superior. Copia `.env.example` a `.env` y configura `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Luego ejecuta:

```bash
npm install
npm run seed
npm run dev
```

La aplicación se abre en `http://127.0.0.1:5173`. `BELLIA_SQLITE_PATH` indica la base de esta rama; por defecto se usa `data/bellia.db`. El antiguo `SQLITE_PATH` no se usa. No apuntes Bellia a una base del dashboard anterior: si detecta un esquema incompatible, se detiene sin migrar sus datos.

## Reglas del dashboard

- Una jornada es una combinación única de fecha y mesa. `Personal Operativo` es una cantidad por jornada, no identifica personas.
- Cajas inspeccionadas = cajas aprobadas + cajas bloqueadas. Sets totales = cajas inspeccionadas × 2. La vista muestra el total de sets, sin desglose de sets aprobados y bloqueados.
- Una mesa cumple la meta cuando inspecciona al menos 50 cajas por cada operario asignado a esa jornada, aunque registre más de 8 horas. El cumplimiento del periodo es cajas inspeccionadas ÷ cajas requeridas × 100; puede superar el 100 %. La productividad es cajas inspeccionadas ÷ horas de mesa; el personal operativo no modifica ese divisor.
- El detalle distribuye los sets bloqueados por fecha, pieza y una sola causa: origen (proveedor) o no origen (transporte o manipulación). No identifica la mesa. Si la suma diaria del detalle difiere de cajas bloqueadas × 2, se avisa sin rechazar la carga.

## Importar Excel

El administrador carga un `.xlsx` de hasta 2 MB. `CONTROL_DIARIO` es obligatorio y admite hasta 3000 jornadas. Los encabezados pueden cambiar de orden:

| Fecha | Mesa | Personal Operativo | Horas trabajadas | Cajas aprobadas | Cajas bloqueadas |
| --- | --- | ---: | ---: | ---: | ---: |
| 2026-11-20 | Mesa 1 | 4 | 8 | 70 | 8 |

`Detalle` es opcional y admite hasta 3000 filas. Sus columnas son `Fecha`, `Tipo de pieza`, `Roto/quiñado SIN pedazo en caja`, `Fisura`, `Rebaba cortante`, `Mancha`, `Otros`, `Total Origen`, `Roto/quiñado CON pedazo en caja` y `Total No Origen`. Las categorías vacías cuentan como cero. Los totales deben coincidir con sus categorías; las fórmulas requieren un resultado guardado. Las fechas admiten `AAAA-MM-DD` o fechas nativas de Excel.

Las cajas deben ser enteros no negativos y cada jornada debe tener al menos un operario; las horas deben estar entre 8 y 24. Un duplicado de fecha + mesa o fecha + pieza, dentro del archivo o ya guardado, rechaza toda la carga. Cada fecha de `Detalle` debe aparecer en `CONTROL_DIARIO` del mismo archivo. Si falta la hoja `Detalle`, no se compara su total con las cajas bloqueadas.

## Vistas y API

- **Resumen:** porcentaje de cajas inspeccionadas frente a cajas requeridas según el personal de las mesas y jornadas filtradas, cajas aprobadas/bloqueadas, sets totales e inspección diaria. Muestra las cinco jornadas más recientes; todas están en Control diario.
- **Control diario:** jornadas con personal, horas, cajas inspeccionadas y requeridas, sets totales y estado de la meta.
- **Detalle de fallas:** sets bloqueados por origen/no origen, causa, fecha y pieza. Solo aplica el filtro de fechas; el filtro de mesa no afecta esta vista.

`GET /api/dashboard?from=2026-11-01&to=2026-11-30&table=Mesa%201` requiere sesión. Devuelve `summary`, `daily`, `records`, `defects` y `options.tables`. `summary` incluye `required`, `attainmentRate` y `targetMet`; cada elemento de `records` incluye `required` y `targetMet`. La consulta de `defects` usa solo las fechas aunque se envíe `table`.

Los filtros `Desde` y `Hasta` establecen un rango inclusivo. `Solo día` fija ambas fechas a la elegida; al borrar ese valor se restablecen los últimos 30 días.

`POST /api/uploads` requiere administrador y el archivo binario con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Devuelve `recordCount`, `detailCount` y `warningDates`. Sin sesión responde 401; sin permiso, 403; entrada inválida, 400; duplicado, 409. La carga de ambas hojas se guarda en una sola transacción.

El adaptador Oracle y su esquema antiguo permanecen como referencia, pero las rutas de calidad Bellia responden 503 cuando se selecciona Oracle.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren cálculos de cajas, sets, meta, filtros, advertencias, importación atómica, duplicados, sesión y permisos. Con el Excel real de Bellia, las 8 jornadas suman 693 cajas inspeccionadas, 1300 requeridas, 1386 sets totales y 1 jornada que alcanza su meta.
