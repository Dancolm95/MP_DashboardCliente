# Dashboard MP

Dashboard con inicio de sesión. Desarrolla por entregas pequeñas, con un alcance explícito y criterios de aceptación verificables.

## Alcance y diseño

- **YAGNI.** Implementa las capacidades necesarias para cumplir la tarea actual. Agregar botones, plantillas, exportaciones, roles u otras funciones requiere un requisito explícito. Por ejemplo, importar Excel no incluye descargar una plantilla. Si encuentras una función existente fuera del alcance, repórtala y pide una decisión antes de modificarla.
- **KISS.** Usa la solución más sencilla que cumpla los criterios de aceptación y encaje con la estructura actual. Si propones un patrón, una capa o una dependencia nueva, explica qué problema concreto de la entrega resuelve.
- **DRY.** Reutiliza componentes y lógica existentes cuando tengan la misma responsabilidad. Extrae código común cuando represente una regla compartida que deba cambiar en conjunto.

## Seguridad

- **Defensa en profundidad.** Aplica controles donde corresponden. La interfaz guía al usuario y muestra errores. El servidor o el servicio de datos aplica la autorización y valida las entradas antes de procesarlas.
- **Confianza cero.** En cada operación protegida, verifica la sesión y el permiso en la capa que controla el acceso. Trata como no confiables los datos, identificadores y roles enviados por el cliente.
- **Mínimo privilegio.** Limita el acceso de usuarios, servicios y credenciales a los datos y operaciones que necesitan. Añade roles o amplía permisos solo cuando un requisito actual lo justifique.

## Flujo de trabajo

1. Lee la tarea y revisa el código relacionado. Si una duda cambia el alcance, el comportamiento esperado o los permisos, aclárala antes de implementar.
2. Si la tarea pide revisión o planificación, trabaja en modo de solo lectura. Si pide implementación, limita los cambios a lo necesario para cumplir sus criterios de aceptación.
3. Verifica los criterios con las comprobaciones disponibles. Si el cambio afecta al acceso, comprueba un caso permitido y uno denegado.
4. Al terminar, resume qué cambió, qué comprobaste y qué quedó pendiente de verificar.