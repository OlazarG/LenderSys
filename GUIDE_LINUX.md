# 🐧 Guía de Instalación para Linux - UsureroSystem

Esta guía explica cómo instalar y configurar el sistema en distribuciones Linux (Ubuntu, Debian, Linux Mint, etc.).

## 1. Instalar PostgreSQL
El backend del sistema requiere PostgreSQL. Ejecuta estos comandos en tu terminal:

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### Configurar el usuario
Entra a la terminal de Postgres y crea la base de datos:
```bash
sudo -u postgres psql
# Dentro de psql, ejecuta:
CREATE DATABASE usurero_db;
CREATE USER admin WITH PASSWORD 'admin';
GRANT ALL PRIVILEGES ON DATABASE usurero_db TO admin;
\q
```

### Cargar las tablas e Inicializar Usuario
Desde la carpeta del proyecto, carga el esquema y luego ejecuta el script de inicialización para crear el usuario administrador:
```bash
# 1. Cargar tablas
sudo -u postgres psql -d usurero_db -f schema.sql

# 2. Instalar dependencias necesarias (bcrypt, jwt, etc)
npm install

# 3. Crear usuario administrador por defecto (User: admin / Pass: admin123)
npm run init-db
```

## 2. Instalar la Aplicación
Tienes dos formas de usar el programa en Linux según el archivo que hayas generado:

### Opción A: Usar el archivo .AppImage (Portable)
1. Clic derecho sobre `UsureroSystem.AppImage`.
2. Ve a **Propiedades** -> **Permisos**.
3. Activa la casilla **"Permitir ejecutar el archivo como un programa"**.
4. Doble clic para abrir.

### Opción B: Instalar el archivo .deb
```bash
sudo dpkg -i usurerosystem_1.0.0_amd64.deb
# Si faltan dependencias, corrígelas con:
sudo apt-get install -f
```

## 3. Configuración de Credenciales
Asegúrate de tener el archivo `.env` en la carpeta donde se encuentra la aplicación o define las variables de entorno:
```bash
# Variables necesarias
DB_USER=admin
DB_HOST=localhost
DB_NAME=usurero_db
DB_PASSWORD=admin
DB_PORT=5432

# Secreto para tokens de sesión (Login)
JWT_SECRET=tu_clave_secreta_aqui
```

## 4. Ejecución y Logs
Si instalaste el `.deb`, puedes buscar "UsureroSystem" en tu menú de aplicaciones o lanzarlo por terminal con el comando: `usurerosystem`.

Si tienes problemas, lánzalo así para ver qué sucede:
```bash
usurerosystem --verbose
```

---
*Para soporte técnico: contacto@sistemasolazar.com*
