const express = require('express');
const router = express.Router();
const db = require('../models/db');
const multer = require('multer');
const xml2js = require('xml2js');
const path = require('path');
const fs = require('fs');

// Upload de XML
const upload = multer({ dest: path.join(__dirname, '..', '..', 'data', 'uploads') });

// Listar notas de entrada
router.get('/', (req, res) => {
  const { fornecedor_id, status, data_inicio, data_fim } = req.query;
  let sql = `SELECT ne.*, f.razao_social as fornecedor_nome FROM notas_entrada ne LEFT JOIN fornecedores f ON ne.fornecedor_id = f.id WHERE 1=1`;
  const params = [];
  if (fornecedor_id) { sql += ` AND ne.fornecedor_id = ?`; params.push(fornecedor_id); }
  if (status) { sql += ` AND ne.status = ?`; params.push(status); }
  if (data_inicio) { sql += ` AND ne.data_entrada >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND ne.data_entrada <= ?`; params.push(data_fim); }
  sql += ` ORDER BY ne.data_entrada DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Detalhes de uma nota
router.get('/:id', (req, res) => {
  const nota = db.prepare(`SELECT ne.*, f.razao_social as fornecedor_nome FROM notas_entrada ne LEFT JOIN fornecedores f ON ne.fornecedor_id = f.id WHERE ne.id = ?`).get(req.params.id);
  if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
  nota.itens = db.prepare(`SELECT ine.*, p.nome as produto_nome FROM itens_nota_entrada ine LEFT JOIN produtos p ON ine.produto_id = p.id WHERE ine.nota_entrada_id = ?`).all(req.params.id);
  res.json(nota);
});

// Lançamento manual de nota
router.post('/', (req, res) => {
  const { fornecedor_id, numero_nota, serie, chave_acesso, data_emissao, valor_frete, valor_seguro, valor_desconto, observacoes, itens } = req.body;

  const transaction = db.transaction(() => {
    let valor_produtos = 0;
    let valor_ipi = 0;
    let valor_icms = 0;

    if (itens) {
      for (const item of itens) {
        valor_produtos += item.valor_total || 0;
        valor_ipi += item.valor_ipi || 0;
        valor_icms += item.valor_icms || 0;
      }
    }

    const valor_total = valor_produtos + (valor_frete || 0) + (valor_seguro || 0) + valor_ipi - (valor_desconto || 0);

    const result = db.prepare(`
      INSERT INTO notas_entrada (fornecedor_id, numero_nota, serie, chave_acesso, data_emissao, valor_produtos, valor_frete, valor_seguro, valor_desconto, valor_ipi, valor_icms, valor_total, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fornecedor_id, numero_nota, serie, chave_acesso, data_emissao, valor_produtos, valor_frete || 0, valor_seguro || 0, valor_desconto || 0, valor_ipi, valor_icms, valor_total, observacoes);

    const nota_id = result.lastInsertRowid;

    if (itens) {
      const stmtItem = db.prepare(`
        INSERT INTO itens_nota_entrada (nota_entrada_id, produto_id, codigo_produto_fornecedor, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total, valor_desconto, valor_icms, valor_ipi, valor_pis, valor_cofins)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of itens) {
        stmtItem.run(nota_id, item.produto_id || null, item.codigo_produto_fornecedor, item.descricao, item.ncm, item.cfop, item.unidade, item.quantidade, item.valor_unitario, item.valor_total, item.valor_desconto || 0, item.valor_icms || 0, item.valor_ipi || 0, item.valor_pis || 0, item.valor_cofins || 0);
      }
    }

    return nota_id;
  });

  try {
    const nota_id = transaction();
    res.status(201).json({ id: nota_id, message: 'Nota de entrada criada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Importar XML de NF-e
router.post('/importar-xml', upload.single('xml'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo XML é obrigatório' });

  try {
    const xmlContent = fs.readFileSync(req.file.path, 'utf-8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlContent);

    const nfe = result.nfeProc?.NFe?.infNFe || result.NFe?.infNFe;
    if (!nfe) return res.status(400).json({ error: 'XML inválido - não é uma NF-e' });

    const emit = nfe.emit;
    const dest = nfe.dest;
    const ide = nfe.ide;
    const total = nfe.total?.ICMSTot;

    // Verificar/criar fornecedor
    let fornecedor = db.prepare(`SELECT id FROM fornecedores WHERE cnpj = ?`).get(emit.CNPJ);
    if (!fornecedor) {
      const r = db.prepare(`INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, ie, endereco, cidade, uf) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(emit.xNome, emit.xFant || emit.xNome, emit.CNPJ, emit.IE, emit.enderEmit?.xLgr, emit.enderEmit?.xMun, emit.enderEmit?.UF);
      fornecedor = { id: r.lastInsertRowid };
    }

    const chave = result.nfeProc?.protNFe?.infProt?.chNFe || nfe.$?.Id?.replace('NFe', '') || '';

    // Inserir nota
    const notaResult = db.prepare(`
      INSERT INTO notas_entrada (fornecedor_id, numero_nota, serie, chave_acesso, data_emissao, valor_produtos, valor_frete, valor_seguro, valor_desconto, valor_ipi, valor_icms, valor_total, xml_conteudo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
    `).run(fornecedor.id, ide.nNF, ide.serie, chave, ide.dhEmi || ide.dEmi, total?.vProd || 0, total?.vFrete || 0, total?.vSeg || 0, total?.vDesc || 0, total?.vIPI || 0, total?.vICMS || 0, total?.vNF || 0, xmlContent);

    const nota_id = notaResult.lastInsertRowid;

    // Inserir itens
    const dets = Array.isArray(nfe.det) ? nfe.det : [nfe.det];
    const stmtItem = db.prepare(`
      INSERT INTO itens_nota_entrada (nota_entrada_id, codigo_produto_fornecedor, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total, valor_icms, valor_ipi, valor_pis, valor_cofins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const det of dets) {
      const prod = det.prod;
      const imposto = det.imposto;
      stmtItem.run(nota_id, prod.cProd, prod.xProd, prod.NCM, prod.CFOP, prod.uCom, prod.qCom, prod.vUnCom, prod.vProd, imposto?.ICMS?.ICMS00?.vICMS || 0, imposto?.IPI?.IPITrib?.vIPI || 0, imposto?.PIS?.PISAliq?.vPIS || 0, imposto?.COFINS?.COFINSAliq?.vCOFINS || 0);
    }

    // Limpar arquivo temporário
    fs.unlinkSync(req.file.path);

    res.status(201).json({ id: nota_id, message: 'XML importado com sucesso', itens: dets.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Erro ao processar XML: ' + err.message });
  }
});

// Confirmar nota (atualiza estoque)
router.post('/:id/confirmar', (req, res) => {
  const nota = db.prepare(`SELECT * FROM notas_entrada WHERE id = ? AND status = 'pendente'`).get(req.params.id);
  if (!nota) return res.status(400).json({ error: 'Nota não encontrada ou já confirmada' });

  const itens = db.prepare(`SELECT * FROM itens_nota_entrada WHERE nota_entrada_id = ?`).all(req.params.id);

  const transaction = db.transaction(() => {
    for (const item of itens) {
      if (!item.produto_id) continue;
      const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(item.produto_id);
      if (!produto) continue;

      const novoEstoque = produto.estoque_atual + item.quantidade;
      db.prepare(`UPDATE produtos SET estoque_atual = ?, preco_custo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(novoEstoque, item.valor_unitario, item.produto_id);

      db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, referencia_tipo, referencia_id) VALUES (?, 'entrada', ?, ?, ?, 'Nota de entrada', 'nota_entrada', ?)`)
        .run(item.produto_id, item.quantidade, produto.estoque_atual, novoEstoque, nota.id);
    }

    db.prepare(`UPDATE notas_entrada SET status = 'confirmada' WHERE id = ?`).run(req.params.id);
  });
  transaction();

  res.json({ message: 'Nota confirmada e estoque atualizado' });
});

// Vincular item da nota a produto
router.put('/itens/:itemId/vincular', (req, res) => {
  const { produto_id } = req.body;
  db.prepare(`UPDATE itens_nota_entrada SET produto_id = ? WHERE id = ?`).run(produto_id, req.params.itemId);
  res.json({ message: 'Produto vinculado ao item' });
});

module.exports = router;
