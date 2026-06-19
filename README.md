# Acceso Senior con IA — Web App móvil

App web mobile-first basada en el *Manual de sistema Acceso Senior con IA*.
Implementa el asistente conversacional **FaciliBot** y un panel de gestión.
No necesita servidor ni base de datos externa: todo corre en el navegador y
los datos se guardan en `localStorage`.

## Qué incluye

- **Asistente (Consultante):** flujo del manual paso a paso
  `pedir DNI → validar → buscar usuario → registrar/saludar → tomar el problema
  → confirmar → crear ticket (N° de caso) → consultar estado`.
  - Normaliza el DNI aunque tenga puntos o guiones (valida 7–8 dígitos).
  - Clasifica el problema automáticamente (Trámites, Salud, Banca, Conectividad, Dispositivos, Otro).
  - Dictado por voz (🎤) y diseño con texto grande, pensado para personas mayores.
- **Panel (Facilitador / Admin):** login, lista de casos, cambio de estado
  (Pendiente / En proceso / Resuelto) y estadísticas. Se abre con el botón 👤.
- **PWA:** instalable en el celular y funciona offline (manifest + service worker).

## Cómo abrirla

Es estática. Cualquiera de estas opciones:

```bash
# Opción 1: servidor local (recomendado, habilita PWA/offline)
npx serve .
# o
python -m http.server 8000
```

Luego abrir en el celular la IP de la PC, por ejemplo `http://192.168.x.x:8000`.
En el navegador del teléfono: menú → "Agregar a pantalla de inicio".

También se puede abrir `index.html` directo con doble clic (sin PWA/offline).

## Usuarios de prueba (del manual)

| Email | Clave | DNI | Rol |
|---|---|---|---|
| pepe@gmail.com | 1234 | 12345678 | consultante |
| juan@gmail.com | 1234 | 98765432 | admin |
| juan_facilitador@gmail.com | 1234 | 87654321 | facilitador |
| maria@gmail.com | 1234 | 11111111 | consultante |
| carlos@gmail.com | 1234 | 22222222 | consultante |
| pedro_fac@gmail.com | 1234 | 33333333 | facilitador |
| rosa_fac@gmail.com | 1234 | 44444444 | facilitador |

> En el chat puede probar con un DNI existente (ej. `12.345.678`) para que lo
> salude por nombre, o uno nuevo para ver el registro automático.

## Nota sobre la IA

El manual describe a FaciliBot respondiendo en un JSON con acciones
(`ask_dni`, `check_user`, `create_ticket`, etc.). Acá esa máquina de estados
está implementada **localmente** en `app.js`, así la demo funciona sin backend
ni claves de API. Para conectar el LLM real (PHP/RAG del repo original), basta
reemplazar las funciones `step*` por llamadas `fetch` al endpoint y respetar el
mismo flujo de acciones.
