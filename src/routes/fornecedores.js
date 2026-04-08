const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/', (req, res) => {
  const { busca } = req.query;
  let sql = `SELECT * FROM fornecedores WHERE ativo = 1`;
  const params = [];
  if (busca) {
    sql += ` AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)`;
    params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  sql += ` ORDER BY razao_social`;
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const fornecedor = db.prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(req.params.id);
  if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  res.json(fornecedor);
});

router.post('/', (req, res) => {
  const { razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato } = req.body;
  if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });

  try {
    const result = db.prepare(`
      INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Fornecedor criado' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'CNPJ já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato } = req.body;
  db.prepare(`
    UPDATE fornecedores SET razao_social=?, nome_fantasia=?, cnpj=?, ie=?, endereco=?, cidade=?, uf=?, cep=?, telefone=?, email=?, contato=?, atualizado_em=CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf, cep, telefone, email, contato, req.params.id);
  res.json({ message: 'Fornecedor atualizado' });
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE fornecedores SET ativo = 0 WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Fornecedor desativado' });
});

module.exports = router;
