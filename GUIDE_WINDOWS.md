# 🪟 Guía de Instalación para Windows - UsureroSystem

Esta guía explica cómo instalar y configurar el sistema en computadoras con Windows.

## 1. Requisitos del Sistema
Para que el sistema funcione, es necesario tener instalado un servidor de base de datos **PostgreSQL**.

1. **Descargar PostgreSQL**: Ve a [postgresql.org](https://www.postgresql.org/download/windows/) y descarga el instalador.
2. **Durante la instalación**: Define una contraseña para el usuario `postgres` (ejemplo: `admin`) y anótala. Asegúrate de instalar también **pgAdmin 4**.

## 2. Configurar la Base de Datos
1. Abre **pgAdmin 4** desde el menú Inicio.
2. Conéctate al servidor local.
3. Haz clic derecho en "Databases" -> **Create** -> **Database...**
4. Ponle el nombre: `usurero_db`.
5. Una vez creada, haz clic derecho sobre `usurero_db` y selecciona **Query Tool**.
6. Abre el archivo `schema.sql` (incluido en la carpeta del sistema), copia su contenido, pégalo en el Query Tool y presiona **F5** (o el botón de Play) para crear las tablas.

## 3. Instalación de la Aplicación
1. Ve a la carpeta donde tienes el ejecutable (`UsureroSystem.exe`).
2. Crea una carpeta en tu disco `C:\` llamada `SistemasOlazar` y pega allí el programa.
3. **Archivo de Configuración**: Crea un archivo de texto llamado `.env` en la misma carpeta del `.exe` con este contenido:
   ```env
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=usurero_db
   DB_PASSWORD=tu_contraseña_de_postgres
   DB_PORT=5432
   PORT=3000
   ```

## 4. Iniciar el Sistema
* Haz doble clic en `UsureroSystem.exe`.
* **Tip**: Si quieres que se inicie solo con Windows, haz clic derecho en el `.exe`, elige "Crear acceso directo" y muévelo a la carpeta de inicio de Windows (presiona `Win+R`, escribe `shell:startup` y dale a Enter).

---
*Para soporte técnico: contacto@sistemasolazar.com*
