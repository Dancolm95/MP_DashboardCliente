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

Abre `http://127.0.0.1:5173`. `npm run seed` solo crea el administrador; el dashboard inicia vacío. El administrador puede crear usuarios desde **Usuarios** y subir los archivos nocturnos desde **Cargar Excel**.

Cada archivo debe incluir las tres hojas mencionadas. `CONTROL_DIARIO` admite varios registros, uno por fecha, turno y lote; `INCIDENCIAS` detalla los defectos por fecha y lote; `RESUMEN_KPI` se contrasta con los totales calculados desde el detalle. Si el resumen difiere, la carga se completa y muestra una advertencia. Una combinación de fecha, turno y lote ya cargada rechaza el archivo completo.

La merma se muestra como cantidad informativa. Los pendientes al cierre corresponden al último saldo general del periodo, sin dividirse por turno o producto. La tasa de aprobación se calcula con las cajas aprobadas sobre las inspeccionadas.

## Base de datos

`DATABASE_ADAPTER=sqlite` usa `SQLITE_PATH` y crea las tablas en `server/db/schema.sqlite.sql`. La base local se guarda en `data/`, excluida por Git.

`DATABASE_ADAPTER=oracle` usa `ORACLE_USER`, `ORACLE_PASSWORD` y `ORACLE_CONNECT_STRING`, con el controlador oficial `oracledb` en modo Thin. El DBA debe aplicar `server/db/schema.oracle.sql` o proporcionar el esquema existente para adaptar el módulo. La integración Oracle aún no se ha probado contra una instancia real.

## Verificar

```bash
npm test
npm run build
```

La prueba de integración cubre login, permisos, carga de las tres hojas, filtros, incidencias, advertencias y rechazo de duplicados en SQLite. `.env` y los datos locales no se agregan al control de versiones; `.env.example` solo documenta las variables requeridas.
