# Guía: publicar Acceso Senior (Firebase + GitHub Pages)

Son 2 etapas. Hacelas en orden. No necesitás saber programar.

---

## ETAPA 1 — Crear la base de datos (Firebase) · ~10 min · GRATIS

1. Entrá a **https://console.firebase.google.com** con tu cuenta de Google.
2. **Crear un proyecto** → nombre: `acceso-senior` → seguí hasta "Crear proyecto".
   (Podés desactivar Google Analytics, no hace falta.)
3. En el menú izquierdo: **Compilación → Firestore Database** → **Crear base de datos**
   → elegí **modo producción** → región **southamerica-east1** → Habilitar.
4. **Compilación → Authentication** → **Comenzar** → pestaña **Sign-in method**
   → en la lista activá **Anónimo** → Guardar.
5. Reglas de seguridad: en **Firestore Database → pestaña Reglas**, borrá lo que
   haya y pegá el contenido del archivo `firestore.rules` (está en esta carpeta)
   → **Publicar**.
6. Conseguir las claves: tocá el **engranaje ⚙ (arriba izq.) → Configuración del
   proyecto**. Bajá hasta **"Tus apps"** → tocá el ícono **web `</>`** → ponele
   un apodo (`web`) → **Registrar app**. Te va a mostrar algo así:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "acceso-senior.firebaseapp.com",
     projectId: "acceso-senior",
     storageBucket: "acceso-senior.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123...:web:abc..."
   };
   ```

7. Copiá esos valores y pegalos en el archivo **`firebase-config.js`** de esta
   carpeta (reemplazando los que dicen `PEGA_AQUI`).

8. Recargá la app en el navegador. Si el cartel desaparece y el chat funciona,
   ¡la base de datos quedó conectada! Probá cargar un caso y verlo en el panel
   (botón 👤, usuario `juan@gmail.com` / `1234`).

> 🔒 Las claves de Firebase para web **no son secretas**: están pensadas para ir
> en el navegador. La seguridad la dan las *reglas* y el login anónimo. Por eso
> está bien que queden en el repositorio público de GitHub.

---

## ETAPA 2 — Publicar en internet (GitHub Pages) · ~10 min · GRATIS

La forma más simple, **sin instalar nada**:

1. Creá una cuenta gratis en **https://github.com** (si no tenés).
2. Arriba a la derecha **+ → New repository**.
   - Repository name: `acceso-senior`
   - Marcá **Public**
   - **Create repository**.
3. En la página del repo vacío, tocá el link **"uploading an existing file"**.
4. Arrastrá **todos los archivos de esta carpeta** (index.html, styles.css,
   app.js, firebase-config.js, manifest.webmanifest, sw.js, icon.svg) a la
   ventana → abajo **Commit changes**.
5. Andá a **Settings** (del repo) → menú izquierdo **Pages**.
   - En "Source" elegí **Deploy from a branch**.
   - Branch: **main** / carpeta **/(root)** → **Save**.
6. Esperá 1–2 minutos y recargá esa página de "Pages". Te va a aparecer el link
   público, tipo:

   **https://TU-USUARIO.github.io/acceso-senior/**

7. ¡Ese link ya lo podés compartir con quien quieras! Cualquiera lo abre desde
   el celular y "Agregar a pantalla de inicio".

---

## Importante sobre Firebase: dominios autorizados

Para que el **login anónimo** funcione en GitHub Pages, agregá tu dominio:
Firebase → **Authentication → Settings → Dominios autorizados → Agregar dominio**
→ escribí `TU-USUARIO.github.io` → Agregar.

---

## Resumen de qué hace cada archivo

| Archivo | Para qué |
|---|---|
| index.html / styles.css / app.js | La app |
| firebase-config.js | Tus claves de Firebase (lo editás vos) |
| firestore.rules | Reglas de seguridad (las pegás en la consola) |
| manifest.webmanifest / sw.js / icon.svg | Que funcione como app instalable/offline |
