const express = require('express');
const router = express.Router();
const db = require('../models/db');
const cache = require('../utils/cache');

const CACHE_KEY = 'configuracoes:all';
const TTL = 300;

router.get('/', (req, res) => {
  const obj = cache.wrap(CACHE_KEY, TTL, () => {
    const configs = db.prepare(`SELECT * FROM configuracoes ORDER BY chave`).all();
    const o = {};
    for (const c of configs) o[c.chave] = c.valor;
    return o;
  });
  res.json(obj);
});

router.put('/', (req, res) => {
  const configs = req.body;
  const stmt = db.prepare(`UPDATE configuracoes SET valor = ? WHERE chave = ?`);
  const transaction = db.transaction(() => {
    for (const [chave, valor] of Object.entries(configs)) {
      stmt.run(valor, chave);
    }
  });
  transaction();
  cache.del(CACHE_KEY);
  res.json({ message: 'Configuracoes atualizadas' });
});

module.exports = router;
