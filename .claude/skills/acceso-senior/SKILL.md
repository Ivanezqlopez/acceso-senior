---
name: acceso-senior
description: Referencia del sistema Acceso Senior con IA y su asistente FaciliBot - estructura y roles (admin, espacios, facilitadores, consultantes, casos), flujo conversacional, esquema JSON de acciones, validaciones (DNI, telefono, descripcion), frases estandar, usuarios de prueba y paleta de marca. Usar al construir, extender o depurar la app Acceso Senior, su chat/FaciliBot, la logica de casos/tickets, el panel o los datos en Firestore.
---

# Acceso Senior con IA — Sistema y FaciliBot

Asistente conversacional que ayuda a **personas mayores** a registrar consultas/trámites
digitales y conectarlas con un **facilitador humano**. Hay dos superficies: el **chat**
(consultante) y el **panel** (facilitador/admin). Datos en **Firebase Firestore**.

## Estructura del sistema (niveles)
- **Administrador general**: ve todo; administra espacios, facilitadores y casos; crea usuarios y asigna roles.
- **Espacios**: municipios, centros de día u otras instituciones. Puede haber varios simultáneos.
- **Facilitadores**: acompañan y gestionan los casos de los consultantes de su espacio. Ven casos, actualizan estados, toman casos sin asignar.
- **Consultantes**: personas que consultan. Pertenecen a un espacio y tienen un facilitador asignado.
- **Casos**: las consultas/problemas que carga cada consultante.

## Forma de hablar (consultante)
- Tratar SIEMPRE de "usted". Claro, paciente, amable. Frases simples, sin tecnicismos.
- No abrumar; guiar paso a paso. No cortar la conversación de forma brusca.

## Flujo conversacional FaciliBot (máquina de estados)
Orden objetivo: **saludo + pedir DNI → validar DNI → buscar usuario → (existe: pedir
problema) / (no existe: registrar) → confirmar datos → crear ticket → finalizar**.
Más: consulta de estado de un caso en cualquier momento.

Estados (ver `app.js`): `ask_dni → ask_problem | reg_name → reg_phone → ask_problem →
confirm → (create_ticket) → done`; y `status_dni` para consulta de estado.

## Acciones (contrato JSON con el backend)
Cada turno indica una `action`:
- `ask_dni` — falta el DNI.
- `check_user` — DNI válido (7–8 dígitos); el backend lo busca.
- `ask_problem` — pedir descripción del problema.
- `register_user` — usuario NO existe; pedir nombre y teléfono.
- `update_user_data` — recolectando datos del usuario nuevo.
- `confirm_data` — mostrar resumen y pedir confirmación.
- `create_ticket` — hay DNI + problema confirmado; registrar el caso.
- `check_case_status` — el usuario pregunta por "estado/seguimiento/cómo va mi caso/caso N°".
- `finish` — proceso terminado.

Regla clave de contexto: si `dbUser` tiene datos → el usuario EXISTE; si `userLookupDone`
es true y `dbUser` es null → es NUEVO y NO se debe volver a pedir el DNI.

## Validaciones
- **DNI**: solo números, 7–8 dígitos, sin puntos/espacios/guiones (se limpian automáticamente).
- **Descripción**: mínimo 10 caracteres; debe describir un problema real.
- **Teléfono**: solo números (puede incluir código de área).
- **Categoría**: debe ser exactamente el `name` de un tipo de problema; si hay duda → `"Otro"`. No mostrarla al usuario.

## Esquema de respuesta JSON (cuando hay backend LLM)
Responder SIEMPRE solo con JSON válido (sin texto ni markdown), con esta forma:
`{ schema_version, assistant{message,tone}, intent{primary,secondary[],confidence},
data{update{dni,nombre,telefono,email,descripcion,categoria},summary},
validation{missing_fields[],invalid_fields[]}, process{need_confirmation,can_continue,suggest_finish},
handoff{recommended,target,reason}, meta{agent_type,confidence,warnings[]}, action }`.
En `data.update` devolver SIEMPRE todos los campos, manteniendo los valores previos.

## Frases estándar (tono actual)
- DNI no reconocido: "Disculpe, no pude identificar su número de DNI. ¿Podría indicármelo nuevamente?"
- DNI inválido: "El DNI que ingresó no parece válido. Debe tener entre 7 y 8 dígitos. ¿Podría verificarlo?"
- Bienvenida (existe): "¡Bienvenido/a de nuevo, {nombre}! ¿En qué puedo ayudarle hoy? Cuénteme su problema o consulta."
- No registrado: "No encontré una cuenta con ese DNI en nuestro sistema. No se preocupe, vamos a registrarlo. ¿Podría decirme su nombre completo?"
- Ticket creado: "¡Listo, {nombre}! Su consulta ha sido registrada exitosamente (N° {caseId}). En breve, un facilitador se pondrá en contacto con usted."
- Error al registrar: "Disculpe, hubo un error al registrar su consulta. ¿Podría intentar nuevamente?"

## Usuarios de prueba (clave: 1234)
| Email | DNI | Rol |
|---|---|---|
| pepe@gmail.com | 12345678 | consultante |
| juan@gmail.com | 98765432 | admin |
| juan_facilitador@gmail.com | 87654321 | facilitador |
| maria@gmail.com | 11111111 | consultante |
| carlos@gmail.com | 22222222 | consultante |
| pedro_fac@gmail.com | 33333333 | facilitador |
| rosa_fac@gmail.com | 44444444 | facilitador |

## Marca (paleta "id")
- Primario violeta `#6F62E6` (variantes `#8478EC` / `#574AC9`), acento cian `#16C5DF`.
- Fondo lavanda `#F4F4FB`, superficies blancas. Tipografía: **Plus Jakarta Sans**.
- Signature de UI: "track" de estado de 3 pasos **Recibido → En proceso → Resuelto** (en ticket y tarjetas de caso).

## Mapa a la implementación actual (este repo)
- Lógica del chat y panel: `app.js` (sin backend LLM; la máquina de estados está implementada localmente en funciones `step*` y la capa de datos usa Firestore: `getUserByDni`, `createCase`, `getCasesByDni`, `getAllCases`, `assignCase`, `createUser`, `updateUserRole`, `loginUser`).
- UI/estilos: `index.html` + `styles.css`. Config Firebase: `firebase-config.js`. Reglas: `firestore.rules`.
- Casos en Firestore: `cases` (numero, dni, nombre, telefono, descripcion, categoria, estado, asignadoDni, asignadoNombre, fecha). Usuarios: `users` (doc id = dni).
- Para conectar el LLM/PHP original: reemplazar las funciones `step*` por llamadas `fetch` al endpoint respetando el contrato de `action` de arriba.
