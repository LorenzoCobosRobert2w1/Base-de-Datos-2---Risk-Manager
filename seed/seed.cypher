// =============================================================================
// SCRIPT DE CARGA — Sistema Antifraude Neo4j (V2 Enriquecida)
// =============================================================================

MATCH (n) DETACH DELETE n;

// 1. NODOS :Proveedor
CREATE (:Proveedor {nombre:"Taller San José", cuit:"30-11223344-5", cuitVerificado:true, fechaAlta:date("2018-03-10"), scoreRiesgo:0.72});
CREATE (:Proveedor {nombre:"Taller Warnes Premium", cuit:"30-71458922-9", cuitVerificado:true, fechaAlta:date("2020-07-15"), scoreRiesgo:0.94});
CREATE (:Proveedor {nombre:"Taller Norte S.A.", cuit:"30-00000000-1", cuitVerificado:true, fechaAlta:date("2015-01-20"), scoreRiesgo:0.08});
CREATE (:Proveedor {nombre:"Cristales Car-Fast", cuit:"30-99887766-2", cuitVerificado:true, fechaAlta:date("2021-02-01"), scoreRiesgo:0.15});

// 2. NODOS :IP
CREATE (:IP {address:"192.168.22.41", pais:"Argentina", ciudad:"Buenos Aires"});
CREATE (:IP {address:"200.45.100.12", pais:"Argentina", ciudad:"Córdoba"});
CREATE (:IP {address:"201.33.88.200", pais:"Argentina", ciudad:"Buenos Aires"});
CREATE (:IP {address:"181.44.10.5", pais:"Argentina", ciudad:"Rosario"});

// 3. NODOS :Usuario
CREATE (:Usuario {id:"20-33445566-9", nombreCompleto:"Mario Rossi", scoreRiesgo:0.97});
CREATE (:Usuario {id:"20-12345678-0", nombreCompleto:"Carlos Tevez", scoreRiesgo:0.88});
CREATE (:Usuario {id:"20-98765432-1", nombreCompleto:"Lionel Messi", scoreRiesgo:0.88});
CREATE (:Usuario {id:"27-55443322-9", nombreCompleto:"Sergio Aguero", scoreRiesgo:0.82});
CREATE (:Usuario {id:"20-77777777-7", nombreCompleto:"Facundo Morales", scoreRiesgo:0.75});
CREATE (:Usuario {id:"20-22222222-2", nombreCompleto:"Juan Perez", scoreRiesgo:0.05});
CREATE (:Usuario {id:"20-33333333-3", nombreCompleto:"Ana Lopez", scoreRiesgo:0.10});

// 4. NODOS :Siniestro (Nuevos casos y estados)
CREATE (:Siniestro {id:"SN-4001", monto:2500000.0, fechaReporte:datetime("2026-05-15T10:30:00"), tipoCobertura:"Destrucción Total", estado:"PENDIENTE"});
CREATE (:Siniestro {id:"SN-5001", monto:450000.0, fechaReporte:datetime("2026-03-10T11:00:00"), tipoCobertura:"Terceros", estado:"PENDIENTE"});
CREATE (:Siniestro {id:"SN-5002", monto:600000.0, fechaReporte:datetime("2026-04-05T09:15:00"), tipoCobertura:"Terceros", estado:"PENDIENTE"});
CREATE (:Siniestro {id:"SN-5003", monto:380000.0, fechaReporte:datetime("2026-05-02T14:32:00"), tipoCobertura:"Terceros", estado:"PENDIENTE"});

// Casos de historial (Liquidados/Rechazados por diferentes auditores)
CREATE (:Siniestro {id:"SN-1001", monto:120000.0, fechaReporte:datetime("2026-01-01T10:00:00"), resueltoEn:datetime("2026-01-02T15:00:00"), estado:"LIQUIDADO", analista:"Luis Andreani", justificacion:"Caso de bajo monto sin anomalías relacionales."});
CREATE (:Siniestro {id:"SN-2002", monto:850000.0, fechaReporte:datetime("2026-02-10T10:00:00"), resueltoEn:datetime("2026-02-12T09:00:00"), estado:"RECHAZADO_FRAUDE", analista:"Marta Garcia", justificacion:"Detectada IP compartida y discrepancia en peritaje."});
CREATE (:Siniestro {id:"SN-3003", monto:150000.0, fechaReporte:datetime("2026-03-01T10:00:00"), resueltoEn:datetime("2026-03-02T11:00:00"), estado:"LIQUIDADO", analista:"Juan Gomez", justificacion:"Cliente con 10 años de antigüedad, primera denuncia."});

// Casos nuevos normales
CREATE (:Siniestro {id:"SN-6001", monto:85000.0, fechaReporte:datetime("2026-06-01T14:00:00"), tipoCobertura:"Cristales", estado:"PENDIENTE"});
CREATE (:Siniestro {id:"SN-6002", monto:95000.0, fechaReporte:datetime("2026-06-02T16:00:00"), tipoCobertura:"Cristales", estado:"PENDIENTE"});

// 5. RELACIONES :REPORTO
MATCH (u:Usuario {id:"20-33445566-9"}), (s:Siniestro {id:"SN-4001"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-12345678-0"}), (s:Siniestro {id:"SN-5001"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-98765432-1"}), (s:Siniestro {id:"SN-5002"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"27-55443322-9"}), (s:Siniestro {id:"SN-5003"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-11111111-1"}), (s:Siniestro {id:"SN-1001"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-22222222-2"}), (s:Siniestro {id:"SN-2002"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-33333333-3"}), (s:Siniestro {id:"SN-3003"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-33333333-3"}), (s:Siniestro {id:"SN-6001"}) CREATE (u)-[:REPORTO]->(s);
MATCH (u:Usuario {id:"20-22222222-2"}), (s:Siniestro {id:"SN-6002"}) CREATE (u)-[:REPORTO]->(s);

// 6. RELACIONES :ASOCIADO_A
MATCH (s:Siniestro {id:"SN-4001"}), (p:Proveedor {nombre:"Taller San José"}) CREATE (s)-[:ASOCIADO_A {monto:2500000.0}]->(p);
MATCH (s:Siniestro {id:"SN-5001"}), (p:Proveedor {nombre:"Taller Warnes Premium"}) CREATE (s)-[:ASOCIADO_A {monto:450000.0}]->(p);
MATCH (s:Siniestro {id:"SN-5002"}), (p:Proveedor {nombre:"Taller Warnes Premium"}) CREATE (s)-[:ASOCIADO_A {monto:600000.0}]->(p);
MATCH (s:Siniestro {id:"SN-5003"}), (p:Proveedor {nombre:"Taller Warnes Premium"}) CREATE (s)-[:ASOCIADO_A {monto:380000.0}]->(p);
MATCH (s:Siniestro {id:"SN-1001"}), (p:Proveedor {nombre:"Taller Norte S.A."}) CREATE (s)-[:ASOCIADO_A {monto:120000.0}]->(p);
MATCH (s:Siniestro {id:"SN-2002"}), (p:Proveedor {nombre:"Taller Warnes Premium"}) CREATE (s)-[:ASOCIADO_A {monto:850000.0}]->(p);
MATCH (s:Siniestro {id:"SN-3003"}), (p:Proveedor {nombre:"Cristales Car-Fast"}) CREATE (s)-[:ASOCIADO_A {monto:150000.0}]->(p);
MATCH (s:Siniestro {id:"SN-6001"}), (p:Proveedor {nombre:"Cristales Car-Fast"}) CREATE (s)-[:ASOCIADO_A {monto:85000.0}]->(p);
MATCH (s:Siniestro {id:"SN-6002"}), (p:Proveedor {nombre:"Cristales Car-Fast"}) CREATE (s)-[:ASOCIADO_A {monto:95000.0}]->(p);

// 7. RELACIONES :ORIGINADO_DESDE
MATCH (s:Siniestro {id:"SN-5001"}), (ip:IP {address:"192.168.22.41"}) CREATE (s)-[:ORIGINADO_DESDE]->(ip);
MATCH (s:Siniestro {id:"SN-5002"}), (ip:IP {address:"192.168.22.41"}) CREATE (s)-[:ORIGINADO_DESDE]->(ip);
MATCH (s:Siniestro {id:"SN-5003"}), (ip:IP {address:"192.168.22.41"}) CREATE (s)-[:ORIGINADO_DESDE]->(ip);

// 8. RELACIONES :TRANSFERENCIA (Ciclo)
MATCH (u1:Usuario {id:"20-77777777-7"}), (u2:Usuario {id:"20-12345678-0"}) CREATE (u1)-[:TRANSFERENCIA {monto:50000.0}]->(u2);
MATCH (u1:Usuario {id:"20-12345678-0"}), (u2:Usuario {id:"27-55443322-9"}) CREATE (u1)-[:TRANSFERENCIA {monto:48000.0}]->(u2);
MATCH (u1:Usuario {id:"27-55443322-9"}), (u2:Usuario {id:"20-77777777-7"}) CREATE (u1)-[:TRANSFERENCIA {monto:46000.0}]->(u2);

// ÍNDICES
CREATE INDEX usuario_id IF NOT EXISTS FOR (u:Usuario) ON (u.id);
CREATE INDEX siniestro_id IF NOT EXISTS FOR (s:Siniestro) ON (s.id);
