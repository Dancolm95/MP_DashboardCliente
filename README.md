# MP Dashboard Cliente

Prototipo local de login, carga diaria de Excel y dashboard de KPIs generales. React muestra los datos; la API mantiene la lógica de acceso e importación fuera del adaptador de base de datos.

## Iniciar

Requiere Node.js 22.13 o superior.

```bash
cp .env.example .env
npm install
npm run seed
npm run dev
```

Abrir `http://127.0.0.1:5173`. Las credenciales iniciales se definen en `.env` (`ADMIN_EMAIL` y `ADMIN_PASSWORD`). Cambia la contraseña de ejemplo antes de compartir el prototipo. `npm run seed` crea 14 días de datos de demostración en SQLite y se puede ejecutar más de una vez sin duplicarlos.

El administrador puede crear cuentas desde **Usuarios** y descargar la plantilla desde **Cargar Excel**. El archivo `.xlsx` debe contener exactamente dos filas: encabezados y un día de datos. La primera columna se llama `fecha` (formato `AAAA-MM-DD`); las siguientes son KPIs numéricos no negativos. Una fecha existente se rechaza completa. Todas las cuentas pueden consultar los mismos indicadores.

## Adaptadores de datos

`DATABASE_ADAPTER=sqlite` usa `SQLITE_PATH` y crea automáticamente las tablas definidas en `server/db/schema.sqlite.sql`. Los archivos de la base se guardan en `data/`, ignorados por Git.

`DATABASE_ADAPTER=oracle` usa `ORACLE_USER`, `ORACLE_PASSWORD` y `ORACLE_CONNECT_STRING`, con el controlador oficial `oracledb` en modo Thin. El DBA debe ejecutar `server/db/schema.oracle.sql` o proporcionar un esquema existente para adaptar el módulo. La API consume el mismo contrato del repositorio para ambos motores. No se ha probado Oracle contra una instancia real porque todavía no hay acceso ni esquema aprobado.

## Verificar

```bash
npm test
npm run build
```

La prueba de integración cubre login, permisos, carga de un Excel válido, consulta, rechazo de fecha duplicada y archivo inválido con SQLite en memoria. La validación de Oracle queda pendiente hasta recibir versión, conectividad, credenciales y permisos o esquema existente.
