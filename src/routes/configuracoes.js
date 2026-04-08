const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Listar todas as configurações
router.get('/', (req, res) => {
  const configs = db.prepare(`SELECT * FROM configuracoes ORDER BY chave`).all();
  const obj = {};
  for (const c of configs) obj[c.chave] = c.valor;
  res.json(obj);
});

// Atualizar configurações
router.put('/', (req, res) => {
  const configs = req.body;
  const stmt = db.prepare(`UPDATE configuracoes SET valor = ? WHERE chave = ?`);
  const transaction = db.transaction(() => {
    for (const [chave, valor] of Object.entries(configs)) {
      stmt.run(valor, chave);
    }
  });
  transaction();
  res.json({ message: 'Configurações atualizadas' });
});

module.exports = router;
