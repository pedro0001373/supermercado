const express = require('express');
const router = express.Router();
const db = require('../models/db');
const cache = require('../utils/cache');

const CACHE_KEY = 'categorias:ativas';
const TTL = 300;

router.get('/', (req, res) => {
  const categorias = cache.wrap(CACHE_KEY, TTL, () =>
    db.prepare(`SELECT * FROM categorias WHERE ativo = 1 ORDER BY nome`).all()
  );
  res.json(categorias);
});

router.post('/', (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome e obrigatorio' });
  try {
    const result = db.prepare(`INSERT INTO categorias (nome, descricao) VALUES (?, ?)`).run(nome, descricao || null);
    cache.del(CACHE_KEY);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Categoria criada' });
  } catch (err) {
    res.status(400).json({ error: 'Categoria ja existe' });
  }
});

router.put('/:id', (req, res) => {
  const { nome, descricao } = req.body;
  db.prepare(`UPDATE categorias SET nome = ?, descricao = ? WHERE id = ?`).run(nome, descricao, req.params.id);
  cache.del(CACHE_KEY);
  res.json({ message: 'Categoria atualizada' });
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE categorias SET ativo = 0 WHERE id = ?`).run(req.params.id);
  cache.del(CACHE_KEY);
  res.json({ message: 'Categoria desativada' });
});

module.exports = router;
