const db = require('../models/db');

function registrarLog(usuario_id, usuario_nome, acao, modulo, detalhes, ip) {
  try {
    db.prepare('INSERT INTO logs (usuario_id, usuario_nome, acao, modulo, detalhes, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(usuario_id || null, usuario_nome || null, acao, modulo, detalhes || null, ip || null);
  } catch(e) { console.error('Erro ao registrar log:', e.message); }
}

module.exports = { registrarLog };
