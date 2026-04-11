# 🪟 Guía de Instalación para Windows - UsureroSystem

Esta guía proporciona instrucciones detalladas para instalar y configurar el **UsureroSystem** en sistemas operativos Windows.

---

## 🛠️ Requisitos Previos

Antes de comenzar, asegúrese de tener instalados los siguientes componentes:

1.  **PostgreSQL (Base de Datos)**
    *   Descargue el instalador desde [postgresql.org](https://www.postgresql.org/download/windows/).
    *   **Importante:** Durante la instalación, defina una contraseña para el usuario `postgres` y anótela. La necesitará más adelante.
    *   Asegúrese de que la opción **pgAdmin 4** esté seleccionada durante la instalación.

2.  **Node.js (Si va a ejecutar desde el código fuente)**
    *   Descargue la versión **LTS** desde [nodejs.org](https://nodejs.org/).
    *   Esto es necesario para instalar las dependencias y compilar el sistema.

---

## 🗄️ Paso 1: Configuración de la Base de Datos

1.  Abra **pgAdmin 4** (busque en el menú Inicio).
2.  Despliegue el servidor local e introduzca su contraseña de `postgres`.
3.  Haga clic derecho en **Databases** > **Create** > **Database...**
4.  Nombre de la base de datos: `usurero_db`. Haga clic en **Save**.
5.  Haga clic derecho sobre `usurero_db` recién creada y seleccione **Query Tool**.
6.  Abra el archivo `schema.sql` (ubicado en la carpeta raíz del sistema).
7.  Copie todo el contenido del archivo y péguelo en la ventana de **Query Tool**.
8.  Presione **F5** o haga clic en el icono del rayo (Ejecutar) para crear las tablas.

---

## ⚙️ Paso 2: Configuración del Entorno

1.  En la carpeta raíz del sistema, busque el archivo `.env.example`.
2.  Cree una copia y cámbiele el nombre a `.env`.
3.  Abra el archivo `.env` con el Bloc de notas o cualquier editor de texto y configure sus credenciales:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=usurero_db
DB_PASSWORD=SU_CONTRASEÑA_AQUÍ
DB_PORT=5432
PORT=3000
JWT_SECRET=una_clave_secreta_muy_larga
```

---

## 🚀 Paso 3: Instalación y Ejecución

### Opción A: Ejecutar para Desarrollo
Si tiene el código fuente y desea ejecutarlo directamente:

1.  Abra una terminal (PowerShell o CMD) en la carpeta del proyecto.
2.  Instale las dependencias:
    ```bash
    npm install
    ```
3.  Inicie el sistema:
    ```bash
    npm run electron
    ```

### Opción B: Crear el Ejecutable (.exe)
Si desea generar un archivo portable para enviárselo al cliente:

1.  En la terminal, ejecute:
    ```bash
    npm run build
    ```
2.  El archivo ejecutable se encontrará en la carpeta `dist/`, con el nombre `UsureroSystem Setup.exe` o similar.

---

## 💡 Notas Adicionales

*   **Inicio Automático:** Si desea que el programa se inicie con Windows, cree un acceso directo del ejecutable y colóquelo en la carpeta de inicio. Presione `Win + R`, escriba `shell:startup` y pegue allí el acceso directo.
*   **Actualizaciones:** Para actualizar el sistema, simplemente reemplace los archivos en la carpeta de instalación (excepto el archivo `.env` y el archivo `database.sqlite` si está usando SQLite, aunque este sistema usa PostgreSQL por defecto).

---

> [!IMPORTANT]
> **Soporte Técnico**
> Si encuentra algún inconveniente durante la instalación, contacte a:
> **Sistemas Olazar** | [contacto@sistemasolazar.com](mailto:contacto@sistemasolazar.com)

