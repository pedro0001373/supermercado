const express = require('express');
const router = express.Router();
const db = require('../models/db');
const v = require('../middleware/validators');

// Listar todos os produtos
router.get('/', (req, res) => {
  const { busca, categoria_id, ativo, page = 1, limit = 50 } = req.query;
  let sql = `SELECT p.*, c.nome as categoria_nome FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1`;
  const params = [];

  if (busca) {
    sql += ` AND (p.nome LIKE ? OR p.codigo_barras LIKE ?)`;
    params.push(`%${busca}%`, `%${busca}%`);
  }
  if (categoria_id) {
    sql += ` AND p.categoria_id = ?`;
    params.push(categoria_id);
  }
  if (ativo !== undefined) {
    sql += ` AND p.ativo = ?`;
    params.push(ativo);
  }

  // Contagem total
  const countSql = sql.replace('SELECT p.*, c.nome as categoria_nome', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ` ORDER BY p.nome ASC LIMIT ? OFFSET ?`;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const produtos = db.prepare(sql).all(...params);
  res.json({ produtos, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

// Buscar produto por código de barras (para PDV)
router.get('/barcode/:codigo', (req, res) => {
  const produto = db.prepare(`SELECT * FROM produtos WHERE codigo_barras = ? AND ativo = 1`).get(req.params.codigo);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(produto);
});

// Buscar produto por ID
router.get('/:id', (req, res) => {
  const produto = db.prepare(`SELECT p.*, c.nome as categoria_nome FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?`).get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  res.json(produto);
});

// Criar produto
router.post('/', (req, res, next) => {
  try {
    v.req(req.body, ['nome', 'preco_venda']);
    v.strLen(req.body.nome, 'nome', 2, 200);
    v.strLen(req.body.codigo_barras, 'codigo_barras', null, 60);
    const precoVenda = v.num(req.body.preco_venda, 'preco_venda', { obrigatorio: true, min: 0 });
    const precoCusto = v.num(req.body.preco_custo, 'preco_custo', { min: 0 }) || 0;
    const margem = v.num(req.body.margem_lucro, 'margem_lucro', { min: 0 }) || 0;
    const estoqueAtual = v.num(req.body.estoque_atual, 'estoque_atual', { min: 0 }) || 0;
    const estoqueMin = v.num(req.body.estoque_minimo, 'estoque_minimo', { min: 0 }) || 0;
    const pesoLiq = v.num(req.body.peso_liquido, 'peso_liquido', { min: 0 }) || 0;

    const b = req.body;
    const result = db.prepare(`
      INSERT INTO produtos (codigo_barras, nome, descricao, categoria_id, unidade, preco_custo, preco_venda,
        margem_lucro, estoque_atual, estoque_minimo, ncm, cst, cfop,
        icms_aliquota, pis_aliquota, cofins_aliquota, peso_liquido, usa_balanca)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.codigo_barras || null, b.nome.trim(), b.descricao || null, b.categoria_id || null,
      b.unidade || 'UN', precoCusto, precoVenda,
      margem, estoqueAtual, estoqueMin,
      b.ncm || null, b.cst || null, b.cfop || null,
      Number(b.icms_aliquota) || 0, Number(b.pis_aliquota) || 0, Number(b.cofins_aliquota) || 0,
      pesoLiq, b.usa_balanca ? 1 : 0
    );

    if (estoqueAtual > 0) {
      db.prepare(`
        INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo)
        VALUES (?, 'entrada', ?, 0, ?, 'Estoque inicial')
      `).run(result.lastInsertRowid, estoqueAtual, estoqueAtual);
    }

    res.status(201).json({ id: result.lastInsertRowid, message: 'Produto criado com sucesso' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Codigo de barras ja cadastrado' });
    }
    next(err);
  }
});

// Atualizar produto
router.put('/:id', (req, res, next) => {
  try {
    v.req(req.body, ['nome', 'preco_venda']);
    v.strLen(req.body.nome, 'nome', 2, 200);
    v.strLen(req.body.codigo_barras, 'codigo_barras', null, 60);
    const precoVenda = v.num(req.body.preco_venda, 'preco_venda', { obrigatorio: true, min: 0 });
    const precoCusto = v.num(req.body.preco_custo, 'preco_custo', { min: 0 }) || 0;
    const margem = v.num(req.body.margem_lucro, 'margem_lucro', { min: 0 }) || 0;
    const estoqueMin = v.num(req.body.estoque_minimo, 'estoque_minimo', { min: 0 }) || 0;
    const pesoLiq = v.num(req.body.peso_liquido, 'peso_liquido', { min: 0 }) || 0;
    const b = req.body;

    db.prepare(`
      UPDATE produtos SET
        codigo_barras = ?, nome = ?, descricao = ?, categoria_id = ?, unidade = ?,
        preco_custo = ?, preco_venda = ?, margem_lucro = ?, estoque_minimo = ?,
        ncm = ?, cst = ?, cfop = ?, icms_aliquota = ?, pis_aliquota = ?,
        cofins_aliquota = ?, peso_liquido = ?, usa_balanca = ?, ativo = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      b.codigo_barras || null, b.nome.trim(), b.descricao || null, b.categoria_id || null, b.unidade || 'UN',
      precoCusto, precoVenda, margem, estoqueMin,
      b.ncm || null, b.cst || null, b.cfop || null,
      Number(b.icms_aliquota) || 0, Number(b.pis_aliquota) || 0,
      Number(b.cofins_aliquota) || 0, pesoLiq, b.usa_balanca ? 1 : 0, b.ativo !== undefined ? (b.ativo ? 1 : 0) : 1,
      req.params.id
    );
    res.json({ message: 'Produto atualizado com sucesso' });
  } catch (err) {
    next(err);
  }
});

// Deletar produto (soft delete)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE produtos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Produto desativado com sucesso' });
});

module.exports = router;
