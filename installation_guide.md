# 📝 Guía de Instalación: UsureroSystem

Esta guía detalla los pasos para instalar y configurar el sistema en una nueva máquina cliente.

## 📋 Requisitos Previos
1. **PostgreSQL**: Descargar e instalar desde [postgresql.org](https://www.postgresql.org/download/).
2. **Node.js**: Descargar e instalar la versión LTS desde [nodejs.org](https://nodejs.org/).

---

## 🛠️ Paso 1: Configuración de la Base de Datos

1. Abre **pgAdmin 4** (instalado con PostgreSQL).
2. Crea una nueva base de datos llamada: `usurero_db`.
3. Ejecuta el script SQL proporcionado (`schema.sql`) en la herramienta "Query Tool" de `usurero_db` para crear las tablas y vistas necesarias.

---

## ⚙️ Paso 2: Configuración del Entorno (`.env`)

En la carpeta raíz del proyecto/aplicación, crea o edita el archivo `.env` con los siguientes datos:

```env
PORT=3000
DB_USER=tu_usuario_postgres (por defecto suele ser 'postgres')
DB_HOST=localhost
DB_NAME=usurero_db
DB_PASSWORD=tu_contraseña_de_postgres
DB_PORT=5432
```

---

## 🚀 Paso 3: Lanzamiento de la Aplicación

### Opción A: Desde el código fuente (Para desarrollo/configuración)
1. Abre una terminal en la carpeta del proyecto.
2. Ejecuta `npm install` para instalar dependencias.
3. Ejecuta `npm run electron` para iniciar la aplicación de escritorio.

### Opción C: Generar el instalador para Linux
1. Ejecuta `npm run build`.
2. Busca en la carpeta `dist/` el archivo `.AppImage` (ejecutable directo) o el archivo `.deb` (para instalar en Ubuntu/Debian).

---

## ⚠️ Notas Importantes
- **Primer inicio**: Asegúrate de que el servicio de PostgreSQL esté corriendo antes de abrir la aplicación.
- **Exportación**: Los archivos exportados se descargarán a través de la interfaz de la aplicación.
- **Morosidad**: El sistema calcula la morosidad diariamente a las 23:55 (siempre que el programa o la PC estén encendidos en ese momento, o se ejecutará al iniciar conforme a la arquitectura).

---

> [!TIP]
> Si deseas que el sistema se inicie automáticamente con Windows, puedes crear un acceso directo del `.exe` generado y colocarlo en la carpeta de "Inicio" de Windows (`shell:startup`).
