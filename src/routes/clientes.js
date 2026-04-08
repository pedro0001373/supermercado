const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Buscar cliente por CPF ou nome
router.get('/buscar', (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo) return res.json([]);
    const clientes = db.prepare(
      `SELECT * FROM clientes WHERE ativo = 1 AND (cpf LIKE ? OR nome LIKE ?) ORDER BY nome LIMIT 10`
    ).all('%' + termo + '%', '%' + termo + '%');
    res.json(clientes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar clientes
router.get('/', (req, res) => {
  try {
    const clientes = db.prepare('SELECT * FROM clientes ORDER BY nome').all();
    res.json(clientes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Buscar cliente por ID
router.get('/:id', (req, res) => {
  try {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente nao encontrado' });
    // Buscar historico de compras
    const compras = db.prepare(
      `SELECT v.id, v.numero_venda, v.total, v.desconto, v.criado_em, v.status
       FROM vendas v WHERE v.cliente_id = ? ORDER BY v.criado_em DESC LIMIT 20`
    ).all(req.params.id);
    res.json({ ...cliente, compras });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar cliente
router.post('/', (req, res) => {
  try {
    const { nome, cpf, telefone, email } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome e obrigatorio' });
    const result = db.prepare('INSERT INTO clientes (nome, cpf, telefone, email) VALUES (?, ?, ?, ?)')
      .run(nome, cpf || null, telefone || null, email || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Cliente cadastrado' });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'CPF ja cadastrado' });
    res.status(500).json({ error: e.message });
  }
});

// Atualizar cliente
router.put('/:id', (req, res) => {
  try {
    const { nome, cpf, telefone, email, ativo } = req.body;
    db.prepare('UPDATE clientes SET nome=?, cpf=?, telefone=?, email=?, ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?')
      .run(nome, cpf || null, telefone || null, email || null, ativo !== undefined ? ativo : 1, req.params.id);
    res.json({ message: 'Cliente atualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
