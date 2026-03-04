# Configuración de Cloud Sync (Google Drive)

TotalGestPro guarda automáticamente tus datos en la carpeta privada de Google Drive de cada usuario (`appDataFolder`). Esta carpeta no es visible en el Drive normal del usuario — es privada para la app.

## Pasos de configuración

### 1. Google Cloud Console
1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un nuevo proyecto o selecciona uno existente
3. En el menú lateral: **APIs y Servicios → Biblioteca**
4. Busca **"Google Drive API"** y actívala

### 2. Crear credenciales OAuth 2.0
1. Ve a **APIs y Servicios → Credenciales**
2. Clic en **"Crear credenciales" → "ID de cliente OAuth 2.0"**
3. Tipo de aplicación: **Aplicación web**
4. Nombre: `TotalGestPro`
5. **Orígenes de JavaScript autorizados**: añade tu URL de producción
   - `https://tu-app.pages.dev` (Cloudflare Pages)
   - `http://localhost:3000` (desarrollo)
6. Guarda y copia el **Client ID**

### 3. Configurar la app
Crea un archivo `.env` en la raíz del proyecto:
```
VITE_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
```

### 4. Pantalla de consentimiento OAuth
1. Ve a **APIs y Servicios → Pantalla de consentimiento de OAuth**
2. Tipo de usuario: **Externo**
3. Nombre de la aplicación: `TotalGestPro`
4. Scopes: añade `https://www.googleapis.com/auth/drive.appdata`
5. En pruebas: añade los emails de los usuarios de prueba

## Cómo funciona

- Cada usuario conecta su propia cuenta de Google (botón en el sidebar)
- Los datos se guardan en **su** `appDataFolder` (privado, no visible en Drive)
- Sincronización automática 15 segundos después de cualquier cambio
- Al instalar en nuevo dispositivo: el usuario conecta Google → elige restaurar o fusionar

## Privacidad
- TotalGestPro **nunca accede** a los archivos normales del Drive del usuario
- Solo usa `appDataFolder` (scope restringido)
- Cada usuario es dueño total de sus datos
