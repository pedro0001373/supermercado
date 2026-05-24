const express = require('express');
const router = express.Router();
const db = require('../models/db');
const v = require('../middleware/validators');

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

router.get('/', (req, res) => {
  try {
    const { busca, ativo } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    let where = 'WHERE 1=1';
    const params = [];
    if (busca) { where += ' AND (nome LIKE ? OR cpf LIKE ?)'; params.push('%' + busca + '%', '%' + busca + '%'); }
    if (ativo !== undefined) { where += ' AND ativo = ?'; params.push(ativo); }
    const total = db.prepare('SELECT COUNT(*) as c FROM clientes ' + where).get(...params).c;
    const clientes = db.prepare('SELECT * FROM clientes ' + where + ' ORDER BY nome LIMIT ? OFFSET ?')
      .all(...params, limit, (page - 1) * limit);
    res.json({ clientes, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente nao encontrado' });
    const compras = db.prepare(
      `SELECT v.id, v.numero_venda, v.total, v.desconto, v.criado_em, v.status
       FROM vendas v WHERE v.cliente_id = ? ORDER BY v.criado_em DESC LIMIT 20`
    ).all(req.params.id);
    res.json({ ...cliente, compras });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res, next) => {
  try {
    v.req(req.body, ['nome']);
    v.strLen(req.body.nome, 'nome', 2, 120);
    const cpfLimpo = v.cpf(req.body.cpf, 'cpf');
    const emailNorm = v.email(req.body.email, 'email');
    v.strLen(req.body.telefone, 'telefone', null, 20);

    const result = db.prepare('INSERT INTO clientes (nome, cpf, telefone, email) VALUES (?, ?, ?, ?)')
      .run(req.body.nome.trim(), cpfLimpo, req.body.telefone || null, emailNorm);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Cliente cadastrado' });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'CPF ja cadastrado' });
    next(e);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    v.req(req.body, ['nome']);
    v.strLen(req.body.nome, 'nome', 2, 120);
    const cpfLimpo = v.cpf(req.body.cpf, 'cpf');
    const emailNorm = v.email(req.body.email, 'email');
    v.strLen(req.body.telefone, 'telefone', null, 20);
    const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : 1;

    db.prepare('UPDATE clientes SET nome=?, cpf=?, telefone=?, email=?, ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?')
      .run(req.body.nome.trim(), cpfLimpo, req.body.telefone || null, emailNorm, ativo, req.params.id);
    res.json({ message: 'Cliente atualizado' });
  } catch (e) { next(e); }
});

module.exports = router;
