# NaNProxy

Middleware inteligente para interceptar y monitorear solicitudes a NaN API.

## 🚀 Características

- **Interceptación de Solicitudes**: Captura automática de todas las peticiones a NaN API
- **Dashboard Personalizado**: Panel de administración con métricas en tiempo real
- **API Keys Propias**: Sistema de autenticación para el dashboard
- **Reportes**: Consumo por proyecto, modelo, dispositivo y servicio
- **Docker**: Todo en un solo contenedor, listo para desplegar

## 📦 Instalación Rápida

### Con Docker

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/nanproxy.git
cd nanproxy

# Crear archivo .env
cp .env.example .env
# Editar .env con tus configuraciones

# Construir y ejecutar
docker build -t nanproxy .
docker run -p 3000:3000 --env-file .env nanproxy
```

### Sin Docker

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/nanproxy.git
cd nanproxy

# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env
# Editar .env con tus configuraciones

# Ejecutar
npm start
```

## ⚙️ Configuración

Copia `.env.example` a `.env` y configura las siguientes variables:

```bash
# URL de la API de NaN
NAN_API_BASE_URL=https://api.nan.builders/v1

# Tu API key de NaN
NAN_API_KEY=sk-tu-key-aqui

# Puerto del servidor
PORT=3000

# Secreto JWT para autenticación
JWT_SECRET=tu-secreto-seguro
```

## 🌐 Endpoints

Una vez ejecutado, tendrás acceso a:

- **Dashboard**: `http://localhost:3000/admin`
- **API**: `http://localhost:3000/api/dashboard`
- **Proxy**: `http://localhost:3000/v1/*`
- **Health Check**: `http://localhost:3000/health`

## 📊 Uso del Proxy

Configura tu herramienta para usar NaNProxy como proxy:

```json
{
  "provider": {
    "openai": {
      "name": "NaN via NaNProxy",
      "apiKey": "sk-tu-key-aqui",
      "baseURL": "http://localhost:3000/v1",
      "model": "qwen3.6"
    }
  }
}
```

## 📁 Estructura del Proyecto

```
nanproxy/
├── src/
│   ├── index.js              # Punto de entrada
│   ├── config/
│   │   ├── database.js       # Configuración SQLite
│   │   └── environment.js    # Variables de entorno
│   ├── models/
│   │   ├── Request.js        # Modelo de solicitudes
│   │   ├── Project.js        # Modelo de proyectos
│   │   ├── ApiKey.js         # Modelo de API keys
│   │   └── Metric.js         # Modelo de métricas
│   ├── proxy/
│   │   ├── server.js         # Servidor proxy
│   │   └── interceptor.js    # Interceptador de requests
│   ├── admin/
│   │   ├── options.js        # Configuración AdminJS
│   │   └── components/
│   │       └── Dashboard.jsx # Dashboard personalizado
│   ├── api/
│   │   └── routes/
│   │       └── dashboard.js  # Rutas de la API
│   └── utils/
│       ├── encryption.js     # Utilidades de encriptación
│       └── logger.js         # Sistema de logs
├── public/                   # Archivos estáticos
├── database/                 # Base de datos SQLite
├── logs/                     # Archivos de log
├── Dockerfile                # Configuración Docker
├── .env.example              # Variables de entorno de ejemplo
└── package.json              # Dependencias
```

## 🛠️ Tecnologías

- **Backend**: Node.js + Express
- **Base de datos**: SQLite (via better-sqlite3)
- **Admin Panel**: AdminJS
- **Proxy**: http-proxy-middleware
- **Seguridad**: Helmet, CORS, Rate Limiting

## 📝 Licencia

MIT