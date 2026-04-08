// Script para popular o banco com dados de teste
const { dbReady, dbWrapper: db } = require('../src/models/database');

async function seed() {
  await dbReady;
  console.log('Banco conectado. Inserindo dados de teste...\n');

  // ============ FORNECEDORES ============
  console.log('--- Fornecedores ---');
  const fornecedores = [
    { razao_social: 'Distribuidora Silva LTDA', nome_fantasia: 'Silva Distribuidora', cnpj: '11.111.111/0001-11', telefone: '(11) 3333-4444', cidade: 'São Paulo', uf: 'SP' },
    { razao_social: 'Bebidas Estrela LTDA', nome_fantasia: 'Estrela Bebidas', cnpj: '22.222.222/0001-22', telefone: '(11) 5555-6666', cidade: 'Campinas', uf: 'SP' },
    { razao_social: 'Frigorífico Boi Nobre LTDA', nome_fantasia: 'Boi Nobre', cnpj: '33.333.333/0001-33', telefone: '(11) 7777-8888', cidade: 'Ribeirão Preto', uf: 'SP' },
    { razao_social: 'Hortifruti Campos Verdes EIRELI', nome_fantasia: 'Campos Verdes', cnpj: '44.444.444/0001-44', telefone: '(11) 9999-0000', cidade: 'Sorocaba', uf: 'SP' },
    { razao_social: 'Padaria e Confeitaria Trigo Bom LTDA', nome_fantasia: 'Trigo Bom', cnpj: '55.555.555/0001-55', telefone: '(11) 1111-2222', cidade: 'Santos', uf: 'SP' },
  ];

  for (const f of fornecedores) {
    try {
      db.prepare('INSERT OR IGNORE INTO fornecedores (razao_social, nome_fantasia, cnpj, telefone, cidade, uf) VALUES (?,?,?,?,?,?)')
        .run(f.razao_social, f.nome_fantasia, f.cnpj, f.telefone, f.cidade, f.uf);
      console.log(`  + ${f.nome_fantasia}`);
    } catch (e) { console.log(`  ~ ${f.nome_fantasia} (já existe)`); }
  }

  // ============ PRODUTOS ============
  console.log('\n--- Produtos ---');
  const produtos = [
    // Mercearia (cat 1)
    { codigo_barras: '7891000100103', nome: 'Arroz Integral 5kg', categoria_id: 1, preco_custo: 18.50, preco_venda: 24.99, estoque_atual: 85, estoque_minimo: 20, unidade: 'UN', ncm: '10063021' },
    { codigo_barras: '7891000100110', nome: 'Feijão Carioca 1kg', categoria_id: 1, preco_custo: 6.20, preco_venda: 8.99, estoque_atual: 120, estoque_minimo: 30, unidade: 'UN', ncm: '07133319' },
    { codigo_barras: '7891000100127', nome: 'Açúcar Refinado 1kg', categoria_id: 1, preco_custo: 3.80, preco_venda: 5.49, estoque_atual: 150, estoque_minimo: 40, unidade: 'UN', ncm: '17019900' },
    { codigo_barras: '7891000100134', nome: 'Macarrão Espaguete 500g', categoria_id: 1, preco_custo: 2.90, preco_venda: 4.29, estoque_atual: 200, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000100141', nome: 'Óleo de Soja 900ml', categoria_id: 1, preco_custo: 5.60, preco_venda: 7.99, estoque_atual: 90, estoque_minimo: 25, unidade: 'UN' },
    { codigo_barras: '7891000100158', nome: 'Sal Refinado 1kg', categoria_id: 1, preco_custo: 1.50, preco_venda: 2.99, estoque_atual: 180, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000100165', nome: 'Farinha de Trigo 1kg', categoria_id: 1, preco_custo: 3.20, preco_venda: 4.99, estoque_atual: 110, estoque_minimo: 30, unidade: 'UN' },
    { codigo_barras: '7891000100172', nome: 'Café Torrado 500g', categoria_id: 1, preco_custo: 12.50, preco_venda: 17.99, estoque_atual: 75, estoque_minimo: 20, unidade: 'UN' },
    { codigo_barras: '7891000100189', nome: 'Molho de Tomate 340g', categoria_id: 1, preco_custo: 2.10, preco_venda: 3.49, estoque_atual: 160, estoque_minimo: 40, unidade: 'UN' },
    { codigo_barras: '7891000100196', nome: 'Biscoito Cream Cracker 200g', categoria_id: 1, preco_custo: 3.00, preco_venda: 4.79, estoque_atual: 130, estoque_minimo: 35, unidade: 'UN' },
    // Bebidas (cat 2)
    { codigo_barras: '7891000200100', nome: 'Coca-Cola 2L', categoria_id: 2, preco_custo: 6.00, preco_venda: 9.99, estoque_atual: 200, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000200117', nome: 'Guaraná Antarctica 2L', categoria_id: 2, preco_custo: 5.50, preco_venda: 8.49, estoque_atual: 180, estoque_minimo: 40, unidade: 'UN' },
    { codigo_barras: '7891000200124', nome: 'Água Mineral 500ml', categoria_id: 2, preco_custo: 0.80, preco_venda: 1.99, estoque_atual: 300, estoque_minimo: 100, unidade: 'UN' },
    { codigo_barras: '7891000200131', nome: 'Suco de Laranja 1L', categoria_id: 2, preco_custo: 4.50, preco_venda: 7.49, estoque_atual: 80, estoque_minimo: 20, unidade: 'UN' },
    { codigo_barras: '7891000200148', nome: 'Cerveja Pilsen Lata 350ml', categoria_id: 2, preco_custo: 2.50, preco_venda: 4.49, estoque_atual: 240, estoque_minimo: 60, unidade: 'UN' },
    // Frios e Laticínios (cat 3)
    { codigo_barras: '7891000300107', nome: 'Leite Integral 1L', categoria_id: 3, preco_custo: 4.20, preco_venda: 5.99, estoque_atual: 150, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000300114', nome: 'Queijo Mussarela (kg)', categoria_id: 3, preco_custo: 32.00, preco_venda: 44.99, estoque_atual: 25, estoque_minimo: 8, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000300121', nome: 'Presunto Fatiado (kg)', categoria_id: 3, preco_custo: 22.00, preco_venda: 32.99, estoque_atual: 15, estoque_minimo: 5, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000300138', nome: 'Iogurte Natural 170g', categoria_id: 3, preco_custo: 2.20, preco_venda: 3.99, estoque_atual: 100, estoque_minimo: 30, unidade: 'UN' },
    { codigo_barras: '7891000300145', nome: 'Manteiga 200g', categoria_id: 3, preco_custo: 6.50, preco_venda: 9.99, estoque_atual: 60, estoque_minimo: 15, unidade: 'UN' },
    // Carnes (cat 4)
    { codigo_barras: '7891000400104', nome: 'Peito de Frango (kg)', categoria_id: 4, preco_custo: 12.00, preco_venda: 17.99, estoque_atual: 40, estoque_minimo: 10, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000400111', nome: 'Carne Moída (kg)', categoria_id: 4, preco_custo: 18.00, preco_venda: 26.99, estoque_atual: 30, estoque_minimo: 8, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000400128', nome: 'Costela Bovina (kg)', categoria_id: 4, preco_custo: 25.00, preco_venda: 36.99, estoque_atual: 20, estoque_minimo: 5, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000400135', nome: 'Linguiça Toscana (kg)', categoria_id: 4, preco_custo: 15.00, preco_venda: 22.99, estoque_atual: 18, estoque_minimo: 5, unidade: 'KG', usa_balanca: 1 },
    // Hortifruti (cat 5)
    { codigo_barras: '7891000500101', nome: 'Banana Prata (kg)', categoria_id: 5, preco_custo: 3.50, preco_venda: 5.99, estoque_atual: 50, estoque_minimo: 15, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000500118', nome: 'Tomate (kg)', categoria_id: 5, preco_custo: 4.00, preco_venda: 6.99, estoque_atual: 40, estoque_minimo: 10, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000500125', nome: 'Batata (kg)', categoria_id: 5, preco_custo: 3.00, preco_venda: 4.99, estoque_atual: 60, estoque_minimo: 15, unidade: 'KG', usa_balanca: 1 },
    { codigo_barras: '7891000500132', nome: 'Cebola (kg)', categoria_id: 5, preco_custo: 2.80, preco_venda: 4.49, estoque_atual: 45, estoque_minimo: 10, unidade: 'KG', usa_balanca: 1 },
    // Limpeza (cat 7)
    { codigo_barras: '7891000700108', nome: 'Detergente 500ml', categoria_id: 7, preco_custo: 1.80, preco_venda: 2.99, estoque_atual: 200, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000700115', nome: 'Água Sanitária 1L', categoria_id: 7, preco_custo: 2.50, preco_venda: 3.99, estoque_atual: 150, estoque_minimo: 40, unidade: 'UN' },
    { codigo_barras: '7891000700122', nome: 'Sabão em Pó 1kg', categoria_id: 7, preco_custo: 8.00, preco_venda: 12.99, estoque_atual: 80, estoque_minimo: 20, unidade: 'UN' },
    { codigo_barras: '7891000700139', nome: 'Papel Higiênico 12 rolos', categoria_id: 7, preco_custo: 10.00, preco_venda: 15.99, estoque_atual: 70, estoque_minimo: 20, unidade: 'PCT' },
    // Higiene (cat 8)
    { codigo_barras: '7891000800105', nome: 'Sabonete 90g', categoria_id: 8, preco_custo: 1.50, preco_venda: 2.79, estoque_atual: 200, estoque_minimo: 50, unidade: 'UN' },
    { codigo_barras: '7891000800112', nome: 'Creme Dental 90g', categoria_id: 8, preco_custo: 3.50, preco_venda: 5.99, estoque_atual: 120, estoque_minimo: 30, unidade: 'UN' },
    { codigo_barras: '7891000800129', nome: 'Shampoo 350ml', categoria_id: 8, preco_custo: 8.00, preco_venda: 13.99, estoque_atual: 60, estoque_minimo: 15, unidade: 'UN' },
    // Produtos com ESTOQUE BAIXO (para testar alertas)
    { codigo_barras: '7891000900102', nome: 'Azeite Extra Virgem 500ml', categoria_id: 1, preco_custo: 18.00, preco_venda: 27.99, estoque_atual: 3, estoque_minimo: 10, unidade: 'UN' },
    { codigo_barras: '7891000900119', nome: 'Leite Condensado 395g', categoria_id: 1, preco_custo: 4.50, preco_venda: 7.49, estoque_atual: 2, estoque_minimo: 15, unidade: 'UN' },
    { codigo_barras: '7891000900126', nome: 'Creme de Leite 200g', categoria_id: 3, preco_custo: 2.80, preco_venda: 4.49, estoque_atual: 5, estoque_minimo: 20, unidade: 'UN' },
  ];

  for (const p of produtos) {
    try {
      const result = db.prepare(`
        INSERT OR IGNORE INTO produtos (codigo_barras, nome, categoria_id, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade, ncm, usa_balanca)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(p.codigo_barras, p.nome, p.categoria_id, p.preco_custo, p.preco_venda, p.estoque_atual, p.estoque_minimo, p.unidade || 'UN', p.ncm || null, p.usa_balanca || 0);

      if (result.changes > 0) {
        // Registrar movimentação de estoque inicial
        db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo) VALUES (?, 'entrada', ?, 0, ?, 'Estoque inicial')`)
          .run(result.lastInsertRowid, p.estoque_atual, p.estoque_atual);
      }
      console.log(`  + ${p.nome} (estoque: ${p.estoque_atual})`);
    } catch (e) { console.log(`  ~ ${p.nome} (já existe)`); }
  }

  // ============ LOTES COM VALIDADE (para testar alertas) ============
  console.log('\n--- Lotes e Validades ---');
  const hoje = new Date();
  const lotes = [
    { produto_nome: 'Leite Integral 1L', dias_validade: 3, quantidade: 50, lote: 'LT2026-001' },
    { produto_nome: 'Iogurte Natural 170g', dias_validade: 5, quantidade: 30, lote: 'IO2026-015' },
    { produto_nome: 'Presunto Fatiado (kg)', dias_validade: 2, quantidade: 8, lote: 'PR2026-007' },
    { produto_nome: 'Pão de Forma 500g', dias_validade: -2, quantidade: 5, lote: 'PF2026-003' }, // já vencido
    { produto_nome: 'Manteiga 200g', dias_validade: 25, quantidade: 20, lote: 'MT2026-011' },
    { produto_nome: 'Queijo Mussarela (kg)', dias_validade: 6, quantidade: 10, lote: 'QM2026-009' },
    { produto_nome: 'Biscoito Cream Cracker 200g', dias_validade: 90, quantidade: 100, lote: 'BC2026-050' },
  ];

  // Inserir um produto "Pão de Forma" se não existir
  db.prepare(`INSERT OR IGNORE INTO produtos (codigo_barras, nome, categoria_id, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade)
    VALUES ('7891000600105', 'Pão de Forma 500g', 6, 5.50, 8.99, 20, 5, 'UN')`).run();

  for (const l of lotes) {
    const produto = db.prepare('SELECT id FROM produtos WHERE nome = ?').get(l.produto_nome);
    if (!produto) { console.log(`  ! Produto não encontrado: ${l.produto_nome}`); continue; }

    const validade = new Date(hoje);
    validade.setDate(validade.getDate() + l.dias_validade);
    const dataVal = validade.toISOString().split('T')[0];

    db.prepare('INSERT INTO lotes (produto_id, numero_lote, data_validade, quantidade) VALUES (?,?,?,?)')
      .run(produto.id, l.lote, dataVal, l.quantidade);
    console.log(`  + Lote ${l.lote} - ${l.produto_nome} (validade: ${dataVal}, ${l.dias_validade > 0 ? l.dias_validade + ' dias' : 'VENCIDO'})`);
  }

  db.saveSync();
  console.log('\n========================================');
  console.log('Dados de teste inseridos com sucesso!');
  console.log('========================================\n');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
