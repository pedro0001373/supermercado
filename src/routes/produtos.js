const express = require('express');
const router = express.Router();
const db = require('../models/db');

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
router.post('/', (req, res) => {
  const {
    codigo_barras, nome, descricao, categoria_id, unidade, preco_custo, preco_venda,
    margem_lucro, estoque_atual, estoque_minimo, ncm, cst, cfop,
    icms_aliquota, pis_aliquota, cofins_aliquota, peso_liquido, usa_balanca
  } = req.body;

  if (!nome || preco_venda === undefined) {
    return res.status(400).json({ error: 'Nome e preço de venda são obrigatórios' });
  }

  const stmt = db.prepare(`
    INSERT INTO produtos (codigo_barras, nome, descricao, categoria_id, unidade, preco_custo, preco_venda,
      margem_lucro, estoque_atual, estoque_minimo, ncm, cst, cfop,
      icms_aliquota, pis_aliquota, cofins_aliquota, peso_liquido, usa_balanca)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const result = stmt.run(
      codigo_barras || null, nome, descricao || null, categoria_id || null,
      unidade || 'UN', preco_custo || 0, preco_venda,
      margem_lucro || 0, estoque_atual || 0, estoque_minimo || 0,
      ncm || null, cst || null, cfop || null,
      icms_aliquota || 0, pis_aliquota || 0, cofins_aliquota || 0,
      peso_liquido || 0, usa_balanca || 0
    );

    // Registrar movimentação inicial de estoque
    if (estoque_atual > 0) {
      db.prepare(`
        INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo)
        VALUES (?, 'entrada', ?, 0, ?, 'Estoque inicial')
      `).run(result.lastInsertRowid, estoque_atual, estoque_atual);
    }

    res.status(201).json({ id: result.lastInsertRowid, message: 'Produto criado com sucesso' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Código de barras já cadastrado' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Atualizar produto
router.put('/:id', (req, res) => {
  const {
    codigo_barras, nome, descricao, categoria_id, unidade, preco_custo, preco_venda,
    margem_lucro, estoque_minimo, ncm, cst, cfop,
    icms_aliquota, pis_aliquota, cofins_aliquota, peso_liquido, usa_balanca, ativo
  } = req.body;

  try {
    db.prepare(`
      UPDATE produtos SET
        codigo_barras = ?, nome = ?, descricao = ?, categoria_id = ?, unidade = ?,
        preco_custo = ?, preco_venda = ?, margem_lucro = ?, estoque_minimo = ?,
        ncm = ?, cst = ?, cfop = ?, icms_aliquota = ?, pis_aliquota = ?,
        cofins_aliquota = ?, peso_liquido = ?, usa_balanca = ?, ativo = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      codigo_barras, nome, descricao, categoria_id, unidade,
      preco_custo, preco_venda, margem_lucro, estoque_minimo,
      ncm, cst, cfop, icms_aliquota, pis_aliquota,
      cofins_aliquota, peso_liquido, usa_balanca, ativo !== undefined ? ativo : 1,
      req.params.id
    );
    res.json({ message: 'Produto atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar produto (soft delete)
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE produtos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Produto desativado com sucesso' });
});

module.exports = router;
