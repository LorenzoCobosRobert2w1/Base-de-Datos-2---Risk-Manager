# AntiFraud Graph Console — Neo4j Engine

Sistema de gestión de riesgos y detección de fraudes relacionales para compañías de seguros, impulsado por una base de datos de grafos **Neo4j** y un motor de reglas dinámico.

![Dashboard Preview](https://img.shields.io/badge/Status-Functional-brightgreen)
![Neo4j](https://img.shields.io/badge/Neo4j-5.20-blue)
![Node.js](https://img.shields.io/badge/Node.js-Express-green)

## 🚀 Arquitectura del Proyecto

Este sistema utiliza una arquitectura moderna para el análisis relacional:
*   **Base de Datos**: Neo4j (Docker) para el almacenamiento de nodos y relaciones.
*   **Backend**: Node.js + Express actuando como middleware Bolt.
*   **Frontend**: Interfaz administrativa Vanilla JS con visualización dinámica de grafos SVG y Chart.js.

---

## 📂 ¿Cuál es el archivo principal?

Existen varios archivos HTML en la carpeta `public`, pero el que estamos utilizando activamente y el cual contiene todas las mejoras solicitadas es:

👉 **`src/public/admin.html`**

Este archivo es el que el servidor sirve automáticamente cuando entras a `http://localhost:3000`. Los demás (`admin_Harcodeado.html`, `admin_1.html`) son versiones previas o de referencia que puedes ignorar o borrar.

---

## 🛠️ Instalación y Configuración

### 1. Requisitos Previos
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado.
*   [Node.js](https://nodejs.org/) (v16 o superior).

### 2. Levantar la Infraestructura (Docker)
Desde la raíz del proyecto, ejecuta:
```powershell
docker compose up -d
```
Esto iniciará el contenedor de Neo4j en el puerto `7474` (HTTP) y `7687` (Bolt).

### 3. Poblar la Base de Datos (Seed)
Carga el escenario de prueba enriquecido con el motor de reglas:
```powershell
Get-Content seed/seed.cypher | docker exec -i antifraude-neo4j cypher-shell -u neo4j -p antifraude123
```

### 4. Iniciar el Servidor Web
Entra en la carpeta `src`, instala las dependencias y arranca:
```powershell
cd src
npm install
npm start
```

---

## 🔍 Funcionalidades Clave

*   **Dashboard Global**: Estadísticas de fondos retenidos, liquidados y tasa de fraude en tiempo real.
*   **Centro de Investigación**: Cola de auditoría con filtros avanzados por fecha, monto, riesgo, taller y asegurado.
*   **Motor Antifraude (6 Reglas BR)**:
    *   **BR-01**: Monto Crítico (> $1M).
    *   **BR-02**: Colusión de Taller (Múltiples usuarios en el mismo taller).
    *   **BR-03**: Anillos de Dinero (Detección de ciclos de transferencias).
    *   **BR-04**: Alta Frecuencia de Siniestros por usuario.
    *   **BR-05**: IP Compartida entre distintos asegurados.
    *   **BR-06**: Riesgo de Proveedor (Verificación de CUIT y score).
*   **Historial Trazable**: Registro de todas las decisiones tomadas por los analistas con búsqueda avanzada.
*   **Seguridad**: El motor de reglas es de "Solo Lectura" para usuarios no administradores.

---

## 📊 Acceso a las Interfaces

*   **Aplicación Web**: [http://localhost:3000](http://localhost:3000)
*   **Neo4j Browser**: [http://localhost:7474](http://localhost:7474) (Credenciales: `neo4j` / `antifraude123`)


