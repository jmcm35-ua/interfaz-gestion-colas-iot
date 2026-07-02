# UCAFlow - Trabajo de Fin de grado

<div align="center">

![UCAFlow - Interfaz de simulación](./src/assets/images/logo/logo.ico)

</div>

**UCAFlow** es una aplicación web desarrollada como Trabajo de Fin de Grado para la Universidad de Alicante. Su objetivo principal es la simulación, gestión y monitorización en tiempo real de colas de mensajes en entornos IoT (Internet of Things). 

La herramienta permite evaluar el rendimiento y la eficiencia de algoritmos de categorización de datos sin necesidad de conectarse a servidores externos, delegando la carga computacional a hilos de procesamiento en segundo plano (*Web Workers*) para garantizar una experiencia de usuario fluida e ininterrumpida.

---

## 🚀 Guía de Uso

A continuación se detallan los diferentes caminos para utilizar o desarrollar en UCAFlow, dependiendo de si eres un usuario final o un desarrollador.

### 📥 1. Para Usuarios: Descarga y Ejecución (Versión Instalable)

Si no deseas compilar el código fuente y solo quieres utilizar la herramienta final en tu ordenador, este es tu camino:

1. Dirígete a la sección de **[Releases](https://github.com/jmcm35-ua/interfaz-gestion-colas-iot/releases)** del repositorio.
2. Descarga el archivo ejecutable (UCAFlow-Setup.exe) de la última versión disponible.
3. Ejecuta el archivo descargado para instalar e iniciar la aplicación de escritorio nativa en tu equipo.

---

### 🛠️ 2. Para Desarrolladores: Entorno Local

El proyecto está construido utilizando **Angular 17** para la interfaz gráfica y **Electron** para el empaquetado como aplicación nativa de escritorio. 

#### Prerrequisitos
* **Node.js** (Se recomienda la versión LTS más reciente).
* **npm** (Gestor de paquetes de Node).
* **Angular CLI** instalado globalmente (opcional, pero recomendado).
* **Electron** y **Electron-Builder** (se instalarán con las dependencias).

#### Instalación Base
Independientemente del modo en el que vayas a trabajar (Web o Escritorio), primero debes clonar el proyecto e instalar sus dependencias:

1. Clona este repositorio en tu máquina local:
```
    git clone https://github.com/jmcm35-ua/interfaz-gestion-colas-iot.git`
```

2. Accede al directorio del proyecto:
```
    cd interfaz-gestion-colas-iot
```

3. Instala las dependencias necesarias:
```
    npm install
```

---

#### 🌐 Caso A: Modo Web (Navegador)
Utiliza este modo si vas a desarrollar y testear la aplicación directamente desde tu navegador web.

* Para ejecutar en desarrollo (la aplicación se abrirá en tu navegador, generalmente en http://localhost:4200):
```
    npm run start
```

* Para compilar para producción (el resultado compilado se generará dentro de la carpeta dist/fuse):
```
    npm run build
```
---

#### 🖥️ Caso B: Modo Escritorio (Electron)
Utiliza este modo si vas a testear el comportamiento nativo o si deseas empaquetar el instalador .exe.

* Para ejecutar en desarrollo (se abrirá una ventana nativa de escritorio ejecutando la aplicación):
```
    npm run electron
```

* Para compilar y empaquetar el instalador (el instalador final UCAFlow Setup.exe se generará dentro de la carpeta dist/):
```
    npm run package
```
---

## 🏗️ Arquitectura y Tecnologías

* **Lenguaje:** TypeScript
* **Framework Front-End:** Angular 17
* **Plantilla Base:** Fuse Angular
* **Aplicación de Escritorio:** Electron
* **Empaquetado:** Electron-Builder
* **Procesamiento Asíncrono:** Web Workers nativos
* **Gráficas y Visualización:** Chart.js
* **Almacenamiento Local:** Origin Private File System (OPFS)

---

## 👨‍💻 Créditos

**Autor:** 
 * José Manuel Cánovas Manzano

**Tutores:** 
 * José Vicente Berná Martínez
 * Lucía Arnau Muñoz

**Trabajo de Fin de Grado** Universidad de Alicante (UA)