/* ============================================================
   CONFIGURACIÓN DE FIREBASE
   ------------------------------------------------------------
   Pegá acá los datos de TU proyecto de Firebase.

   Cómo conseguirlos (te lleva ~5 minutos, es gratis):
   1) Entrá a  https://console.firebase.google.com  con tu cuenta de Google.
   2) "Crear un proyecto" -> ponele un nombre (ej. "acceso-senior") -> Crear.
   3) En el menú, abrí "Compilación > Firestore Database" -> "Crear base de
      datos" -> elegí modo de producción -> región (ej. southamerica-east1).
   4) En "Compilación > Authentication" -> "Comenzar" -> pestaña "Sign-in
      method" -> activá "Anónimo".
   5) Volvé al inicio (ícono de engranaje > Configuración del proyecto).
      Bajá hasta "Tus apps" -> tocá el ícono web  </>  -> registrá la app
      (sin hosting) -> te muestra un objeto "firebaseConfig".
   6) Copiá esos valores y reemplazá los de abajo (los que dicen "PEGA_AQUI").

   7) En Firestore -> pestaña "Reglas", pegá las reglas del archivo
      firestore.rules (están en este mismo proyecto) y "Publicar".
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyDwhAyT2ywuFmw6lAIhLevTpqOXDRaHsIc",
  authDomain: "acceso-senior.firebaseapp.com",
  projectId: "acceso-senior",
  storageBucket: "acceso-senior.firebasestorage.app",
  messagingSenderId: "535363589599",
  appId: "1:535363589599:web:91cd2f8c37352d0046206a",
  measurementId: "G-9RV36P4LK8"
};
