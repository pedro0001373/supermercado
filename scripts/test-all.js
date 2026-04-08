// Script de teste completo de todas as funcionalidades
const BASE = 'http://localhost:3000/api';
let passed = 0;
let failed = 0;

async function api(url, opts = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  return { status: res.status, data };
}

function test(name, condition) {
  if (condition) {
    console.log(`  OK  ${name}`);
    passed++;
  } else {
    console.log(`  FALHOU  ${name}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== TESTANDO TODAS AS FUNCIONALIDADES ===\n');

  // 1. DASHBOARD
  console.log('1. DASHBOARD / RELATÓRIOS');
  const dash = await api('/relatorios/dashboard');
  test('Dashboard carrega', dash.status === 200);
  test('Total de produtos > 0', dash.data.total_produtos > 0);
  test('Estoque baixo detectado', dash.data.estoque_baixo > 0);
  test('Produtos vencendo detectados', dash.data.produtos_vencendo > 0);

  // 2. PRODUTOS
  console.log('\n2. PRODUTOS');
  const prods = await api('/produtos');
  test('Listar produtos', prods.status === 200 && prods.data.produtos.length > 0);
  test('Total de produtos = ' + prods.data.total, prods.data.total >= 38);

  const busca = await api('/produtos?busca=Coca');
  test('Buscar por nome "Coca"', busca.data.produtos.length > 0 && busca.data.produtos[0].nome.includes('Coca'));

  const barcode = await api('/produtos/barcode/7891000200100');
  test('Buscar por código de barras', barcode.status === 200 && barcode.data.nome === 'Coca-Cola 2L');

  const prod1 = await api('/produtos/1');
  test('Buscar produto por ID', prod1.status === 200 && prod1.data.id === 1);

  // 3. CATEGORIAS
  console.log('\n3. CATEGORIAS');
  const cats = await api('/categorias');
  test('Listar categorias', cats.status === 200 && cats.data.length >= 12);

  // 4. FORNECEDORES
  console.log('\n4. FORNECEDORES');
  const forns = await api('/fornecedores');
  test('Listar fornecedores', forns.status === 200 && forns.data.length >= 5);

  const buscaForn = await api('/fornecedores?busca=Silva');
  test('Buscar fornecedor', buscaForn.data.length > 0);

  // 5. ESTOQUE
  console.log('\n5. CONTROLE DE ESTOQUE');
  const alertas = await api('/estoque/alertas');
  test('Alertas de estoque baixo', alertas.status === 200 && alertas.data.length >= 3);
  console.log(`     ${alertas.data.length} produto(s) com estoque baixo`);

  const movs = await api('/estoque/movimentacoes');
  test('Histórico de movimentações', movs.status === 200 && movs.data.movimentacoes.length > 0);

  // Teste entrada manual
  const entrada = await api('/estoque/entrada', { method: 'POST', body: { produto_id: 1, quantidade: 10, motivo: 'Teste de entrada' } });
  test('Entrada manual de estoque', entrada.status === 200 && entrada.data.estoque_atual > 0);

  // Teste saída manual
  const saida = await api('/estoque/saida', { method: 'POST', body: { produto_id: 1, quantidade: 5, motivo: 'Teste de saída' } });
  test('Saída manual de estoque', saida.status === 200);

  // 6. VALIDADE
  console.log('\n6. CONTROLE DE VALIDADE');
  const valAlertas = await api('/validade/alertas');
  test('Alertas de validade', valAlertas.status === 200 && valAlertas.data.length > 0);
  console.log(`     ${valAlertas.data.length} lote(s) próximo(s) do vencimento`);

  const vencidos = await api('/validade/vencidos');
  test('Produtos vencidos', vencidos.status === 200 && vencidos.data.length > 0);
  console.log(`     ${vencidos.data.length} lote(s) vencido(s)`);

  const promocoes = await api('/validade/promocoes');
  test('Sugestões de promoção', promocoes.status === 200);
  console.log(`     ${promocoes.data.length} produto(s) sugerido(s) para promoção`);

  // 7. CAIXA
  console.log('\n7. PDV / CAIXA');
  const abrirCaixa = await api('/caixa/abrir', { method: 'POST', body: { operador: 'Teste', numero_caixa: 1, valor_abertura: 200 } });
  test('Abrir caixa', abrirCaixa.status === 201);

  const caixaAberto = await api('/caixa/aberto');
  test('Consultar caixa aberto', caixaAberto.status === 200 && caixaAberto.data !== null);

  // Sangria
  const sangria = await api('/caixa/sangria', { method: 'POST', body: { valor: 50, motivo: 'Teste sangria' } });
  test('Sangria', sangria.status === 200);

  // Suprimento
  const supr = await api('/caixa/suprimento', { method: 'POST', body: { valor: 100, motivo: 'Teste suprimento' } });
  test('Suprimento', supr.status === 200);

  // 8. VENDAS
  console.log('\n8. VENDAS');
  // Venda 1 - Dinheiro
  const venda1 = await api('/vendas', { method: 'POST', body: {
    itens: [
      { produto_id: 1, codigo_barras: '7891000100103', nome_produto: 'Arroz Integral 5kg', quantidade: 2, preco_unitario: 24.99, desconto: 0 },
      { produto_id: 11, codigo_barras: '7891000200100', nome_produto: 'Coca-Cola 2L', quantidade: 3, preco_unitario: 9.99, desconto: 0 },
      { produto_id: 29, codigo_barras: '7891000700108', nome_produto: 'Detergente 500ml', quantidade: 5, preco_unitario: 2.99, desconto: 0 }
    ],
    pagamentos: [{ forma_pagamento: 'dinheiro', valor: 100, troco: 5.08 }],
    cliente_cpf: '123.456.789-00',
    desconto: 5
  }});
  test('Venda 1 (Dinheiro)', venda1.status === 201 && venda1.data.venda_id > 0);
  console.log(`     Venda #${venda1.data.numero_venda} - Total: R$ ${venda1.data.total}`);

  // Venda 2 - Cartão
  const venda2 = await api('/vendas', { method: 'POST', body: {
    itens: [
      { produto_id: 16, codigo_barras: '7891000300107', nome_produto: 'Leite Integral 1L', quantidade: 6, preco_unitario: 5.99, desconto: 0 },
      { produto_id: 8, codigo_barras: '7891000100172', nome_produto: 'Café Torrado 500g', quantidade: 2, preco_unitario: 17.99, desconto: 0 }
    ],
    pagamentos: [{ forma_pagamento: 'cartao_debito', valor: 71.92 }]
  }});
  test('Venda 2 (Cartão Débito)', venda2.status === 201);

  // Venda 3 - PIX
  const venda3 = await api('/vendas', { method: 'POST', body: {
    itens: [
      { produto_id: 21, codigo_barras: '7891000400104', nome_produto: 'Peito de Frango (kg)', quantidade: 2.5, preco_unitario: 17.99, desconto: 0 },
      { produto_id: 25, codigo_barras: '7891000500101', nome_produto: 'Banana Prata (kg)', quantidade: 1.2, preco_unitario: 5.99, desconto: 0 }
    ],
    pagamentos: [{ forma_pagamento: 'pix', valor: 52.17 }]
  }});
  test('Venda 3 (PIX)', venda3.status === 201);

  // Venda 4 - Múltiplas formas
  const venda4 = await api('/vendas', { method: 'POST', body: {
    itens: [
      { produto_id: 32, codigo_barras: '7891000700139', nome_produto: 'Papel Higiênico 12 rolos', quantidade: 2, preco_unitario: 15.99, desconto: 0 },
      { produto_id: 34, codigo_barras: '7891000800112', nome_produto: 'Creme Dental 90g', quantidade: 3, preco_unitario: 5.99, desconto: 0 },
      { produto_id: 13, codigo_barras: '7891000200124', nome_produto: 'Água Mineral 500ml', quantidade: 6, preco_unitario: 1.99, desconto: 0 }
    ],
    pagamentos: [
      { forma_pagamento: 'dinheiro', valor: 30, troco: 0 },
      { forma_pagamento: 'cartao_credito', valor: 31.89 }
    ]
  }});
  test('Venda 4 (Dinheiro + Crédito)', venda4.status === 201);

  // Consultar vendas
  const vendas = await api('/vendas');
  test('Listar vendas', vendas.status === 200 && vendas.data.vendas.length >= 4);

  // Detalhe venda
  const detalhe = await api(`/vendas/${venda1.data.venda_id}`);
  test('Detalhe da venda', detalhe.status === 200 && detalhe.data.itens.length === 3);

  // 9. NFC-e
  console.log('\n9. NFC-e');
  const nfce1 = await api('/nfce/emitir', { method: 'POST', body: { venda_id: venda1.data.venda_id } });
  test('Emitir NFC-e venda 1', nfce1.status === 201 && nfce1.data.status === 'autorizada');
  console.log(`     NFC-e nº ${nfce1.data.numero} - Chave: ${nfce1.data.chave_acesso?.substring(0, 20)}...`);

  const nfce2 = await api('/nfce/emitir', { method: 'POST', body: { venda_id: venda2.data.venda_id } });
  test('Emitir NFC-e venda 2', nfce2.status === 201);

  const cupom = await api(`/nfce/${nfce1.data.id}/cupom`);
  test('Dados do cupom para impressão', cupom.status === 200 && cupom.data.itens.length > 0);

  const listaNfce = await api('/nfce');
  test('Listar NFC-e', listaNfce.status === 200 && listaNfce.data.length >= 2);

  // Cancelar NFC-e
  const cancelNfce = await api(`/nfce/${nfce2.data.id}/cancelar`, { method: 'POST', body: { motivo: 'Teste de cancelamento de NFC-e para verificação do sistema' } });
  test('Cancelar NFC-e', cancelNfce.status === 200);

  // 10. CANCELAR VENDA
  console.log('\n10. CANCELAMENTO');
  const cancelVenda = await api(`/vendas/${venda3.data.venda_id}/cancelar`, { method: 'POST' });
  test('Cancelar venda (devolve estoque)', cancelVenda.status === 200);

  // 11. NOTAS ENTRADA
  console.log('\n11. NOTAS DE ENTRADA');
  const notaEntrada = await api('/notas-entrada', { method: 'POST', body: {
    fornecedor_id: 1, numero_nota: '12345', serie: '1', data_emissao: '2026-04-06',
    itens: [
      { produto_id: 1, descricao: 'Arroz Integral 5kg', quantidade: 50, valor_unitario: 18.50, valor_total: 925.00 },
      { produto_id: 2, descricao: 'Feijão Carioca 1kg', quantidade: 100, valor_unitario: 6.20, valor_total: 620.00 }
    ]
  }});
  test('Lançar nota de entrada', notaEntrada.status === 201);

  const notas = await api('/notas-entrada');
  test('Listar notas de entrada', notas.status === 200 && notas.data.length > 0);

  // 12. FECHAR CAIXA
  console.log('\n12. FECHAMENTO DE CAIXA');
  const fechar = await api('/caixa/fechar', { method: 'POST', body: { valor_fechamento: 300, observacoes: 'Teste de fechamento' } });
  test('Fechar caixa', fechar.status === 200 && fechar.data.resumo);
  console.log(`     Total vendas: R$ ${fechar.data.resumo.totalVendas}`);
  console.log(`     Dinheiro: R$ ${fechar.data.resumo.valorDinheiro}`);
  console.log(`     Débito: R$ ${fechar.data.resumo.valorDebito}`);
  console.log(`     Crédito: R$ ${fechar.data.resumo.valorCredito}`);
  console.log(`     PIX: R$ ${fechar.data.resumo.valorPix}`);

  const historico = await api('/caixa/historico');
  test('Histórico de caixas', historico.status === 200 && historico.data.length > 0);

  // 13. CONFIGURAÇÕES
  console.log('\n13. CONFIGURAÇÕES');
  const configs = await api('/configuracoes');
  test('Listar configurações', configs.status === 200 && configs.data.empresa_razao_social);

  const saveConfig = await api('/configuracoes', { method: 'PUT', body: { empresa_telefone: '(11) 1234-5678' } });
  test('Salvar configuração', saveConfig.status === 200);

  // 14. RELATÓRIOS
  console.log('\n14. RELATÓRIOS');
  const relVendas = await api('/relatorios/vendas?agrupamento=dia');
  test('Relatório de vendas', relVendas.status === 200);

  const relEstoque = await api('/relatorios/estoque');
  test('Relatório de estoque', relEstoque.status === 200 && relEstoque.data.produtos.length > 0);
  console.log(`     Valor em estoque (custo): R$ ${relEstoque.data.total_custo.toFixed(2)}`);
  console.log(`     Valor em estoque (venda): R$ ${relEstoque.data.total_venda.toFixed(2)}`);

  const relTop = await api('/relatorios/produtos-mais-vendidos');
  test('Relatório top produtos', relTop.status === 200 && relTop.data.length > 0);

  const relPerdas = await api('/validade/relatorio-perdas');
  test('Relatório de perdas', relPerdas.status === 200);

  // RESUMO
  console.log('\n==========================================');
  console.log(`  RESULTADO: ${passed} passou | ${failed} falhou`);
  console.log(`  TOTAL: ${passed + failed} testes`);
  console.log('==========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
