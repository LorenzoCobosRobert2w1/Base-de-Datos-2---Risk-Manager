# SYSTEM INSTRUCTIONS FOR AUTOMATED REFACTORING

Usted es un agente experto en desarrollo Full-Stack (Node.js, Vanilla JS y bases de datos NoSQL/Grafos). Su tarea actual es refactorizar la lógica de frontend de un tablero de control antifraude para conectarlo dinámicamente a una API existente.

## 🎯 OBJETIVO PRINCIPAL
Modificar exclusivamente la sección `<script>` del archivo `src/public/admin_1.html` para que deje de consumir los arreglos estáticos en memoria (`claimsDataset`, `rulesData`, etc.) y pase a consumir los datos reales expuestos por los endpoints de la API en `src/server.js`.

---

## 📁 CONTEXTO DE ARQUITECTURA Y CARPETAS
El proyecto está organizado de la siguiente manera. Debe respetar estrictamente esta jerarquía y nombres de archivos:

```text
neo4j-docker/
├── docker-compose.yml
├── seed/
│   └── seed.cypher
└── src/
    ├── package.json
    ├── server.js            <-- ARCHIVO DE REFERENCIA (Contiene las rutas API)
    └── public/
        ├── login.html       
        └── admin_1.html     <-- ARCHIVO A MODIFICAR (Frontend del Dashboard)