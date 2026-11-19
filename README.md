# MP Dashboard Cliente

Prototipo local del servicio de control de calidad. Usa las hojas `CONTROL_DIARIO`, `INCIDENCIAS` y `RESUMEN_KPI` de un Excel `.xlsx`. React muestra los datos; la API mantiene las reglas de acceso e importación separadas del adaptador de base de datos.

## Iniciar

Requiere Node.js 22.13 o superior.

```bash
cp .env.example .env
```

Edita `.env` y reemplaza `ADMIN_PASSWORD` con una contraseña local. Después ejecuta:

```bash
npm install
npm run seed
npm run dev
```

Abre `http://127.0.0.1:5173`. `npm run seed` crea el único administrador; el dashboard inicia vacío. Ese administrador puede crear y eliminar cuentas de visualización desde **Usuarios** y subir los archivos nocturnos desde **Cargar Excel**. Al eliminar una cuenta de visualización, sus sesiones dejan de funcionar. La cuenta administradora no se puede eliminar desde la aplicación. Si ya existe un administrador con otro correo, `seed` se detiene en lugar de crear otro.

El login admite hasta cinco intentos por dirección IP en 15 minutos. El contador se guarda en memoria y se reinicia al reiniciar la API.

Cada archivo debe incluir las tres hojas mencionadas. `CONTROL_DIARIO` admite varios registros por fecha y lote, solo con turno `Día` o `Diurno` (se guarda como `Día`); `INCIDENCIAS` detalla los defectos por fecha y lote; `RESUMEN_KPI` se contrasta con los totales calculados desde el detalle. Si el resumen difiere, la carga se completa y muestra una advertencia. Una combinación de fecha, turno y lote ya cargada rechaza el archivo completo.

La merma se muestra como cantidad informativa. Los pendientes al cierre corresponden al último saldo general del periodo, sin dividirse por turno o producto. La tasa de aprobación se calcula con las cajas aprobadas sobre las recibidas en el rango más los pendientes iniciales del primer día seleccionado; así no se cuenta el saldo arrastrado varias veces.

## Base de datos

`DATABASE_ADAPTER=sqlite` usa `SQLITE_PATH` y crea las tablas en `server/db/schema.sqlite.sql`. La base local se guarda en `data/`, excluida por Git.

`DATABASE_ADAPTER=oracle` usa `ORACLE_USER`, `ORACLE_PASSWORD` y `ORACLE_CONNECT_STRING`, con el controlador oficial `oracledb` en modo Thin. El DBA debe aplicar `server/db/schema.oracle.sql` o proporcionar el esquema existente para adaptar el módulo. La integración Oracle aún no se ha probado contra una instancia real.

## Verificar

```bash
npm test
npm run build
```

La prueba de integración cubre login, permisos, carga de las tres hojas, filtros, incidencias, advertencias y rechazo de duplicados en SQLite. `.env` y los datos locales no se agregan al control de versiones; `.env.example` solo documenta las variables requeridas.

## Prototipo de control de cajas

Las tablas `operarios`, `trabajo_diario_operario`, `cajas`, `composicion_caja`, `detalle_composicion` y `clasificaciones` preparan el control individual sin cambiar aún la importación Excel ni el dashboard. SQLite las crea al abrir la base existente; para Oracle, el DBA debe aplicar las nuevas sentencias al final de `server/db/schema.oracle.sql`. La integración Oracle todavía no se ha probado con una instancia real.

El servicio interno `server/box-control.js` valida lotes de cajas antes de guardarlos: cada caja tiene código global único, una jornada de su operario, 20 vajillas en la inspección inicial y 20 al cierre. Las cantidades óptimas y observadas por clasificación se conservan entre ambos momentos dentro de cada lote de carga. Una caja solo está aprobada si contiene 20 vajillas óptimas; las demás están bloqueadas. `summarizeBoxControl` calcula bloqueadas iniciales y al cierre, y cajas revisadas por hora de cada operario. El cierre no se atribuye a un operario concreto.

La entrada interna de prueba usa `{ workDays: [{ operatorId, date, hours }], boxes: [{ code, date, operatorId, inicial: { optimal, details }, cierre: { optimal, details } }] }`; cada detalle contiene `{ classificationId, quantity }`. Los identificadores admitidos son `TOLERADO`, `MENOR`, `MAYOR` y `CRITICO`. No hay aún una ruta API ni una carga Excel para estas tablas. El formato oficial determinará la correspondencia de columnas y las advertencias frente a `CONTROL_DIARIO`.
