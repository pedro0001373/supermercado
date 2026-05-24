const express = require('express');
const router = express.Router();
const db = require('../models/db');
const v = require('../middleware/validators');

router.get('/', (req, res) => {
  const { busca } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  let where = `WHERE ativo = 1`;
  const params = [];
  if (busca) {
    where += ` AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)`;
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM fornecedores ` + where).get(...params).c;
  const fornecedores = db.prepare(`SELECT * FROM fornecedores ` + where + ` ORDER BY razao_social LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ fornecedores, total, page, pages: Math.ceil(total / limit) || 1 });
});

router.get('/:id', (req, res) => {
  const fornecedor = db.prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(req.params.id);
  if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  res.json(fornecedor);
});

router.post('/', (req, res, next) => {
  try {
    v.req(req.body, ['razao_social']);
    v.strLen(req.body.razao_social, 'razao_social', 2, 200);
    v.strLen(req.body.nome_fantasia, 'nome_fantasia', null, 200);
    const cnpjLimpo = v.cnpj(req.body.cnpj, 'cnpj');
    const emailNorm = v.email(req.body.email, 'email');
    if (req.body.uf) v.strLen(req.body.uf, 'uf', 2, 2);

    const b = req.body;
    const result = db.prepare(`
      INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.razao_social.trim(), b.nome_fantasia || null, cnpjLimpo, b.ie || null, b.endereco || null, b.cidade || null, b.uf || null, b.cep || null, b.telefone || null, emailNorm, b.contato || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Fornecedor criado' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'CNPJ ja cadastrado' });
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    v.req(req.body, ['razao_social']);
    v.strLen(req.body.razao_social, 'razao_social', 2, 200);
    v.strLen(req.body.nome_fantasia, 'nome_fantasia', null, 200);
    const cnpjLimpo = v.cnpj(req.body.cnpj, 'cnpj');
    const emailNorm = v.email(req.body.email, 'email');
    if (req.body.uf) v.strLen(req.body.uf, 'uf', 2, 2);

    const b = req.body;
    db.prepare(`
      UPDATE fornecedores SET razao_social=?, nome_fantasia=?, cnpj=?, ie=?, endereco=?, cidade=?, uf=?, cep=?, telefone=?, email=?, contato=?, atualizado_em=CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(b.razao_social.trim(), b.nome_fantasia || null, cnpjLimpo, b.ie || null, b.endereco || null, b.cidade || null, b.uf || null, b.cep || null, b.telefone || null, emailNorm, b.contato || null, req.params.id);
    res.json({ message: 'Fornecedor atualizado' });
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE fornecedores SET ativo = 0 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Fornecedor desativado' });
});

module.exports = router;
