// Configuración de Fabrik Program (App de Gabi). Las claves de Firebase no son secretas: identifican el proyecto.
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCK2E8-5eV16PG8dfl5xkGFVtL1C6_aGhg",
    authDomain: "programapp-734f3.firebaseapp.com",
    projectId: "programapp-734f3",
    storageBucket: "programapp-734f3.firebasestorage.app",
    messagingSenderId: "210078379569",
    appId: "1:210078379569:web:b77990f7187c4c2cdaaf10"
  },
  // URL de la implementación del Apps Script (termina en /exec). Se rellena en el paso 2 de LEEME.
  // Botón "Entrar con Microsoft": poner true cuando esté configurado en Microsoft Entra + Firebase
  microsoft: false,
  // Enlace que se comparte con el botón «Compartir» (lleva a la pantalla de entrada)
  urlApp: "https://pcomader.github.io/programapp/",
  // Redes de Gabi en la pantalla de entrada (WhatsApp: número con prefijo, sin + ni espacios)
  redes: { instagram: "https://www.instagram.com/gabimoreno_5", whatsapp: "34695619205" },
  // Notificaciones: clave pública «Certificados push web» de Firebase (no es secreta)
  vapidKey: "BEdnTf60dgwuN4mlddktzmQEIwASmGsdL2ly3FzJH3gU97hOVvzHcCHrcrxiRuRGIQPYYYyaxAsDbD1ccw7XqWo",
  apiUrl: "https://script.google.com/macros/s/AKfycbx_qvtT1ZNkNCQfF8iXUxheOraXlOXEJJ6mfFJ_PMeudx5Fax0KkMUasN5fWJoudFjw/exec"
};
