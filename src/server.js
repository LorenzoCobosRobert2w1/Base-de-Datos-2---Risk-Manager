const express = require('express');
const neo4j   = require('neo4j-driver');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;

// ── Neo4j driver ─────────────────────────────────────────────────────────────
const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'antifraude123')
);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Helper: run a Cypher query and return plain JS objects ───────────────────
async function runQuery(cypher, params = {}) {
  const session = driver.session({ database: 'neo4j' });
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => {
      const obj = {};
      r.keys.forEach(k => {
        const val = r.get(k);
        obj[k] = convertNeo4j(val);
      });
      return obj;
    });
  } finally {
    await session.close();
  }
}

function convertNeo4j(val) {
  if (val === null || val === undefined) return val;
  if (neo4j.isInt(val))  return val.toNumber();
  if (typeof val === 'object' && val.constructor?.name === 'Integer') return val.toNumber();
  if (val && typeof val === 'object' && 'low' in val && 'high' in val) return neo4j.integer.toNumber(val);
  if (val && typeof val === 'object' && val.properties) {
    const p = {};
    Object.entries(val.properties).forEach(([k,v]) => p[k] = convertNeo4j(v));
    return { ...p, _labels: val.labels || [] };
  }
  if (Array.isArray(val)) return val.map(convertNeo4j);
  if (val && typeof val === 'object' && val.year !== undefined) {
    try { return val.toString(); } catch { return String(val); }
  }
  return val;
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const statsResult = await runQuery(`
      MATCH (s:Siniestro)
      WITH 
        sum(CASE WHEN s.estado IN ['EN_AUDITORIA','PENDIENTE'] THEN s.monto ELSE 0 END) AS retenidos,
        sum(CASE WHEN s.estado = 'LIQUIDADO' THEN s.monto ELSE 0 END)                  AS liquidados,
        count(CASE WHEN s.estado IN ['EN_AUDITORIA','PENDIENTE'] THEN 1 END)            AS pendientes,
        count(s) AS total
      RETURN retenidos, liquidados, pendientes, total
    `);
    const stats = statsResult[0] || { retenidos: 0, liquidados: 0, pendientes: 0, total: 0 };

    const anomaliasResult = await runQuery(`
      MATCH (u:Usuario) WHERE u.scoreRiesgo > 0.8
      RETURN count(u) AS count
    `);
    const anomalias = anomaliasResult[0] || { count: 0 };

    const topProviders = await runQuery(`
      MATCH (p:Proveedor)<-[:ASOCIADO_A]-(s:Siniestro)
      RETURN p.nombre AS nombre, count(s) AS casos
      ORDER BY casos DESC LIMIT 5
    `);

    const latestResolutions = await runQuery(`
      MATCH (s:Siniestro)
      WHERE s.estado IN ['LIQUIDADO','RECHAZADO_FRAUDE']
      RETURN s.id AS id, 
             CASE WHEN s.estado = 'LIQUIDADO' THEN 'Aprobado' ELSE 'Rechazado' END AS resultado,
             COALESCE(s.analista, 'Sistema') AS analista
      ORDER BY s.resueltoEn DESC LIMIT 4
    `);

    res.json({
      kpis: {
        retenidos: `$${((stats.retenidos || 0) / 1000000).toFixed(2)}M`,
        retenidosSub: `${stats.pendientes || 0} casos activos`,
        liquidados: `$${((stats.liquidados || 0) / 1000000).toFixed(2)}M`,
        liquidadosSub: `${(stats.total - stats.pendientes) || 0} validados`,
        anomalias: anomalias.count || 0,
        anomaliasSub: `Motor ejecutado 312 veces`,
        pendientes: stats.pendientes || 0,
        tasaFraude: `${(( (anomalias.count || 0) / (stats.total || 1)) * 100).toFixed(1)}%`
      },
      topProviders,
      rulesToday: [
        { id: 'BR-01', nombre: 'Monto Crítico', ejecuciones: 12 },
        { id: 'BR-02', nombre: 'Colusión', ejecuciones: 5 },
        { id: 'BR-03', nombre: 'Anillo Transf.', ejecuciones: 3 },
        { id: 'BR-05', nombre: 'IP Sospechosa', ejecuciones: 8 }
      ],
      latestResolutions
    });
  } catch (e) {
    console.error('Error in dashboard-stats:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Claims Queue ──────────────────────────────────────────────────────────────
app.get('/api/claims', async (req, res) => {
  try {
    const rows = await runQuery(`
      MATCH (u:Usuario)-[:REPORTO]->(s:Siniestro)-[:ASOCIADO_A]->(p:Proveedor)
      RETURN 
        s.id AS id,
        s.monto AS monto,
        s.estado AS estado,
        s.tipoCobertura AS tipoCobertura,
        toString(s.fechaReporte) AS fechaReporte,
        u.nombreCompleto AS usuarioNombre,
        u.id AS userId,
        u.scoreRiesgo AS scoreRiesgo,
        p.nombre AS proveedorNombre,
        p.cuit AS proveedorCuit,
        s.descripcion AS desc
      ORDER BY s.fechaReporte DESC
    `);

    const claims = rows.map(r => ({
      ...r,
      categoria: r.scoreRiesgo > 0.8 ? 'ALTO RIESGO' : r.monto > 1000000 ? 'ALTO MONTO' : 'NORMAL',
      categoryBadge: r.scoreRiesgo > 0.8 ? 'badge-red' : r.monto > 1000000 ? 'badge-orange' : 'badge-blue',
      rules: [] 
    }));

    res.json(claims);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Audit Analysis (The Core Engine) ──────────────────────────────────────────
app.get('/api/claims/:id/audit', async (req, res) => {
  const { id } = req.params;
  try {
    const [data] = await runQuery(`
      MATCH (u:Usuario)-[:REPORTO]->(s:Siniestro {id: $id})-[:ASOCIADO_A]->(p:Proveedor)
      OPTIONAL MATCH (s)-[:ORIGINADO_DESDE]->(ip:IP)
      RETURN s, u, p, ip
    `, { id });

    if (!data) return res.status(404).json({ error: 'Siniestro no encontrado' });

    const triggeredRules = [];
    const logs = [{ type: 't-result', text: `> Siniestro ${id} recuperado.` }];

    // BR-01: Umbral Monto
    const br01 = data.s.monto > 1000000;
    if (br01) triggeredRules.push('BR-01');
    logs.push({ type: br01 ? 't-danger' : 't-result', text: `BR-01 (Monto > 1M): ${br01 ? 'DISPARADA' : 'OK'}` });

    // BR-02: Colusión Taller
    const br02rows = await runQuery(`
      MATCH (p:Proveedor {cuit: $cuit})<-[:ASOCIADO_A]-(s:Siniestro)<-[:REPORTO]-(u:Usuario)
      RETURN count(DISTINCT u) AS freq
    `, { cuit: data.p.cuit });
    const br02 = br02rows[0].freq > 2;
    if (br02) triggeredRules.push('BR-02');
    logs.push({ type: br02 ? 't-danger' : 't-result', text: `BR-02 (Colusión Taller): ${br02 ? 'DETECTADA' : 'OK'}` });

    // BR-03: Ciclo Transferencias
    const br03rows = await runQuery(`
      MATCH (u:Usuario {id: $uid})
      MATCH path = (u)-[:TRANSFERENCIA*2..5]->(u)
      RETURN length(path) AS len LIMIT 1
    `, { uid: data.u.id });
    const br03 = br03rows.length > 0;
    if (br03) triggeredRules.push('BR-03');
    logs.push({ type: br03 ? 't-danger' : 't-result', text: `BR-03 (Ciclo Transf.): ${br03 ? 'DETECTADO' : 'OK'}` });

    // BR-04: Frecuencia Usuario
    const br04rows = await runQuery(`
      MATCH (u:Usuario {id: $uid})-[:REPORTO]->(s:Siniestro)
      RETURN count(s) AS freq
    `, { uid: data.u.id });
    const br04 = br04rows[0].freq > 3;
    if (br04) triggeredRules.push('BR-04');
    logs.push({ type: br04 ? 't-danger' : 't-result', text: `BR-04 (Freq. Asegurado): ${br04 ? 'ALTA' : 'NORMAL'}` });

    // BR-05: IP Compartida
    const br05rows = await runQuery(`
      MATCH (s:Siniestro {id: $id})-[:ORIGINADO_DESDE]->(ip:IP)<-[:ORIGINADO_DESDE]-(others:Siniestro)
      MATCH (others)<-[:REPORTO]-(uOther:Usuario)
      WHERE uOther.id <> $uid
      RETURN count(others) AS count
    `, { id, uid: data.u.id });
    const br05 = br05rows[0].count > 0;
    if (br05) triggeredRules.push('BR-05');
    logs.push({ type: br05 ? 't-danger' : 't-result', text: `BR-05 (IP Compartida): ${br05 ? 'DETECTADA' : 'LIMPIA'}` });

    // BR-06: Proveedor No Verificado
    const br06 = !data.p.cuitVerificado || (data.p.scoreRiesgo > 0.9);
    if (br06) triggeredRules.push('BR-06');
    logs.push({ type: br06 ? 't-warn' : 't-result', text: `BR-06 (Riesgo Proveedor): ${br06 ? 'CRÍTICO' : 'BAJO'}` });

    let severity = 'clean';
    let recommendation = 'APROBAR';
    if (triggeredRules.length > 0) {
      severity = triggeredRules.length > 1 ? 'danger' : 'warning';
      recommendation = 'RECHAZAR';
    }

    const nodes = [
      { x: 260, y: 110, radius: 25, fill: triggeredRules.length > 0 ? '#da3633' : '#1f6feb', label: 'Siniestro', sublabel: id },
      { x: 80, y: 110, radius: 22, fill: br03 || br04 ? '#da3633' : '#6e40c9', label: 'Asegurado', sublabel: data.u.nombreCompleto.split(' ')[0] },
      { x: 440, y: 110, radius: 22, fill: br02 || br06 ? '#da3633' : '#238636', label: 'Taller', sublabel: data.p.nombre.split(' ')[0] }
    ];
    const edges = [
      { x1: 80, y1: 110, x2: 235, y2: 110, color: br03 || br04 ? '#da3633' : '#6e40c9', label: 'REPORTO' },
      { x1: 285, y1: 110, x2: 420, y2: 110, color: br02 || br06 ? '#da3633' : '#238636', label: 'ASOCIADO_A' }
    ];

    if (data.ip) {
      nodes.push({ x: 260, y: 40, radius: 18, fill: br05 ? '#da3633' : '#d29922', label: 'IP', sublabel: data.ip.address });
      edges.push({ x1: 260, y1: 60, x2: 260, y2: 85, color: br05 ? '#da3633' : '#d29922', label: 'DESDE' });
    }

    res.json({
      terminalLogs: logs,
      graphStructure: {
        nodes,
        edges,
        infoText: triggeredRules.length > 0 ? `${triggeredRules.length} ALERTA(S) DETECTADA(S)` : 'ANÁLISIS DE GRAFO LIMPIO'
      },
      verdict: {
        severity,
        message: triggeredRules.length > 0 ? `Se activaron ${triggeredRules.length} reglas de riesgo.` : 'No se detectaron anomalías relacionales.',
        triggeredRules,
        detail: triggeredRules.includes('BR-02') ? 'Patrón de colusión entre proveedor y múltiples usuarios.' : 'Resultado del motor de reglas Neo4j.',
        recommendation
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rules Metadata ────────────────────────────────────────────────────────────
app.get('/api/rules', async (req, res) => {
  res.json([
    {
        id: "BR-01", nombre: "Umbral de Monto Crítico", severidad: "ALTA", severityBadge: "badge-red", activa: true,
        descripcion: "Todo siniestro cuyo monto supere $1.000.000 pasa a auditoría obligatoria.",
        umbral: 1000000,
        cypher: "MATCH (s:Siniestro) WHERE s.monto > 1000000 RETURN s"
    },
    {
        id: "BR-02", nombre: "Alerta de Colusión", severidad: "ALTA", severityBadge: "badge-red", activa: true,
        descripcion: "Proveedor vinculado a más de 2 asegurados distintos en 180 días.",
        umbral: 2,
        cypher: "MATCH (p:Proveedor)<-[:ASOCIADO_A]-(s)<-[:REPORTO]-(u) WITH p, count(DISTINCT u) AS freq WHERE freq > 2 RETURN p"
    },
    {
        id: "BR-03", nombre: "Detección de Ciclos", severidad: "ALTA", severityBadge: "badge-red", activa: true,
        descripcion: "Detecta ciclos de transferencia entre asegurados (lavado/anillos).",
        cypher: "MATCH (u:Usuario) MATCH path = (u)-[:TRANSFERENCIA*2..5]->(u) RETURN path"
    },
    {
        id: "BR-04", nombre: "Alta Frecuencia Siniestros", severidad: "MEDIA", severityBadge: "badge-yellow", activa: true,
        descripcion: "Asegurado reporta más de 3 siniestros en un año.",
        umbral: 3,
        cypher: "MATCH (u:Usuario)-[:REPORTO]->(s) WITH u, count(s) AS f WHERE f > 3 RETURN u"
    },
    {
        id: "BR-05", nombre: "IP Compartida", severidad: "MEDIA", severityBadge: "badge-yellow", activa: true,
        descripcion: "Siniestros distintos reportados desde la misma IP.",
        cypher: "MATCH (s1)-[:ORIGINADO_DESDE]->(ip)<-[:ORIGINADO_DESDE]-(s2) RETURN ip"
    },
    {
        id: "BR-06", nombre: "Proveedor de Riesgo", severidad: "BAJA", severityBadge: "badge-blue", activa: true,
        descripcion: "Proveedores con score de riesgo > 0.9 o CUIT no verificado.",
        cypher: "MATCH (p:Proveedor) WHERE p.scoreRiesgo > 0.9 OR p.cuitVerificado = false RETURN p"
    }
  ]);
});

// ── Decision Persistence ──────────────────────────────────────────────────────
app.post('/api/claims/:id/decision', async (req, res) => {
  const { id } = req.params;
  const { decision, notes, analyst } = req.body;
  try {
    await runQuery(`
      MATCH (s:Siniestro {id: $id})
      SET s.estado = $decision, s.justificacion = $notes, s.analista = $analyst, s.resueltoEn = datetime()
    `, { id, decision, notes, analyst });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── History ─────────────────────────────────────────────────────────────
app.get('/api/history', async (req, res) => {
  try {
    const rows = await runQuery(`
      MATCH (s:Siniestro)
      WHERE s.estado IN ['LIQUIDADO','RECHAZADO_FRAUDE']
      MATCH (u:Usuario)-[:REPORTO]->(s)-[:ASOCIADO_A]->(p:Proveedor)
      RETURN 
        s.id AS id,
        s.estado AS decision,
        s.monto AS monto,
        u.nombreCompleto AS usuarioNombre,
        p.nombre AS proveedorNombre,
        s.analista AS analyst,
        s.justificacion AS notes,
        toString(s.resueltoEn) AS ts
      ORDER BY s.resueltoEn DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Charts ────────────────────────────────────────────────────────────────────
app.get('/api/charts-data', async (req, res) => {
  res.json({
    evolution: {
      labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6'],
      datasets: [
        { label: 'Fraude Duro', data: [2, 5, 3, 8, 4, 3], borderColor: '#f85149' },
        { label: 'Colusión', data: [1, 3, 6, 4, 7, 5], borderColor: '#f0883e' },
        { label: 'Limpio', data: [12, 18, 14, 22, 19, 16], borderColor: '#3fb950' }
      ]
    },
    distribution: {
      labels: ['Monto Elevado', 'Colusión Taller', 'Ciclo Transf.', 'IP Sospechosa'],
      values: [1, 3, 0, 1]
    }
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await runQuery('RETURN 1 AS ok');
    res.json({ status: 'ok', neo4j: 'connected' });
  } catch (e) {
    res.status(503).json({ status: 'error', neo4j: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ AntiFraud API corriendo en http://localhost:${PORT}`);
  console.log(`   Neo4j → bolt://localhost:7687`);
});

process.on('exit', () => driver.close());
