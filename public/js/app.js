// ============================================
// SUPERMERCADO PERES - Frontend JavaScript
// v2 - Com Login + Bugs Corrigidos
// ============================================

const API = '';

// ============ ESTADO GLOBAL ============
let currentPage = 'dashboard';
let currentUser = null;
let pdvItens = [];
let pdvDescontoVal = 0;
let pdvCpfVal = '';
let produtosPage = 1;
let pagFormaCount = 1;

// ============ UTILIDADES ============
function formatMoney(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('pt-BR');
}
function formatDateTime(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
}

async function api(url, opts) {
  opts = opts || {};
  try {
    var fetchOpts = {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
    var res = await fetch(API + url, fetchOpts);
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch(e) { throw new Error('Resposta invalida do servidor'); }
    if (!res.ok) throw new Error(data.error || 'Erro na requisicao');
    return data;
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  }
}

// ============ LOGIN ============
function checkLogin() {
  var saved = localStorage.getItem('peres_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showApp();
    } catch(e) {
      localStorage.removeItem('peres_user');
    }
  }
}

async function fazerLogin(e) {
  e.preventDefault();
  var login = document.getElementById('loginUser').value.trim();
  var senha = document.getElementById('loginPass').value;
  var errEl = document.getElementById('loginError');
  var btn = document.getElementById('loginBtn');

  errEl.style.display = 'none';
  btn.textContent = 'Entrando...';
  btn.disabled = true;

  try {
    var data = await api('/api/auth/login', { method: 'POST', body: { login: login, senha: senha } });
    currentUser = data.usuario;
    localStorage.setItem('peres_user', JSON.stringify(currentUser));
    showApp();
  } catch(err) {
    errEl.textContent = err.message || 'Login ou senha incorretos';
    errEl.style.display = 'flex';
  }
  btn.textContent = 'Entrar';
  btn.disabled = false;
}

function fazerLogout() {
  currentUser = null;
  localStorage.removeItem('peres_user');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// Permissoes por perfil
var perfilPermissoes = {
  operador: ['pdv'],
  gerente: ['dashboard', 'pdv', 'produtos', 'categorias', 'fornecedores', 'clientes', 'estoque', 'validade', 'notas-entrada', 'nfce', 'vendas', 'relatorios'],
  admin: ['dashboard', 'pdv', 'produtos', 'categorias', 'fornecedores', 'clientes', 'estoque', 'validade', 'notas-entrada', 'nfce', 'vendas', 'relatorios', 'configuracoes', 'usuarios', 'logs', 'backups']
};

function temPermissao(page) {
  if (!currentUser) return false;
  var perfil = currentUser.perfil || 'operador';
  var paginas = perfilPermissoes[perfil] || perfilPermissoes.operador;
  return paginas.indexOf(page) !== -1;
}

function aplicarPermissoes() {
  var perfil = currentUser ? (currentUser.perfil || 'operador') : 'operador';
  var paginas = perfilPermissoes[perfil] || perfilPermissoes.operador;
  // Mostrar/esconder itens do menu
  document.querySelectorAll('.nav-item[data-page]').forEach(function(el) {
    var page = el.getAttribute('data-page');
    if (paginas.indexOf(page) !== -1) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
  // Esconder secoes inteiras se nenhum item visivel
  document.querySelectorAll('.nav-section').forEach(function(sec) {
    var items = sec.querySelectorAll('.nav-item[data-page]');
    var algumVisivel = false;
    items.forEach(function(it) { if (it.style.display !== 'none') algumVisivel = true; });
    // Esconder secao se tem items de pagina e nenhum visivel (manter secao do logout)
    if (items.length > 0 && !algumVisivel) {
      sec.style.display = 'none';
    } else {
      sec.style.display = '';
    }
  });
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  document.getElementById('headerUser').textContent = currentUser ? (currentUser.nome + ' (' + currentUser.perfil + ')') : '';
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  aplicarPermissoes();
  verificarCaixaStatus();

  // Operador vai direto pro PDV, demais pro dashboard
  var perfil = currentUser ? (currentUser.perfil || 'operador') : 'operador';
  if (perfil === 'operador') {
    navigateTo('pdv');
  } else {
    navigateTo('dashboard');
  }
}

async function verificarCaixaStatus() {
  try {
    var caixa = await api('/api/caixa/aberto');
    if (caixa) {
      document.getElementById('caixaStatus').className = 'status status-success';
      document.getElementById('caixaStatus').textContent = 'Caixa #' + caixa.numero_caixa + ' Aberto';
    } else {
      document.getElementById('caixaStatus').className = 'status status-danger';
      document.getElementById('caixaStatus').textContent = 'Caixa Fechado';
    }
  } catch(e) {}
}

// ============ NAVEGACAO ============
function navigateTo(page) {
  // Verificar permissao
  if (!temPermissao(page)) {
    toast('Voce nao tem permissao para acessar esta pagina', 'error');
    return;
  }
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });

  var pageEl = document.getElementById('page-' + page);
  var navEl = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  var titles = {
    dashboard: 'Dashboard', pdv: 'PDV - Frente de Caixa', produtos: 'Produtos',
    categorias: 'Categorias', fornecedores: 'Fornecedores', clientes: 'Clientes Fidelidade', estoque: 'Controle de Estoque',
    validade: 'Controle de Validade', 'notas-entrada': 'Notas de Entrada',
    nfce: 'NFC-e', vendas: 'Vendas', relatorios: 'Relatorios', configuracoes: 'Configuracoes',
    usuarios: 'Usuarios', logs: 'Logs / Auditoria', backups: 'Backups'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  currentPage = page;

  // Fechar sidebar mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');

  // Carregar dados da pagina
  switch(page) {
    case 'dashboard': carregarDashboard(); break;
    case 'produtos': carregarProdutos(); break;
    case 'categorias': carregarCategorias(); break;
    case 'fornecedores': carregarFornecedores(); break;
    case 'clientes': carregarClientes(); break;
    case 'estoque': estoqueTab('alertas'); break;
    case 'validade': validadeTab('alertas'); break;
    case 'notas-entrada': carregarNotasEntrada(); break;
    case 'nfce': carregarNfce(); break;
    case 'vendas': carregarVendas(); break;
    case 'configuracoes': carregarConfiguracoes(); break;
    case 'pdv': verificarCaixa(); break;
    case 'usuarios': carregarUsuarios(); break;
    case 'logs': carregarLogs(); break;
    case 'backups': carregarBackups(); break;
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

// ============ MODAL ============
function abrirModal(title, body, footer) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = footer || '';
  document.getElementById('modalOverlay').classList.add('show');
}
function fecharModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

// ============ DASHBOARD ============
async function carregarDashboard() {
  try {
    var data = await api('/api/relatorios/dashboard');

    document.getElementById('dashboardCards').innerHTML =
      '<div class="card card-stat primary"><div class="stat-value">' + formatMoney(data.vendas_hoje.total) + '</div><div class="stat-label">Vendas Hoje (' + data.vendas_hoje.qtd + ')</div></div>' +
      '<div class="card card-stat success"><div class="stat-value">' + formatMoney(data.vendas_mes.total) + '</div><div class="stat-label">Vendas no Mes (' + data.vendas_mes.qtd + ')</div></div>' +
      '<div class="card card-stat warning clickable" onclick="navigateTo(\'estoque\')" title="Ver estoque baixo"><div class="stat-value">' + data.estoque_baixo + '</div><div class="stat-label">Produtos Estoque Baixo</div></div>' +
      '<div class="card card-stat danger clickable" onclick="navigateTo(\'validade\')" title="Ver alertas de validade"><div class="stat-value">' + (data.produtos_vencendo + data.produtos_vencidos) + '</div><div class="stat-label">Alertas de Validade</div></div>';

    // Grafico 7 dias
    var max7 = Math.max.apply(null, data.vendas_7_dias.map(function(d){return d.total;}));
    if (max7 < 1) max7 = 1;
    document.getElementById('chart7dias').innerHTML = data.vendas_7_dias.map(function(d) {
      var pct = (d.total / max7) * 100;
      var dia = d.dia.split('-').slice(1).reverse().join('/');
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%"><div style="flex:1;width:100%;display:flex;align-items:flex-end"><div style="width:100%;height:' + pct + '%;background:var(--primary);border-radius:4px 4px 0 0;min-height:2px" title="' + formatMoney(d.total) + '"></div></div><div style="font-size:11px;margin-top:4px;color:var(--text-muted)">' + dia + '</div><div style="font-size:10px;color:var(--text-muted)">' + formatMoney(d.total) + '</div></div>';
    }).join('');

    // Top produtos
    document.getElementById('chartTopProdutos').innerHTML = data.top_produtos.length
      ? data.top_produtos.slice(0, 5).map(function(p, i) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-light)"><span style="font-weight:700;color:var(--text-muted);width:20px">' + (i+1) + '.</span><span style="flex:1;color:var(--text-secondary)">' + p.nome_produto + '</span><span class="text-muted">' + p.qtd_vendida + ' un</span><span style="font-weight:600;color:var(--text-primary)">' + formatMoney(p.total_vendido) + '</span></div>';
      }).join('')
      : '<div class="empty-state"><p>Nenhuma venda no mes</p></div>';

    // Pagamentos
    var nomesPag = { dinheiro: 'Dinheiro', cartao_debito: 'Cartao Debito', cartao_credito: 'Cartao Credito', pix: 'PIX', nfc: 'NFC', outro: 'Outros' };
    var coresPag = { dinheiro: '#34d399', cartao_debito: '#4f9cf7', cartao_credito: '#a78bfa', pix: '#22d3ee', nfc: '#fbbf24', outro: '#6b7089' };
    document.getElementById('chartPagamentos').innerHTML = data.formas_pagamento.length
      ? data.formas_pagamento.map(function(p) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-light)"><span style="width:12px;height:12px;border-radius:50%;background:' + (coresPag[p.forma_pagamento]||'#ccc') + '"></span><span style="flex:1;color:var(--text-secondary)">' + (nomesPag[p.forma_pagamento]||p.forma_pagamento) + '</span><span class="text-muted">' + p.qtd + 'x</span><span style="font-weight:600;color:var(--text-primary)">' + formatMoney(p.total) + '</span></div>';
      }).join('')
      : '<div class="empty-state"><p>Nenhum pagamento no mes</p></div>';

    // Alertas
    var alertas = '';
    if (data.estoque_baixo > 0) alertas += '<div class="alert alert-warning clickable" onclick="navigateTo(\'estoque\')">' + data.estoque_baixo + ' produto(s) com estoque baixo &#x27A1;</div>';
    if (data.produtos_vencendo > 0) alertas += '<div class="alert alert-warning clickable" onclick="navigateTo(\'validade\')">' + data.produtos_vencendo + ' produto(s) proximo(s) do vencimento &#x27A1;</div>';
    if (data.produtos_vencidos > 0) alertas += '<div class="alert alert-danger clickable" onclick="validadeTab(\'vencidos\');navigateTo(\'validade\')">' + data.produtos_vencidos + ' produto(s) vencido(s) &#x27A1;</div>';
    if (!alertas) alertas = '<div class="alert alert-success">Nenhum alerta no momento</div>';
    document.getElementById('dashboardAlertas').innerHTML = alertas;

    // Badges
    if (data.estoque_baixo > 0) {
      document.getElementById('badgeEstoque').style.display = '';
      document.getElementById('badgeEstoque').textContent = data.estoque_baixo;
    } else { document.getElementById('badgeEstoque').style.display = 'none'; }
    var valTotal = data.produtos_vencendo + data.produtos_vencidos;
    if (valTotal > 0) {
      document.getElementById('badgeValidade').style.display = '';
      document.getElementById('badgeValidade').textContent = valTotal;
    } else { document.getElementById('badgeValidade').style.display = 'none'; }
  } catch(e) { console.error('Dashboard error:', e); }
}

// ============ PRODUTOS ============
var _destaqueProdutoId = null;

async function irParaProduto(id, nome) {
  _destaqueProdutoId = id;
  // Limpar busca e ir para pagina de produtos
  navigateTo('produtos');
}

async function carregarProdutos() {
  try {
    var busca = document.getElementById('buscaProduto') ? document.getElementById('buscaProduto').value : '';
    // Se tem produto para destacar, buscar pelo nome dele
    if (_destaqueProdutoId) {
      var prod = await api('/api/produtos/' + _destaqueProdutoId);
      if (prod && prod.nome) {
        busca = prod.nome;
        if (document.getElementById('buscaProduto')) document.getElementById('buscaProduto').value = busca;
      }
    }
    var data = await api('/api/produtos?busca=' + encodeURIComponent(busca) + '&page=' + produtosPage);
    document.getElementById('produtosBody').innerHTML = data.produtos.length
      ? data.produtos.map(function(p) {
        var estoqueClass = (p.estoque_atual <= p.estoque_minimo && p.estoque_minimo > 0) ? 'text-danger' : '';
        var destaque = (_destaqueProdutoId === p.id) ? ' highlight-row' : '';
        return '<tr data-produto-id="' + p.id + '" class="' + destaque + '"><td class="font-mono">' + (p.codigo_barras||'-') + '</td><td><strong>' + p.nome + '</strong></td><td>' + (p.categoria_nome||'-') + '</td><td class="' + estoqueClass + '">' + p.estoque_atual + ' ' + p.unidade + '</td><td>' + formatMoney(p.preco_custo) + '</td><td><strong>' + formatMoney(p.preco_venda) + '</strong></td><td><span class="status ' + (p.ativo?'status-success':'status-danger') + '">' + (p.ativo?'Ativo':'Inativo') + '</span></td><td><button class="btn btn-sm btn-outline" onclick="modalProduto(' + p.id + ')">Editar</button> <button class="btn btn-sm btn-danger" onclick="excluirProduto(' + p.id + ')">Excluir</button></td></tr>';
      }).join('')
      : '<tr><td colspan="8" class="text-center text-muted" style="padding:30px">Nenhum produto encontrado</td></tr>';
    // Scroll até o produto destacado
    if (_destaqueProdutoId) {
      var row = document.querySelector('tr[data-produto-id="' + _destaqueProdutoId + '"]');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Remover destaque após 3s
      setTimeout(function() {
        var el = document.querySelector('.highlight-row');
        if (el) el.classList.remove('highlight-row');
      }, 3000);
      _destaqueProdutoId = null;
    }
  } catch(e) { console.error('Produtos error:', e); }
}

async function modalProduto(id) {
  try {
    var produto = id ? await api('/api/produtos/' + id) : { unidade: 'UN', ativo: 1, preco_custo: 0, preco_venda: '', margem_lucro: 0, estoque_atual: 0, estoque_minimo: 0, icms_aliquota: 0, pis_aliquota: 0, cofins_aliquota: 0, peso_liquido: 0, usa_balanca: 0 };
    var categorias = await api('/api/categorias');
    var catOpts = categorias.map(function(c) { return '<option value="' + c.id + '"' + (c.id===produto.categoria_id?' selected':'') + '>' + c.nome + '</option>'; }).join('');

    abrirModal(id ? 'Editar Produto' : 'Novo Produto',
      '<form id="formProduto"><div class="form-row"><div class="form-group"><label>Codigo de Barras</label><input class="form-control" name="codigo_barras" value="' + (produto.codigo_barras||'') + '"></div><div class="form-group"><label>Nome *</label><input class="form-control" name="nome" value="' + (produto.nome||'') + '" required></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Categoria</label><select class="form-control" name="categoria_id"><option value="">Selecione</option>' + catOpts + '</select></div><div class="form-group"><label>Unidade</label><select class="form-control" name="unidade"><option' + (produto.unidade==='UN'?' selected':'') + '>UN</option><option' + (produto.unidade==='KG'?' selected':'') + '>KG</option><option' + (produto.unidade==='LT'?' selected':'') + '>LT</option><option' + (produto.unidade==='CX'?' selected':'') + '>CX</option><option' + (produto.unidade==='PCT'?' selected':'') + '>PCT</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Preco de Custo</label><input class="form-control" name="preco_custo" type="number" step="0.01" value="' + (produto.preco_custo||0) + '"></div><div class="form-group"><label>Preco de Venda *</label><input class="form-control" name="preco_venda" type="number" step="0.01" value="' + (producto_pv(produto)) + '" required></div><div class="form-group"><label>Margem (%)</label><input class="form-control" name="margem_lucro" type="number" step="0.01" value="' + (produto.margem_lucro||0) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Estoque Atual</label><input class="form-control" name="estoque_atual" type="number" step="0.001" value="' + (produto.estoque_atual||0) + '"' + (id?' disabled':'') + '></div><div class="form-group"><label>Estoque Minimo</label><input class="form-control" name="estoque_minimo" type="number" step="0.001" value="' + (produto.estoque_minimo||0) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>NCM</label><input class="form-control" name="ncm" value="' + (produto.ncm||'') + '"></div><div class="form-group"><label>CST</label><input class="form-control" name="cst" value="' + (produto.cst||'') + '"></div><div class="form-group"><label>CFOP</label><input class="form-control" name="cfop" value="' + (produto.cfop||'') + '"></div></div>' +
      '<div class="form-group"><label>Descricao</label><textarea class="form-control" name="descricao" rows="2">' + (produto.descricao||'') + '</textarea></div></form>',
      '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarProduto(' + (id||'null') + ')">Salvar</button>'
    );
  } catch(e) { console.error(e); }
}
function producto_pv(p) { return p.preco_venda === '' || p.preco_venda === undefined ? '' : p.preco_venda; }

async function salvarProduto(id) {
  try {
    var form = document.getElementById('formProduto');
    var d = Object.fromEntries(new FormData(form));
    d.categoria_id = d.categoria_id ? Number(d.categoria_id) : null;
    d.preco_custo = Number(d.preco_custo) || 0;
    d.preco_venda = Number(d.preco_venda);
    d.margem_lucro = Number(d.margem_lucro) || 0;
    d.estoque_atual = Number(d.estoque_atual) || 0;
    d.estoque_minimo = Number(d.estoque_minimo) || 0;
    if (id) { await api('/api/produtos/' + id, { method: 'PUT', body: d }); toast('Produto atualizado!'); }
    else { await api('/api/produtos', { method: 'POST', body: d }); toast('Produto criado!'); }
    fecharModal(); carregarProdutos();
  } catch(e) {}
}

async function excluirProduto(id) {
  if (!confirm('Deseja desativar este produto?')) return;
  try { await api('/api/produtos/' + id, { method: 'DELETE' }); toast('Produto desativado'); carregarProdutos(); } catch(e) {}
}

// ============ CATEGORIAS ============
async function carregarCategorias() {
  try {
    var cats = await api('/api/categorias');
    document.getElementById('categoriasBody').innerHTML = cats.map(function(c) {
      return '<tr><td>' + c.id + '</td><td>' + c.nome + '</td><td>' + (c.descricao||'-') + '</td><td><button class="btn btn-sm btn-outline" onclick="modalCategoria(' + c.id + ',\'' + c.nome.replace(/'/g,"\\'") + '\',\'' + (c.descricao||'').replace(/'/g,"\\'") + '\')">Editar</button></td></tr>';
    }).join('');
  } catch(e) { console.error(e); }
}

function modalCategoria(id, nome, descricao) {
  nome = nome || ''; descricao = descricao || '';
  abrirModal(id ? 'Editar Categoria' : 'Nova Categoria',
    '<div class="form-group"><label>Nome</label><input class="form-control" id="catNome" value="' + nome + '"></div><div class="form-group"><label>Descricao</label><input class="form-control" id="catDescricao" value="' + descricao + '"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarCategoria(' + (id||'null') + ')">Salvar</button>');
}

async function salvarCategoria(id) {
  try {
    var body = { nome: document.getElementById('catNome').value, descricao: document.getElementById('catDescricao').value || null };
    if (id) await api('/api/categorias/' + id, { method: 'PUT', body: body });
    else await api('/api/categorias', { method: 'POST', body: body });
    toast(id ? 'Categoria atualizada!' : 'Categoria criada!');
    fecharModal(); carregarCategorias();
  } catch(e) {}
}

// ============ FORNECEDORES ============
async function carregarFornecedores() {
  try {
    var busca = document.getElementById('buscaFornecedor') ? document.getElementById('buscaFornecedor').value : '';
    var data = await api('/api/fornecedores?busca=' + encodeURIComponent(busca));
    document.getElementById('fornecedoresBody').innerHTML = data.length
      ? data.map(function(f) { return '<tr><td>' + f.razao_social + '</td><td>' + (f.nome_fantasia||'-') + '</td><td class="font-mono">' + (f.cnpj||'-') + '</td><td>' + (f.telefone||'-') + '</td><td>' + (f.cidade||'-') + '/' + (f.uf||'-') + '</td><td><button class="btn btn-sm btn-outline" onclick="modalFornecedor(' + f.id + ')">Editar</button></td></tr>'; }).join('')
      : '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">Nenhum fornecedor</td></tr>';
  } catch(e) { console.error(e); }
}

async function modalFornecedor(id) {
  try {
    var f = id ? await api('/api/fornecedores/' + id) : {};
    abrirModal(id ? 'Editar Fornecedor' : 'Novo Fornecedor',
      '<form id="formFornecedor"><div class="form-row"><div class="form-group"><label>Razao Social *</label><input class="form-control" name="razao_social" value="' + (f.razao_social||'') + '" required></div><div class="form-group"><label>Nome Fantasia</label><input class="form-control" name="nome_fantasia" value="' + (f.nome_fantasia||'') + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>CNPJ</label><input class="form-control" name="cnpj" value="' + (f.cnpj||'') + '"></div><div class="form-group"><label>IE</label><input class="form-control" name="ie" value="' + (f.ie||'') + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Endereco</label><input class="form-control" name="endereco" value="' + (f.endereco||'') + '"></div><div class="form-group"><label>Cidade</label><input class="form-control" name="cidade" value="' + (f.cidade||'') + '"></div><div class="form-group"><label>UF</label><input class="form-control" name="uf" value="' + (f.uf||'') + '" maxlength="2"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Telefone</label><input class="form-control" name="telefone" value="' + (f.telefone||'') + '"></div><div class="form-group"><label>Email</label><input class="form-control" name="email" value="' + (f.email||'') + '"></div></div></form>',
      '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarFornecedor(' + (id||'null') + ')">Salvar</button>');
  } catch(e) { console.error(e); }
}

async function salvarFornecedor(id) {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formFornecedor')));
    // Converter vazios em null
    Object.keys(d).forEach(function(k) { if (d[k] === '') d[k] = null; });
    if (id) await api('/api/fornecedores/' + id, { method: 'PUT', body: d });
    else await api('/api/fornecedores', { method: 'POST', body: d });
    toast(id ? 'Fornecedor atualizado!' : 'Fornecedor criado!');
    fecharModal(); carregarFornecedores();
  } catch(e) {}
}

// ============ ESTOQUE ============
async function estoqueTab(tab) {
  var tabNames = ['alertas','movimentacoes','inventario','pedido-compra','codigo-barras','lotes'];
  document.querySelectorAll('#page-estoque .tab').forEach(function(t, i) {
    t.classList.toggle('active', tabNames[i] === tab);
  });
  var el = document.getElementById('estoqueContent');
  try {
    if (tab === 'alertas') {
      var data = await api('/api/estoque/alertas');
      el.innerHTML = data.length ? '<div class="alert alert-warning">' + data.length + ' produto(s) com estoque abaixo do minimo</div><div class="table-container"><table><thead><tr><th>Produto</th><th>Codigo</th><th>Estoque Atual</th><th>Estoque Minimo</th><th>Diferenca</th><th>Acoes</th></tr></thead><tbody>' + data.map(function(p) { return '<tr class="clickable-row"><td><strong class="link-produto" onclick="irParaProduto(' + p.id + ')" title="Clique para ver na lista">' + p.nome + '</strong></td><td class="font-mono">' + (p.codigo_barras||'-') + '</td><td class="text-danger"><strong>' + p.estoque_atual + '</strong></td><td>' + p.estoque_minimo + '</td><td class="text-danger">' + (p.estoque_atual - p.estoque_minimo).toFixed(2) + '</td><td><button class="btn btn-sm btn-success" onclick="modalEntradaEstoque(' + p.id + ',\'' + p.nome.replace(/'/g,"\\'") + '\')">+ Entrada</button> <button class="btn btn-sm btn-outline" onclick="irParaProduto(' + p.id + ')">Ver Produto</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="alert alert-success">Todos os produtos estao com estoque adequado!</div>';
    }
    if (tab === 'movimentacoes') {
      var data = await api('/api/estoque/movimentacoes');
      el.innerHTML = '<div class="table-container"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Anterior</th><th>Posterior</th><th>Motivo</th></tr></thead><tbody>' + data.movimentacoes.map(function(m) { return '<tr><td>' + formatDateTime(m.criado_em) + '</td><td>' + m.produto_nome + '</td><td><span class="status ' + (m.tipo==='entrada'?'status-success':m.tipo==='saida'?'status-danger':'status-warning') + '">' + m.tipo + '</span></td><td>' + m.quantidade + '</td><td>' + m.estoque_anterior + '</td><td>' + m.estoque_posterior + '</td><td>' + (m.motivo||'-') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    if (tab === 'inventario') {
      var prods = await api('/api/produtos?limit=200');
      el.innerHTML = '<div class="card"><h3 style="margin-bottom:16px">Contagem de Inventario</h3><p class="text-muted mb-2">Digite a quantidade contada e clique em Salvar</p><table><thead><tr><th>Codigo</th><th>Produto</th><th>Estoque Sistema</th><th>Contado</th><th>Diferenca</th></tr></thead><tbody>' + prods.produtos.map(function(p) { return '<tr><td class="font-mono">' + (p.codigo_barras||'-') + '</td><td>' + p.nome + '</td><td>' + p.estoque_atual + '</td><td><input class="form-control" type="number" step="0.001" data-pid="' + p.id + '" data-atual="' + p.estoque_atual + '" style="width:120px" oninput="calcDifInv(this)"></td><td class="inv-dif">-</td></tr>'; }).join('') + '</tbody></table><button class="btn btn-primary btn-lg mt-2" onclick="salvarInventario()">Salvar Inventario</button></div>';
    }
    if (tab === 'pedido-compra') {
      carregarPedidoCompra();
    }
    if (tab === 'codigo-barras') {
      carregarCodigoBarras();
    }
    if (tab === 'lotes') {
      carregarLotes();
    }
  } catch(e) { console.error(e); }
}

function calcDifInv(input) {
  var atual = Number(input.dataset.atual);
  var contada = Number(input.value);
  var dif = contada - atual;
  var td = input.closest('tr').querySelector('.inv-dif');
  td.textContent = input.value ? dif.toFixed(3) : '-';
  td.className = 'inv-dif ' + (dif < 0 ? 'text-danger' : dif > 0 ? 'text-success' : '');
}

async function salvarInventario() {
  var inputs = document.querySelectorAll('#estoqueContent input[data-pid]');
  var itens = [];
  inputs.forEach(function(inp) { if (inp.value !== '') itens.push({ produto_id: Number(inp.dataset.pid), quantidade_contada: Number(inp.value) }); });
  if (!itens.length) return toast('Nenhum item contado', 'warning');
  if (!confirm('Confirma ajuste de ' + itens.length + ' item(ns)?')) return;
  try { await api('/api/estoque/inventario', { method: 'POST', body: { itens: itens } }); toast('Inventario salvo!'); estoqueTab('inventario'); } catch(e) {}
}

function modalEntradaEstoque(produtoId, nome) {
  abrirModal('Entrada de Estoque - ' + nome,
    '<div class="form-group"><label>Quantidade</label><input class="form-control" id="entradaQtd" type="number" step="0.001"></div><div class="form-group"><label>Motivo</label><input class="form-control" id="entradaMotivo" value="Reposicao de estoque"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-success" onclick="salvarEntradaEstoque(' + produtoId + ')">Confirmar</button>');
}

async function salvarEntradaEstoque(produtoId) {
  var qtd = Number(document.getElementById('entradaQtd').value);
  if (!qtd || qtd <= 0) return toast('Quantidade invalida', 'error');
  try { await api('/api/estoque/entrada', { method: 'POST', body: { produto_id: produtoId, quantidade: qtd, motivo: document.getElementById('entradaMotivo').value } }); toast('Entrada registrada!'); fecharModal(); estoqueTab('alertas'); } catch(e) {}
}

// ============ PEDIDO DE COMPRA AUTOMATICO ============
async function carregarPedidoCompra() {
  var el = document.getElementById('estoqueContent');
  try {
    var sugestoes = await api('/api/estoque/sugestao-pedido');
    var pedidos = await api('/api/estoque/pedidos-compra');
    var totalEstimado = sugestoes.reduce(function(a, s) { return a + s.custo_estimado; }, 0);

    var html = '<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:12px">Sugestao de Pedido de Compra</h3>';
    html += '<p class="text-muted mb-2">Baseado no consumo dos ultimos 30 dias e estoque minimo configurado</p>';

    if (sugestoes.length) {
      html += '<div class="alert alert-warning">' + sugestoes.length + ' produto(s) precisam de reposicao | Custo estimado: <strong>' + formatMoney(totalEstimado) + '</strong></div>';
      html += '<table><thead><tr><th>Produto</th><th>Estoque</th><th>Minimo</th><th>Consumo/dia</th><th>Dias Estoque</th><th>Qtd Sugerida</th><th>Custo Est.</th><th>Fornecedor</th></tr></thead><tbody>';
      html += sugestoes.map(function(s) {
        var diasClass = s.dias_estoque <= 3 ? 'text-danger' : s.dias_estoque <= 7 ? 'text-warning' : '';
        return '<tr><td><strong>' + s.nome + '</strong></td><td class="text-danger">' + s.estoque_atual + '</td><td>' + s.estoque_minimo + '</td><td>' + s.consumo_diario + '</td><td class="' + diasClass + '"><strong>' + (s.dias_estoque >= 999 ? '-' : s.dias_estoque + 'd') + '</strong></td><td><strong>' + s.quantidade_sugerida + '</strong></td><td>' + formatMoney(s.custo_estimado) + '</td><td>' + (s.fornecedor_nome || '-') + '</td></tr>';
      }).join('');
      html += '</tbody></table>';
      html += '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-primary" onclick="gerarPedidoCompra()">Gerar Pedido de Compra</button><button class="btn btn-outline" onclick="enviarAlertaManual()">Enviar Alerta Agora</button></div>';
    } else {
      html += '<div class="alert alert-success">Todos os produtos estao com estoque adequado!</div>';
    }
    html += '</div>';

    // Historico de pedidos
    html += '<div class="card"><h3 style="margin-bottom:12px">Pedidos de Compra Anteriores</h3>';
    if (pedidos.length) {
      html += '<table><thead><tr><th>#</th><th>Data</th><th>Fornecedor</th><th>Itens</th><th>Total</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
      html += pedidos.map(function(p) {
        return '<tr><td><strong>#' + p.id + '</strong></td><td>' + formatDateTime(p.criado_em) + '</td><td>' + (p.fornecedor_nome || 'Varios') + '</td><td>' + p.qtd_itens + '</td><td><strong>' + formatMoney(p.total) + '</strong></td><td><span class="status ' + (p.status==='enviado'?'status-success':p.status==='cancelado'?'status-danger':'status-warning') + '">' + p.status + '</span></td><td><button class="btn btn-sm btn-outline" onclick="verPedidoCompra(' + p.id + ')">Ver</button> <button class="btn btn-sm btn-primary" onclick="imprimirPedidoCompra(' + p.id + ')">Imprimir</button></td></tr>';
      }).join('');
      html += '</tbody></table>';
    } else {
      html += '<div class="text-muted" style="padding:20px;text-align:center">Nenhum pedido gerado ainda</div>';
    }
    html += '</div>';

    el.innerHTML = html;
  } catch(e) { console.error(e); }
}

async function gerarPedidoCompra() {
  try {
    var sugestoes = await api('/api/estoque/sugestao-pedido');
    if (!sugestoes.length) return toast('Nenhum produto precisa de reposicao', 'warning');
    var itens = sugestoes.map(function(s) {
      return { produto_id: s.id, quantidade_sugerida: s.quantidade_sugerida, quantidade: s.quantidade_sugerida, custo_estimado: s.preco_custo || 0 };
    });
    var result = await api('/api/estoque/pedido-compra', { method: 'POST', body: { itens: itens, observacoes: 'Gerado automaticamente em ' + new Date().toLocaleDateString('pt-BR'), usuario: currentUser ? currentUser.nome : 'sistema' } });
    toast('Pedido #' + result.id + ' criado!');
    carregarPedidoCompra();
  } catch(e) {}
}

async function verPedidoCompra(id) {
  try {
    var pedido = await api('/api/estoque/pedido-compra/' + id);
    var html = '<div class="flex-between mb-2"><div><strong>Data:</strong> ' + formatDateTime(pedido.criado_em) + '</div><div><strong>Status:</strong> ' + pedido.status + '</div><div><strong>Total:</strong> ' + formatMoney(pedido.total) + '</div></div>';
    html += '<table><thead><tr><th>Produto</th><th>Cod. Barras</th><th>Qtd Sugerida</th><th>Qtd Pedido</th><th>Custo Unit.</th></tr></thead><tbody>';
    html += pedido.itens.map(function(i) {
      return '<tr><td>' + i.produto_nome + '</td><td class="font-mono">' + (i.codigo_barras||'-') + '</td><td>' + i.quantidade_sugerida + '</td><td><strong>' + i.quantidade + '</strong></td><td>' + formatMoney(i.custo_estimado) + '</td></tr>';
    }).join('');
    html += '</tbody></table>';
    if (pedido.observacoes) html += '<div class="text-muted mt-1">' + pedido.observacoes + '</div>';
    abrirModal('Pedido de Compra #' + id, html, '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button> <button class="btn btn-primary" onclick="imprimirPedidoCompra(' + id + ')">Imprimir</button>');
  } catch(e) {}
}

async function imprimirPedidoCompra(id) {
  try {
    var pedido = await api('/api/estoque/pedido-compra/' + id);
    var w = window.open('', '_blank', 'width=700,height=500');
    w.document.write('<html><head><style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#000;background:#fff}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f0f0f0}.right{text-align:right}</style></head><body>');
    w.document.write('<h1>PEDIDO DE COMPRA #' + id + '</h1>');
    w.document.write('<p><strong>Data:</strong> ' + formatDateTime(pedido.criado_em) + '</p>');
    if (pedido.fornecedor_nome) w.document.write('<p><strong>Fornecedor:</strong> ' + pedido.fornecedor_nome + '</p>');
    w.document.write('<table><thead><tr><th>Produto</th><th>Cod. Barras</th><th>Unidade</th><th>Qtd</th><th class="right">Custo Est.</th></tr></thead><tbody>');
    pedido.itens.forEach(function(i) {
      w.document.write('<tr><td>' + i.produto_nome + '</td><td>' + (i.codigo_barras||'-') + '</td><td>' + (i.unidade||'UN') + '</td><td>' + i.quantidade + '</td><td class="right">' + formatMoney(i.custo_estimado) + '</td></tr>');
    });
    w.document.write('</tbody></table>');
    w.document.write('<p style="text-align:right;font-size:14px"><strong>TOTAL ESTIMADO: ' + formatMoney(pedido.total) + '</strong></p>');
    if (pedido.observacoes) w.document.write('<p><strong>Obs:</strong> ' + pedido.observacoes + '</p>');
    w.document.write('<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
  } catch(e) {}
}

async function enviarAlertaManual() {
  try {
    await api('/api/estoque/enviar-alerta', { method: 'POST' });
    toast('Alerta enviado (verifique email/WhatsApp configurado)');
  } catch(e) {}
}

// ============ CODIGO DE BARRAS ============
async function carregarCodigoBarras() {
  var el = document.getElementById('estoqueContent');
  try {
    var semCodigo = await api('/api/estoque/sem-codigo-barras');
    var html = '<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:12px">Gerar Codigo de Barras</h3>';
    html += '<p class="text-muted mb-2">Gere codigos de barras EAN-13 internos para produtos que nao possuem</p>';

    if (semCodigo.length) {
      html += '<div class="alert alert-warning">' + semCodigo.length + ' produto(s) sem codigo de barras</div>';
      html += '<div style="margin-bottom:12px"><button class="btn btn-primary" onclick="gerarCodigoBarrasLote()">Gerar Para Todos (' + semCodigo.length + ' produtos)</button></div>';
      html += '<table><thead><tr><th>Produto</th><th>Preco</th><th>Estoque</th><th>Acoes</th></tr></thead><tbody>';
      html += semCodigo.map(function(p) {
        return '<tr><td><strong>' + p.nome + '</strong></td><td>' + formatMoney(p.preco_venda) + '</td><td>' + p.estoque_atual + ' ' + p.unidade + '</td><td><button class="btn btn-sm btn-primary" onclick="gerarCodigoBarrasUnico(' + p.id + ')">Gerar Codigo</button></td></tr>';
      }).join('');
      html += '</tbody></table>';
    } else {
      html += '<div class="alert alert-success">Todos os produtos ja possuem codigo de barras!</div>';
    }
    html += '</div>';

    // Sessão de impressão de etiquetas
    html += '<div class="card"><h3 style="margin-bottom:12px">Imprimir Etiquetas</h3>';
    html += '<p class="text-muted mb-2">Selecione produtos para imprimir etiquetas com codigo de barras</p>';
    html += '<div class="form-row"><div class="form-group"><label>Buscar produto</label><input class="form-control" id="etiquetaBusca" placeholder="Digite o nome do produto..." oninput="buscarProdutoEtiqueta()"></div><div class="form-group"><label>Qtd por etiqueta</label><input class="form-control" id="etiquetaQtd" type="number" value="1" min="1" style="max-width:100px"></div></div>';
    html += '<div id="etiquetaResultados"></div>';
    html += '<div id="etiquetasLista" style="margin-top:12px"></div>';
    html += '</div>';

    el.innerHTML = html;
  } catch(e) { console.error(e); }
}

async function gerarCodigoBarrasUnico(produtoId) {
  try {
    var result = await api('/api/estoque/gerar-codigo-barras', { method: 'POST', body: { produto_id: produtoId } });
    toast('Codigo gerado: ' + result.codigo_barras);
    carregarCodigoBarras();
  } catch(e) {}
}

async function gerarCodigoBarrasLote() {
  if (!confirm('Gerar codigos de barras para todos os produtos sem codigo?')) return;
  try {
    var result = await api('/api/estoque/gerar-codigo-barras-lote', { method: 'POST' });
    toast(result.message);
    carregarCodigoBarras();
  } catch(e) {}
}

var _etiquetasProdutos = [];

async function buscarProdutoEtiqueta() {
  var termo = document.getElementById('etiquetaBusca').value.trim();
  if (termo.length < 2) { document.getElementById('etiquetaResultados').innerHTML = ''; return; }
  try {
    var data = await api('/api/produtos?busca=' + encodeURIComponent(termo) + '&limit=5');
    document.getElementById('etiquetaResultados').innerHTML = data.produtos.filter(function(p) { return p.codigo_barras; }).map(function(p) {
      return '<div style="display:flex;align-items:center;padding:8px;border-bottom:1px solid var(--border);cursor:pointer" onclick="addProdutoEtiqueta(' + p.id + ',\'' + p.nome.replace(/'/g,"\\'") + '\',\'' + (p.codigo_barras||'') + '\',' + p.preco_venda + ')"><div style="flex:1"><strong>' + p.nome + '</strong> <span class="font-mono text-muted">' + (p.codigo_barras||'Sem codigo') + '</span></div><div>' + formatMoney(p.preco_venda) + '</div></div>';
    }).join('') || '<div class="text-muted" style="padding:8px">Nenhum produto com codigo de barras encontrado</div>';
  } catch(e) {}
}

function addProdutoEtiqueta(id, nome, codigo, preco) {
  var qtd = Number(document.getElementById('etiquetaQtd').value) || 1;
  _etiquetasProdutos.push({ id: id, nome: nome, codigo: codigo, preco: preco, qtd: qtd });
  document.getElementById('etiquetaBusca').value = '';
  document.getElementById('etiquetaResultados').innerHTML = '';
  renderEtiquetasLista();
}

function removerEtiqueta(index) {
  _etiquetasProdutos.splice(index, 1);
  renderEtiquetasLista();
}

function renderEtiquetasLista() {
  var el = document.getElementById('etiquetasLista');
  if (!_etiquetasProdutos.length) { el.innerHTML = ''; return; }
  var html = '<table><thead><tr><th>Produto</th><th>Codigo</th><th>Preco</th><th>Qtd</th><th></th></tr></thead><tbody>';
  _etiquetasProdutos.forEach(function(p, i) {
    html += '<tr><td>' + p.nome + '</td><td class="font-mono">' + p.codigo + '</td><td>' + formatMoney(p.preco) + '</td><td>' + p.qtd + '</td><td><button class="btn btn-sm btn-danger" onclick="removerEtiqueta(' + i + ')">X</button></td></tr>';
  });
  html += '</tbody></table>';
  html += '<button class="btn btn-primary mt-1" onclick="imprimirEtiquetas()">Imprimir Etiquetas (' + _etiquetasProdutos.reduce(function(a,p){return a+p.qtd;},0) + ')</button>';
  el.innerHTML = html;
}

function imprimirEtiquetas() {
  if (!_etiquetasProdutos.length) return toast('Adicione produtos', 'warning');
  var w = window.open('', '_blank', 'width=600,height=800');
  var etiquetas = '';
  _etiquetasProdutos.forEach(function(p) {
    for (var i = 0; i < p.qtd; i++) {
      etiquetas += '<div class="etiqueta">';
      etiquetas += '<div class="et-nome">' + p.nome + '</div>';
      etiquetas += '<div class="et-codigo">';
      // Renderizar barras simples via CSS
      for (var c = 0; c < p.codigo.length; c++) {
        var digit = parseInt(p.codigo[c]);
        var w1 = (digit % 2 === 0 ? 2 : 1);
        var w2 = (digit % 3 === 0 ? 2 : 1);
        etiquetas += '<span class="bar b" style="width:' + w1 + 'px"></span>';
        etiquetas += '<span class="bar s" style="width:' + w2 + 'px"></span>';
      }
      etiquetas += '</div>';
      etiquetas += '<div class="et-num">' + p.codigo + '</div>';
      etiquetas += '<div class="et-preco">' + formatMoney(p.preco) + '</div>';
      etiquetas += '</div>';
    }
  });
  w.document.write('<html><head><style>' +
    'body{margin:0;padding:10px;font-family:Arial,sans-serif;color:#000;background:#fff}' +
    '.etiqueta{display:inline-block;width:180px;border:1px dashed #999;padding:8px;margin:4px;text-align:center;page-break-inside:avoid}' +
    '.et-nome{font-size:10px;font-weight:bold;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.et-codigo{height:40px;display:flex;align-items:stretch;justify-content:center;gap:0}' +
    '.bar{display:inline-block;height:100%}.bar.b{background:#000}.bar.s{background:transparent}' +
    '.et-num{font-family:monospace;font-size:11px;margin:2px 0;letter-spacing:2px}' +
    '.et-preco{font-size:16px;font-weight:bold}' +
    '@media print{.etiqueta{border:1px dashed #ccc}}' +
    '</style></head><body>' + etiquetas + '<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
}

// ============ CONTROLE DE LOTES ============
async function carregarLotes() {
  var el = document.getElementById('estoqueContent');
  try {
    var prods = await api('/api/produtos?limit=200');
    var html = '<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:12px">Controle de Lotes</h3>';
    html += '<p class="text-muted mb-2">Rastreabilidade completa de lotes por produto</p>';
    html += '<div class="form-row"><div class="form-group"><label>Selecione um produto</label><select class="form-control" id="loteProdutoSelect" onchange="carregarLotesProduto()"><option value="">-- Selecione --</option>';
    html += prods.produtos.map(function(p) { return '<option value="' + p.id + '">' + p.nome + ' (' + (p.codigo_barras||'sem cod') + ')</option>'; }).join('');
    html += '</select></div><div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="modalNovoLote()">+ Novo Lote</button></div></div></div>';
    html += '<div id="lotesConteudo"></div>';
    el.innerHTML = html;
  } catch(e) { console.error(e); }
}

async function carregarLotesProduto() {
  var produtoId = document.getElementById('loteProdutoSelect').value;
  var el = document.getElementById('lotesConteudo');
  if (!produtoId) { el.innerHTML = ''; return; }
  try {
    var lotes = await api('/api/estoque/lotes/' + produtoId);
    if (!lotes.length) { el.innerHTML = '<div class="alert alert-info">Nenhum lote cadastrado para este produto</div>'; return; }
    var html = '<div class="table-container"><table><thead><tr><th>Lote</th><th>Fabricacao</th><th>Validade</th><th>Status</th><th>Dias</th><th>Quantidade</th><th>Custo Unit.</th><th>Fornecedor</th><th>Acoes</th></tr></thead><tbody>';
    html += lotes.map(function(l) {
      var statusClass = l.status_validade === 'vencido' ? 'status-danger' : l.status_validade === 'proximo' ? 'status-warning' : 'status-success';
      var statusText = l.status_validade === 'vencido' ? 'Vencido' : l.status_validade === 'proximo' ? 'Proximo' : 'OK';
      return '<tr><td><strong>' + (l.numero_lote || '#' + l.id) + '</strong></td><td>' + formatDate(l.data_fabricacao) + '</td><td>' + formatDate(l.data_validade) + '</td><td><span class="status ' + statusClass + '">' + statusText + '</span></td><td class="' + (l.dias_restantes <= 7 ? 'text-danger' : l.dias_restantes <= 30 ? 'text-warning' : '') + '">' + l.dias_restantes + '</td><td>' + l.quantidade + '</td><td>' + formatMoney(l.custo_unitario) + '</td><td>' + (l.fornecedor_nome||'-') + '</td><td><button class="btn btn-sm btn-outline" onclick="rastreioLote(' + l.id + ')">Rastrear</button></td></tr>';
    }).join('');
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch(e) { console.error(e); }
}

function modalNovoLote() {
  var produtoId = document.getElementById('loteProdutoSelect') ? document.getElementById('loteProdutoSelect').value : '';
  abrirModal('Cadastrar Lote',
    '<form id="formLote">' +
    '<div class="form-group"><label>Produto ID *</label><input class="form-control" name="produto_id" value="' + produtoId + '" type="number" required></div>' +
    '<div class="form-row"><div class="form-group"><label>Numero do Lote</label><input class="form-control" name="numero_lote" placeholder="Ex: LOT-2026-001"></div><div class="form-group"><label>Quantidade</label><input class="form-control" name="quantidade" type="number" step="0.001"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Data Fabricacao</label><input class="form-control" name="data_fabricacao" type="date"></div><div class="form-group"><label>Data Validade *</label><input class="form-control" name="data_validade" type="date" required></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Custo Unitario</label><input class="form-control" name="custo_unitario" type="number" step="0.01"></div><div class="form-group"><label>Fornecedor ID</label><input class="form-control" name="fornecedor_id" type="number"></div></div>' +
    '</form>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarLote()">Salvar</button>');
}

async function salvarLote() {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formLote')));
    d.produto_id = Number(d.produto_id);
    d.quantidade = Number(d.quantidade) || 0;
    d.custo_unitario = Number(d.custo_unitario) || 0;
    d.fornecedor_id = d.fornecedor_id ? Number(d.fornecedor_id) : null;
    d.usuario = currentUser ? currentUser.nome : 'sistema';
    await api('/api/estoque/lotes', { method: 'POST', body: d });
    toast('Lote cadastrado!');
    fecharModal();
    carregarLotesProduto();
  } catch(e) {}
}

async function rastreioLote(loteId) {
  try {
    var data = await api('/api/estoque/lote-rastreio/' + loteId);
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    html += '<div><strong>Produto:</strong> ' + data.produto_nome + '</div>';
    html += '<div><strong>Cod. Barras:</strong> ' + (data.codigo_barras || '-') + '</div>';
    html += '<div><strong>Lote:</strong> ' + (data.numero_lote || '#' + data.id) + '</div>';
    html += '<div><strong>Fornecedor:</strong> ' + (data.fornecedor_nome || '-') + '</div>';
    html += '<div><strong>Fabricacao:</strong> ' + formatDate(data.data_fabricacao) + '</div>';
    html += '<div><strong>Validade:</strong> ' + formatDate(data.data_validade) + '</div>';
    html += '<div><strong>Quantidade:</strong> ' + data.quantidade + '</div>';
    html += '<div><strong>Nota Entrada:</strong> ' + (data.numero_nota || '-') + '</div>';
    html += '</div>';

    if (data.vendas && data.vendas.length) {
      html += '<h4 style="margin:12px 0 8px">Vendas com este lote</h4>';
      html += '<table><thead><tr><th>#Venda</th><th>Data</th><th>Qtd</th></tr></thead><tbody>';
      html += data.vendas.map(function(v) {
        return '<tr><td>#' + v.numero_venda + '</td><td>' + formatDateTime(v.data_venda) + '</td><td>' + v.quantidade + '</td></tr>';
      }).join('');
      html += '</tbody></table>';
    } else {
      html += '<div class="text-muted" style="margin-top:12px">Nenhuma venda rastreada para este lote</div>';
    }
    abrirModal('Rastreio do Lote ' + (data.numero_lote || '#' + data.id), html, '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>');
  } catch(e) {}
}

// ============ VALIDADE ============
async function validadeTab(tab) {
  document.querySelectorAll('#page-validade .tab').forEach(function(t, i) {
    t.classList.toggle('active', ['alertas','vencidos','promocoes'][i] === tab);
  });
  var el = document.getElementById('validadeContent');
  try {
    if (tab === 'alertas') {
      var data = await api('/api/validade/alertas');
      el.innerHTML = data.length ? '<div class="alert alert-warning">' + data.length + ' lote(s) proximo(s) do vencimento</div><div class="table-container"><table><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Dias</th><th>Qtd</th><th>Fornecedor</th><th>Acoes</th></tr></thead><tbody>' + data.map(function(l) { return '<tr class="clickable-row"><td><strong class="link-produto" onclick="irParaProduto(' + l.produto_id + ')" title="Ver na lista de produtos">' + l.produto_nome + '</strong></td><td>' + (l.numero_lote||'-') + '</td><td>' + formatDate(l.data_validade) + '</td><td class="' + (l.dias_restantes<=7?'text-danger':'text-warning') + '"><strong>' + l.dias_restantes + ' dias</strong></td><td>' + l.quantidade + '</td><td>' + (l.fornecedor_nome||'-') + '</td><td><button class="btn btn-sm btn-outline" onclick="irParaProduto(' + l.produto_id + ')">Ver Produto</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="alert alert-success">Nenhum produto proximo do vencimento!</div>';
    }
    if (tab === 'vencidos') {
      var data = await api('/api/validade/vencidos');
      el.innerHTML = data.length ? '<div class="alert alert-danger">' + data.length + ' lote(s) VENCIDO(S)</div><div class="table-container"><table><thead><tr><th>Produto</th><th>Lote</th><th>Venceu em</th><th>Dias</th><th>Qtd</th><th>Valor Perda</th><th>Acoes</th></tr></thead><tbody>' + data.map(function(l) { return '<tr class="clickable-row"><td><strong class="link-produto" onclick="irParaProduto(' + l.produto_id + ')" title="Ver na lista de produtos">' + l.produto_nome + '</strong></td><td>' + (l.numero_lote||'-') + '</td><td>' + formatDate(l.data_validade) + '</td><td class="text-danger"><strong>' + l.dias_vencido + '</strong></td><td>' + l.quantidade + '</td><td class="text-danger">' + formatMoney(l.quantidade * l.preco_custo) + '</td><td><button class="btn btn-sm btn-danger" onclick="registrarPerda(' + l.produto_id + ',' + l.quantidade + ',\'' + l.produto_nome.replace(/'/g,"\\'") + '\')">Dar Baixa</button> <button class="btn btn-sm btn-outline" onclick="irParaProduto(' + l.produto_id + ')">Ver</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="alert alert-success">Nenhum produto vencido!</div>';
    }
    if (tab === 'promocoes') {
      var data = await api('/api/validade/promocoes');
      el.innerHTML = data.length ? '<div class="alert alert-info">Sugestao: Coloque estes produtos em promocao (vencendo em ate 7 dias)</div><div class="table-container"><table><thead><tr><th>Produto</th><th>Validade</th><th>Dias</th><th>Qtd</th><th>Preco Atual</th><th>Preco Sugerido (30% OFF)</th><th>Acoes</th></tr></thead><tbody>' + data.map(function(l) { return '<tr class="clickable-row"><td><strong class="link-produto" onclick="irParaProduto(' + l.produto_id + ')" title="Ver na lista de produtos">' + l.produto_nome + '</strong></td><td>' + formatDate(l.data_validade) + '</td><td class="text-danger">' + l.dias_restantes + '</td><td>' + l.quantidade + '</td><td>' + formatMoney(l.preco_venda) + '</td><td class="text-success"><strong>' + formatMoney(l.preco_sugerido) + '</strong></td><td><button class="btn btn-sm btn-primary" onclick="irParaProduto(' + l.produto_id + ')">Ver Produto</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="alert alert-success">Nenhum produto para promocao!</div>';
    }
  } catch(e) { console.error(e); }
}

async function registrarPerda(produtoId, quantidade, nome) {
  if (!confirm('Registrar perda de ' + quantidade + ' un de "' + nome + '" por vencimento?')) return;
  try { await api('/api/estoque/perda', { method: 'POST', body: { produto_id: produtoId, quantidade: quantidade, motivo: 'Perda por vencimento' } }); toast('Perda registrada'); validadeTab('vencidos'); } catch(e) {}
}

// ============ NOTAS ENTRADA ============
async function carregarNotasEntrada() {
  try {
    var data = await api('/api/notas-entrada');
    document.getElementById('notasEntradaBody').innerHTML = data.length
      ? data.map(function(n) { return '<tr><td>' + (n.numero_nota||'-') + '</td><td>' + (n.fornecedor_nome||'-') + '</td><td>' + formatDate(n.data_entrada) + '</td><td><strong>' + formatMoney(n.valor_total) + '</strong></td><td><span class="status ' + (n.status==='confirmada'?'status-success':n.status==='cancelada'?'status-danger':'status-warning') + '">' + n.status + '</span></td><td><button class="btn btn-sm btn-outline" onclick="detalheNotaEntrada(' + n.id + ')">Ver</button>' + (n.status==='pendente'?' <button class="btn btn-sm btn-success" onclick="confirmarNotaEntrada(' + n.id + ')">Confirmar</button>':'') + '</td></tr>'; }).join('')
      : '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">Nenhuma nota</td></tr>';
  } catch(e) { console.error(e); }
}

function importarXml() { document.getElementById('xmlFileInput').click(); }
async function processarXml(input) {
  var file = input.files[0]; if (!file) return;
  var formData = new FormData(); formData.append('xml', file);
  try {
    var res = await fetch(API + '/api/notas-entrada/importar-xml', { method: 'POST', body: formData });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('XML importado! ' + data.itens + ' itens');
    carregarNotasEntrada();
  } catch(e) { toast(e.message, 'error'); }
  input.value = '';
}

async function confirmarNotaEntrada(id) {
  if (!confirm('Confirmar nota e atualizar estoque?')) return;
  try { await api('/api/notas-entrada/' + id + '/confirmar', { method: 'POST' }); toast('Nota confirmada!'); carregarNotasEntrada(); } catch(e) {}
}

async function detalheNotaEntrada(id) {
  try {
    var nota = await api('/api/notas-entrada/' + id);
    abrirModal('Nota #' + (nota.numero_nota||id),
      '<div class="form-row mb-2"><div><strong>Fornecedor:</strong> ' + (nota.fornecedor_nome||'-') + '</div><div><strong>Data:</strong> ' + formatDate(nota.data_entrada) + '</div><div><strong>Total:</strong> ' + formatMoney(nota.valor_total) + '</div></div><h4 style="margin:12px 0 8px">Itens</h4><table><thead><tr><th>Descricao</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>' + (nota.itens||[]).map(function(i) { return '<tr><td>' + (i.descricao||'-') + '</td><td>' + i.quantidade + '</td><td>' + formatMoney(i.valor_unitario) + '</td><td>' + formatMoney(i.valor_total) + '</td></tr>'; }).join('') + '</tbody></table>',
      '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>');
  } catch(e) {}
}

function modalNotaEntrada() {
  abrirModal('Lancar Nota de Entrada',
    '<form id="formNotaEntrada"><div class="form-row"><div class="form-group"><label>N da Nota</label><input class="form-control" name="numero_nota"></div><div class="form-group"><label>Serie</label><input class="form-control" name="serie" value="1"></div><div class="form-group"><label>Data Emissao</label><input class="form-control" name="data_emissao" type="date"></div></div><div class="form-group"><label>Observacoes</label><textarea class="form-control" name="observacoes" rows="2"></textarea></div></form>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarNotaEntrada()">Salvar</button>');
}

async function salvarNotaEntrada() {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formNotaEntrada')));
    Object.keys(d).forEach(function(k) { if (d[k] === '') d[k] = null; });
    await api('/api/notas-entrada', { method: 'POST', body: d });
    toast('Nota criada!'); fecharModal(); carregarNotasEntrada();
  } catch(e) {}
}

// ============ NFC-e ============
async function carregarNfce() {
  try {
    var status = document.getElementById('filtroNfceStatus') ? document.getElementById('filtroNfceStatus').value : '';
    var data = await api('/api/nfce?status=' + status);
    document.getElementById('nfceBody').innerHTML = data.length
      ? data.map(function(n) { return '<tr><td>' + n.numero + '</td><td>' + (n.numero_venda||'-') + '</td><td class="font-mono" style="font-size:11px">' + (n.chave_acesso||'-') + '</td><td>' + formatDateTime(n.data_emissao) + '</td><td>' + formatMoney(n.valor_total) + '</td><td><span class="status ' + (n.ambiente==='producao'?'status-success':'status-warning') + '">' + n.ambiente + '</span></td><td><span class="status ' + (n.status==='autorizada'?'status-success':n.status==='cancelada'?'status-danger':'status-warning') + '">' + n.status + '</span></td><td>' + (n.status==='autorizada'?'<button class="btn btn-sm btn-outline" onclick="imprimirCupom(' + n.id + ')">Imprimir</button> <button class="btn btn-sm btn-danger" onclick="cancelarNfce(' + n.id + ')">Cancelar</button>':'') + '</td></tr>'; }).join('')
      : '<tr><td colspan="8" class="text-center text-muted" style="padding:30px">Nenhuma NFC-e</td></tr>';
  } catch(e) { console.error(e); }
}

async function cancelarNfce(id) {
  var motivo = prompt('Motivo do cancelamento (min 15 caracteres):');
  if (!motivo) return;
  try { await api('/api/nfce/' + id + '/cancelar', { method: 'POST', body: { motivo: motivo } }); toast('NFC-e cancelada'); carregarNfce(); } catch(e) {}
}

function modalInutilizar() {
  abrirModal('Inutilizar Numeracao',
    '<div class="form-row"><div class="form-group"><label>Numero Inicio</label><input class="form-control" id="inutInicio" type="number"></div><div class="form-group"><label>Numero Fim</label><input class="form-control" id="inutFim" type="number"></div></div><div class="form-group"><label>Motivo</label><input class="form-control" id="inutMotivo"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-danger" onclick="inutilizarNfce()">Inutilizar</button>');
}

async function inutilizarNfce() {
  try { await api('/api/nfce/inutilizar', { method: 'POST', body: { numero_inicio: document.getElementById('inutInicio').value, numero_fim: document.getElementById('inutFim').value, motivo: document.getElementById('inutMotivo').value } }); toast('Numeracao inutilizada'); fecharModal(); carregarNfce(); } catch(e) {}
}

async function imprimirCupom(id) {
  try {
    var data = await api('/api/nfce/' + id + '/cupom');
    var nomesPag = { dinheiro: 'Dinheiro', cartao_debito: 'Cart. Debito', cartao_credito: 'Cart. Credito', pix: 'PIX', nfc: 'NFC' };
    var troco = data.pagamentos.reduce(function(a,p){return a + (p.troco||0);},0);
    var totalPago = data.pagamentos.reduce(function(a,p){return a + p.valor;},0);
    var w = window.open('', '_blank', 'width=380,height=700');
    w.document.write('<html><head><style>' +
      'body{font-family:"Courier New",monospace;font-size:12px;width:300px;margin:0 auto;padding:10px;background:#fff;color:#000}' +
      '.center{text-align:center}.right{text-align:right}.bold{font-weight:bold}' +
      '.line{border-top:1px dashed #000;margin:6px 0}.dline{border-top:2px solid #000;margin:6px 0}' +
      'table{width:100%;border-collapse:collapse}td{padding:1px 0;font-size:11px}' +
      '.total{font-size:16px;font-weight:bold;text-align:right;padding:8px 0}' +
      '.row{display:flex;justify-content:space-between;padding:1px 0}' +
      '</style></head><body>' +
      '<div class="center"><strong style="font-size:14px">' + (data.empresa.empresa_nome_fantasia||'SUPERMERCADO PERES') + '</strong></div>' +
      '<div class="center" style="font-size:10px">' + (data.empresa.empresa_razao_social||'') + '</div>' +
      '<div class="center" style="font-size:10px">CNPJ: ' + (data.empresa.empresa_cnpj||'') + '</div>' +
      (data.empresa.empresa_endereco ? '<div class="center" style="font-size:10px">' + data.empresa.empresa_endereco + '</div>' : '') +
      '<div class="dline"></div>' +
      '<div class="center bold">CUPOM FISCAL ELETRONICO - NFC-e</div>' +
      '<div class="center" style="font-size:10px">NFC-e n. ' + data.nfce.numero + ' | Serie ' + (data.nfce.serie||'1') + '</div>' +
      '<div class="center" style="font-size:10px">' + formatDateTime(data.nfce.data_emissao) + '</div>' +
      '<div class="line"></div>' +
      '<div class="bold" style="font-size:10px">COD | DESCRICAO | QTD | VL UN | VL TOTAL</div>' +
      '<div class="line"></div>' +
      data.itens.map(function(item, i) {
        return '<div style="font-size:11px">' + (i+1).toString().padStart(3,'0') + ' ' + item.nome_produto + '</div>' +
          '<div class="row" style="font-size:11px;padding-left:20px"><span>' + item.quantidade + ' x ' + formatMoney(item.preco_unitario) + (item.desconto > 0 ? ' desc:-' + formatMoney(item.desconto) : '') + '</span><span class="bold">' + formatMoney(item.subtotal) + '</span></div>';
      }).join('') +
      '<div class="dline"></div>' +
      (data.venda.desconto > 0 ? '<div class="row"><span>Subtotal:</span><span>' + formatMoney(data.venda.subtotal) + '</span></div><div class="row"><span>Desconto:</span><span>-' + formatMoney(data.venda.desconto) + '</span></div>' : '') +
      '<div class="total">TOTAL: ' + formatMoney(data.venda.total) + '</div>' +
      '<div class="line"></div>' +
      '<div class="bold" style="font-size:11px">FORMA DE PAGAMENTO</div>' +
      data.pagamentos.map(function(p) { return '<div class="row" style="font-size:11px"><span>' + (nomesPag[p.forma_pagamento]||p.forma_pagamento) + '</span><span>' + formatMoney(p.valor) + '</span></div>'; }).join('') +
      (troco > 0 ? '<div class="row bold" style="font-size:12px"><span>TROCO:</span><span>' + formatMoney(troco) + '</span></div>' : '') +
      '<div class="line"></div>' +
      (data.venda.cliente_cpf ? '<div style="font-size:10px">CPF do consumidor: ' + data.venda.cliente_cpf + '</div>' : '<div style="font-size:10px">CONSUMIDOR NAO IDENTIFICADO</div>') +
      '<div class="line"></div>' +
      '<div class="center" style="font-size:10px">' + (data.nfce.ambiente==='homologacao'?'** HOMOLOGACAO - SEM VALOR FISCAL **':'DOCUMENTO FISCAL VALIDO') + '</div>' +
      '<div class="center" style="font-size:10px;margin-top:8px">Obrigado pela preferencia!</div>' +
      '<div class="center" style="font-size:10px">' + (data.empresa.empresa_nome_fantasia||'SUPERMERCADO PERES') + '</div>' +
      '<script>setTimeout(function(){window.print();},300);<\/script></body></html>');
  } catch(e) { console.error(e); }
}

// ============ VENDAS ============
async function carregarVendas() {
  try {
    var di = document.getElementById('vendasDataInicio') ? document.getElementById('vendasDataInicio').value : '';
    var df = document.getElementById('vendasDataFim') ? document.getElementById('vendasDataFim').value : '';
    var data = await api('/api/vendas?data_inicio=' + di + '&data_fim=' + df);
    document.getElementById('vendasBody').innerHTML = data.vendas.length
      ? data.vendas.map(function(v) { return '<tr><td><strong>#' + v.numero_venda + '</strong></td><td>' + formatDateTime(v.criado_em) + '</td><td>-</td><td><strong>' + formatMoney(v.total) + '</strong></td><td><span class="status ' + (v.status==='finalizada'?'status-success':v.status==='cancelada'?'status-danger':'status-warning') + '">' + v.status + '</span></td><td><button class="btn btn-sm btn-outline" onclick="detalheVenda(' + v.id + ')">Ver</button>' + (v.status==='finalizada'?' <button class="btn btn-sm btn-danger" onclick="cancelarVenda(' + v.id + ')">Cancelar</button>':'') + '</td></tr>'; }).join('')
      : '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">Nenhuma venda</td></tr>';
  } catch(e) { console.error(e); }
}

async function detalheVenda(id) {
  try {
    var v = await api('/api/vendas/' + id);
    var nomes = { dinheiro: 'Dinheiro', cartao_debito: 'Cartao Debito', cartao_credito: 'Cartao Credito', pix: 'PIX', nfc: 'NFC' };
    abrirModal('Venda #' + v.numero_venda,
      '<div class="flex-between mb-2"><div><strong>Data:</strong> ' + formatDateTime(v.criado_em) + '</div><div><strong>Status:</strong> <span class="status ' + (v.status==='finalizada'?'status-success':'status-danger') + '">' + v.status + '</span></div></div>' +
      '<table><thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead><tbody>' + v.itens.map(function(i) { return '<tr><td>' + i.nome_produto + '</td><td>' + i.quantidade + '</td><td>' + formatMoney(i.preco_unitario) + '</td><td>' + formatMoney(i.subtotal) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div style="margin-top:12px"><div class="flex-between" style="font-size:18px;font-weight:700;margin-top:8px"><span>TOTAL:</span><span>' + formatMoney(v.total) + '</span></div></div>' +
      '<h4 style="margin:16px 0 8px">Pagamentos</h4>' + v.pagamentos.map(function(p) { return '<div class="flex-between" style="padding:4px 0"><span>' + (nomes[p.forma_pagamento]||p.forma_pagamento) + '</span><span>' + formatMoney(p.valor) + (p.troco>0?' (troco: ' + formatMoney(p.troco) + ')':'') + '</span></div>'; }).join(''),
      '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>');
  } catch(e) {}
}

async function cancelarVenda(id) {
  if (!confirm('Cancelar esta venda? Estoque sera devolvido.')) return;
  try { await api('/api/vendas/' + id + '/cancelar', { method: 'POST' }); toast('Venda cancelada'); carregarVendas(); } catch(e) {}
}

// ============ CLIENTES FIDELIDADE ============
async function carregarClientes() {
  try {
    var data = await api('/api/clientes');
    document.getElementById('clientesBody').innerHTML = data.length
      ? data.map(function(c) {
        return '<tr><td><strong>' + c.nome + '</strong></td><td class="font-mono">' + (c.cpf||'-') + '</td><td>' + (c.telefone||'-') + '</td><td><strong>' + (c.pontos||0) + '</strong></td><td>' + formatMoney(c.total_compras||0) + '</td><td>' + (c.qtd_compras||0) + '</td><td><button class="btn btn-sm btn-outline" onclick="modalCliente(' + c.id + ')">Editar</button> <button class="btn btn-sm btn-primary" onclick="verCliente(' + c.id + ')">Historico</button></td></tr>';
      }).join('')
      : '<tr><td colspan="7" class="text-center text-muted" style="padding:30px">Nenhum cliente cadastrado</td></tr>';
  } catch(e) { console.error(e); }
}

function modalCliente(id) {
  if (id) {
    api('/api/clientes/' + id).then(function(c) {
      abrirModal('Editar Cliente',
        '<form id="formCliente"><div class="form-group"><label>Nome *</label><input class="form-control" name="nome" value="' + (c.nome||'') + '" required></div><div class="form-row"><div class="form-group"><label>CPF</label><input class="form-control" name="cpf" value="' + (c.cpf||'') + '"></div><div class="form-group"><label>Telefone</label><input class="form-control" name="telefone" value="' + (c.telefone||'') + '"></div></div><div class="form-group"><label>Email</label><input class="form-control" name="email" value="' + (c.email||'') + '"></div></form>',
        '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarCliente(' + id + ')">Salvar</button>');
    });
  } else {
    abrirModal('Novo Cliente',
      '<form id="formCliente"><div class="form-group"><label>Nome *</label><input class="form-control" name="nome" required></div><div class="form-row"><div class="form-group"><label>CPF</label><input class="form-control" name="cpf"></div><div class="form-group"><label>Telefone</label><input class="form-control" name="telefone"></div></div><div class="form-group"><label>Email</label><input class="form-control" name="email"></div></form>',
      '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarCliente(null)">Salvar</button>');
  }
}

async function salvarCliente(id) {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formCliente')));
    if (id) await api('/api/clientes/' + id, { method: 'PUT', body: d });
    else await api('/api/clientes', { method: 'POST', body: d });
    toast(id ? 'Cliente atualizado!' : 'Cliente cadastrado!');
    fecharModal(); carregarClientes();
  } catch(e) {}
}

async function verCliente(id) {
  try {
    var c = await api('/api/clientes/' + id);
    var html = '<div class="flex-between mb-2"><div><strong>Pontos:</strong> ' + c.pontos + '</div><div><strong>Total:</strong> ' + formatMoney(c.total_compras) + '</div><div><strong>Compras:</strong> ' + c.qtd_compras + '</div></div>';
    if (c.compras && c.compras.length) {
      html += '<h4 style="margin:12px 0 8px">Historico de Compras</h4><table><thead><tr><th>#</th><th>Data</th><th>Total</th><th>Status</th></tr></thead><tbody>' + c.compras.map(function(v) {
        return '<tr><td>#' + v.numero_venda + '</td><td>' + formatDateTime(v.criado_em) + '</td><td><strong>' + formatMoney(v.total) + '</strong></td><td><span class="status ' + (v.status==='finalizada'?'status-success':'status-danger') + '">' + v.status + '</span></td></tr>';
      }).join('') + '</tbody></table>';
    } else { html += '<div class="empty-state"><p>Nenhuma compra registrada</p></div>'; }
    abrirModal('Cliente: ' + c.nome, html, '<button class="btn btn-outline" onclick="fecharModal()">Fechar</button>');
  } catch(e) {}
}

// ============ PDV ============
var pdvClienteId = null;
var pdvClienteNomeVal = '';

async function verificarCaixa() {
  try {
    var caixa = await api('/api/caixa/aberto');
    if (caixa) {
      document.getElementById('pdvCaixaFechado').style.display = 'none';
      document.getElementById('pdvCaixaAberto').style.display = '';
      document.getElementById('caixaStatus').className = 'status status-success';
      document.getElementById('caixaStatus').textContent = 'Caixa #' + caixa.numero_caixa + ' Aberto';
      pdvItens = []; pdvDescontoVal = 0; pdvCpfVal = ''; pdvClienteId = null; pdvClienteNomeVal = '';
      document.getElementById('pdvClienteBar').style.display = 'none';
      atualizarPdv();
      setTimeout(function() { document.getElementById('pdvBuscaInput').focus(); }, 200);
    } else {
      document.getElementById('pdvCaixaFechado').style.display = '';
      document.getElementById('pdvCaixaAberto').style.display = 'none';
      document.getElementById('caixaStatus').className = 'status status-danger';
      document.getElementById('caixaStatus').textContent = 'Caixa Fechado';
    }
  } catch(e) { console.error(e); }
}

function abrirCaixaModal() {
  abrirModal('Abrir Caixa',
    '<div class="form-group"><label>Operador *</label><input class="form-control" id="caixaOperador" value="' + (currentUser ? currentUser.nome : 'Operador') + '"></div><div class="form-group"><label>Numero do Caixa</label><input class="form-control" id="caixaNumero" type="number" value="1"></div><div class="form-group"><label>Valor de Abertura (Troco)</label><input class="form-control" id="caixaValorAbertura" type="number" step="0.01" value="200"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-success" onclick="abrirCaixa()">Abrir Caixa</button>');
}

async function abrirCaixa() {
  try { await api('/api/caixa/abrir', { method: 'POST', body: { operador: document.getElementById('caixaOperador').value, numero_caixa: Number(document.getElementById('caixaNumero').value), valor_abertura: Number(document.getElementById('caixaValorAbertura').value) } }); toast('Caixa aberto!'); fecharModal(); verificarCaixa(); } catch(e) {}
}

function fecharCaixaModal() {
  abrirModal('Fechar Caixa',
    '<div class="alert alert-warning">Ao fechar o caixa, todas as vendas serao contabilizadas.</div><div class="form-group"><label>Valor em Caixa (contado)</label><input class="form-control" id="fechamentoValor" type="number" step="0.01"></div><div class="form-group"><label>Observacoes</label><textarea class="form-control" id="fechamentoObs" rows="2"></textarea></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-danger" onclick="fecharCaixa()">Fechar Caixa</button>');
}

async function fecharCaixa() {
  try {
    var val = document.getElementById('fechamentoValor').value;
    var result = await api('/api/caixa/fechar', { method: 'POST', body: { valor_fechamento: val ? Number(val) : null, observacoes: document.getElementById('fechamentoObs').value || null } });
    var r = result.resumo;
    fecharModal();
    abrirModal('Resumo do Caixa',
      '<div style="font-size:15px"><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>Total Vendas:</span><strong>' + formatMoney(r.totalVendas) + '</strong></div><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>Dinheiro:</span><span>' + formatMoney(r.valorDinheiro) + '</span></div><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>Cartao Debito:</span><span>' + formatMoney(r.valorDebito) + '</span></div><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>Cartao Credito:</span><span>' + formatMoney(r.valorCredito) + '</span></div><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>PIX:</span><span>' + formatMoney(r.valorPix) + '</span></div><div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span>Sangrias:</span><span class="text-danger">-' + formatMoney(r.totalSangrias) + '</span></div><div class="flex-between" style="padding:12px 0;font-size:18px"><span><strong>Esperado:</strong></span><strong>' + formatMoney(r.esperadoEmCaixa) + '</strong></div><div class="flex-between" style="padding:8px 0"><span>Diferenca:</span><span class="' + (r.diferenca<0?'text-danger':r.diferenca>0?'text-success':'') + '">' + formatMoney(r.diferenca) + '</span></div></div>',
      '<button class="btn btn-primary" onclick="fecharModal();verificarCaixa();verificarCaixaStatus()">OK</button>');
    toast('Caixa fechado!');
  } catch(e) {}
}

async function pdvBuscarProduto(e) {
  if (e.key !== 'Enter') return;
  var input = document.getElementById('pdvBuscaInput');
  var termo = input.value.trim();
  if (!termo) return;
  try {
    var produto = null;
    try { var r = await fetch(API + '/api/produtos/barcode/' + encodeURIComponent(termo)); if (r.ok) produto = await r.json(); } catch(e2) {}
    if (!produto) {
      var data = await api('/api/produtos?busca=' + encodeURIComponent(termo) + '&limit=10');
      if (data.produtos.length === 1) { produto = data.produtos[0]; }
      else if (data.produtos.length > 1) {
        abrirModal('Selecionar Produto', data.produtos.map(function(p) { return '<div style="display:flex;align-items:center;padding:10px;border-bottom:1px solid var(--border);cursor:pointer" onclick="pdvAdicionarProduto(' + p.id + ');fecharModal()"><div style="flex:1"><strong>' + p.nome + '</strong><br><span class="text-muted">' + (p.codigo_barras||'Sem codigo') + '</span></div><div style="text-align:right"><strong>' + formatMoney(p.preco_venda) + '</strong><br><span class="text-muted">Est: ' + p.estoque_atual + '</span></div></div>'; }).join(''), '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>');
        input.value = ''; return;
      } else { toast('Produto nao encontrado', 'warning'); input.value = ''; return; }
    }
    pdvAddItem(produto); input.value = ''; input.focus();
  } catch(err) { input.value = ''; }
}

async function pdvAdicionarProduto(id) {
  try { var produto = await api('/api/produtos/' + id); pdvAddItem(produto); document.getElementById('pdvBuscaInput').focus(); } catch(e) {}
}

// Som de bip ao adicionar produto
function pdvBeep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 1200; osc.type = 'sine';
    gain.gain.value = 0.1;
    osc.start(); osc.stop(ctx.currentTime + 0.08);
  } catch(e) {}
}

function pdvAddItem(produto) {
  var existente = pdvItens.find(function(i) { return i.produto_id === produto.id; });
  if (existente) { existente.quantidade += 1; existente.subtotal = existente.quantidade * existente.preco_unitario - existente.desconto; }
  else { pdvItens.push({ produto_id: produto.id, codigo_barras: produto.codigo_barras, nome_produto: produto.nome, quantidade: 1, preco_unitario: produto.preco_venda, desconto: 0, subtotal: produto.preco_venda }); }
  pdvBeep();
  atualizarPdv();
  // Flash na ultima linha
  setTimeout(function() {
    var rows = document.querySelectorAll('#pdvItensBody tr');
    if (rows.length) { var lastRow = rows[rows.length - 1]; lastRow.classList.add('pdv-item-added'); }
  }, 50);
}

function pdvAlterarQtd(index, qtd) {
  if (qtd <= 0) pdvItens.splice(index, 1);
  else { pdvItens[index].quantidade = qtd; pdvItens[index].subtotal = qtd * pdvItens[index].preco_unitario - pdvItens[index].desconto; }
  atualizarPdv();
}
function pdvRemoverItem(index) { pdvItens.splice(index, 1); atualizarPdv(); document.getElementById('pdvBuscaInput').focus(); }

function pdvDescontoItem(index) {
  var item = pdvItens[index];
  var v = prompt('Desconto no item "' + item.nome_produto + '" (valor em R$):', item.desconto || 0);
  if (v !== null) {
    item.desconto = Number(v) || 0;
    item.subtotal = item.quantidade * item.preco_unitario - item.desconto;
    atualizarPdv();
  }
}

function atualizarPdv() {
  var subtotal = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0);
  var totalDescontoItens = pdvItens.reduce(function(acc, i) { return acc + (i.desconto || 0); }, 0);
  var total = subtotal - pdvDescontoVal;
  if (total < 0) total = 0;
  document.getElementById('pdvItensBody').innerHTML = pdvItens.map(function(item, i) {
    var descHtml = item.desconto > 0 ? '<br><span class="pdv-item-desc">-' + formatMoney(item.desconto) + '</span>' : '';
    return '<tr><td>' + (i+1) + '</td><td>' + item.nome_produto + descHtml + '</td><td><input type="number" class="form-control" value="' + item.quantidade + '" min="0.001" step="1" style="width:65px" onchange="pdvAlterarQtd(' + i + ',Number(this.value))"></td><td>' + formatMoney(item.preco_unitario) + '</td><td><span style="cursor:pointer" onclick="pdvDescontoItem(' + i + ')" title="Clique para desconto">' + formatMoney(item.desconto||0) + '</span></td><td><strong>' + formatMoney(item.subtotal) + '</strong></td><td><button class="btn btn-sm btn-danger" onclick="pdvRemoverItem(' + i + ')" style="padding:2px 6px">X</button></td></tr>';
  }).join('');
  document.getElementById('pdvTotalValor').textContent = formatMoney(total);
  document.getElementById('pdvQtdItens').textContent = pdvItens.length;
  document.getElementById('pdvSubtotal').textContent = formatMoney(subtotal + totalDescontoItens);
  document.getElementById('pdvDesconto').textContent = formatMoney(pdvDescontoVal + totalDescontoItens);
}

function pdvDesconto() {
  abrirModal('Desconto na Venda',
    '<div class="form-group"><label>Tipo</label><select class="form-control" id="descontoTipo" onchange="calcDescontoPreview()"><option value="valor">Valor (R$)</option><option value="porcento">Porcentagem (%)</option></select></div><div class="form-group"><label>Valor</label><input class="form-control" id="descontoValorInput" type="number" step="0.01" value="' + pdvDescontoVal + '" oninput="calcDescontoPreview()"></div><div id="descontoPreview" class="text-muted" style="margin-top:8px"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="aplicarDesconto()">Aplicar</button>');
  calcDescontoPreview();
}
function calcDescontoPreview() {
  var tipo = document.getElementById('descontoTipo').value;
  var val = Number(document.getElementById('descontoValorInput').value) || 0;
  var subtotal = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0);
  var desc = tipo === 'porcento' ? (subtotal * val / 100) : val;
  document.getElementById('descontoPreview').textContent = 'Desconto: ' + formatMoney(desc) + ' | Total: ' + formatMoney(subtotal - desc);
}
function aplicarDesconto() {
  var tipo = document.getElementById('descontoTipo').value;
  var val = Number(document.getElementById('descontoValorInput').value) || 0;
  var subtotal = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0);
  pdvDescontoVal = tipo === 'porcento' ? (subtotal * val / 100) : val;
  atualizarPdv(); fecharModal(); document.getElementById('pdvBuscaInput').focus();
}

function pdvCpf() { var cpf = prompt('CPF do cliente:'); if (cpf !== null) pdvCpfVal = cpf; }

function pdvCancelarVenda() {
  if (!pdvItens.length) return;
  if (!confirm('Cancelar a venda atual?')) return;
  pdvItens = []; pdvDescontoVal = 0; pdvCpfVal = ''; pdvClienteId = null; pdvClienteNomeVal = '';
  document.getElementById('pdvClienteBar').style.display = 'none';
  atualizarPdv(); toast('Venda cancelada');
  document.getElementById('pdvBuscaInput').focus();
}

// Cliente fidelidade no PDV
function pdvCliente() {
  abrirModal('Cliente Fidelidade',
    '<div class="form-group"><label>Buscar por nome ou CPF</label><input class="form-control" id="pdvClienteBusca" placeholder="Digite para buscar..." oninput="buscarClientePdv()"></div><div id="pdvClienteResultados"></div><hr style="border-color:var(--border)"><button class="btn btn-outline btn-block" onclick="fecharModal();modalCliente()">+ Cadastrar Novo Cliente</button>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button>');
  setTimeout(function() { document.getElementById('pdvClienteBusca').focus(); }, 200);
}
async function buscarClientePdv() {
  var termo = document.getElementById('pdvClienteBusca').value.trim();
  if (termo.length < 2) { document.getElementById('pdvClienteResultados').innerHTML = ''; return; }
  try {
    var data = await api('/api/clientes/buscar?termo=' + encodeURIComponent(termo));
    document.getElementById('pdvClienteResultados').innerHTML = data.length
      ? data.map(function(c) { return '<div style="display:flex;align-items:center;padding:10px;border-bottom:1px solid var(--border);cursor:pointer" onclick="selecionarClientePdv(' + c.id + ',\'' + c.nome.replace(/'/g,"\\'") + '\',' + (c.pontos||0) + ')"><div style="flex:1"><strong>' + c.nome + '</strong><br><span class="text-muted">' + (c.cpf||'Sem CPF') + '</span></div><div style="text-align:right"><strong>' + (c.pontos||0) + ' pts</strong><br><span class="text-muted">' + c.qtd_compras + ' compras</span></div></div>'; }).join('')
      : '<div class="text-muted" style="padding:10px">Nenhum cliente encontrado</div>';
  } catch(e) {}
}
function selecionarClientePdv(id, nome, pontos) {
  pdvClienteId = id; pdvClienteNomeVal = nome;
  document.getElementById('pdvClienteBar').style.display = 'flex';
  document.getElementById('pdvClienteNome').textContent = nome;
  document.getElementById('pdvClientePontos').textContent = pontos + ' pontos';
  fecharModal(); document.getElementById('pdvBuscaInput').focus();
  toast('Cliente: ' + nome);
}
function pdvRemoverCliente() {
  pdvClienteId = null; pdvClienteNomeVal = '';
  document.getElementById('pdvClienteBar').style.display = 'none';
  document.getElementById('pdvBuscaInput').focus();
}

function pdvPagamento() {
  if (!pdvItens.length) return toast('Adicione itens', 'warning');
  var total = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0) - pdvDescontoVal;
  if (total < 0) total = 0;
  pagFormaCount = 1;
  var clienteInfo = pdvClienteId ? '<div style="margin-bottom:12px;padding:8px;background:var(--primary-light);border-radius:var(--radius);font-size:12px">Cliente: <strong>' + pdvClienteNomeVal + '</strong></div>' : '';
  abrirModal('Pagamento',
    clienteInfo +
    '<div style="text-align:center;margin-bottom:20px"><div class="text-muted">TOTAL A PAGAR</div><div style="font-size:42px;font-weight:700;color:var(--success)">' + formatMoney(total) + '</div></div>' +
    '<div id="pagamentoFormas"><div class="form-row"><div class="form-group"><label>Forma</label><select class="form-control" name="forma_0" onchange="calcTroco()"><option value="dinheiro">Dinheiro</option><option value="cartao_debito">Cartao Debito</option><option value="cartao_credito">Cartao Credito</option><option value="pix">PIX</option><option value="nfc">NFC (Aproximacao)</option></select></div><div class="form-group"><label>Valor Recebido</label><input class="form-control" name="valor_0" type="number" step="0.01" value="' + total.toFixed(2) + '" oninput="calcTroco()" id="pagValor0"></div></div></div>' +
    '<div id="trocoContainer" style="display:none;text-align:center;margin:16px 0;padding:16px;background:linear-gradient(135deg,#0a3d2a,#1a2a1a);border-radius:var(--radius);border:2px solid var(--success)"><div class="text-muted" style="font-size:12px">TROCO</div><div id="trocoValor" style="font-size:36px;font-weight:700;color:var(--success)">R$ 0,00</div></div>' +
    '<div id="trocoFalta" style="display:none;text-align:center;margin:8px 0;padding:8px;background:rgba(239,68,68,0.1);border-radius:var(--radius);color:var(--danger);font-weight:600"></div>' +
    '<button class="btn btn-sm btn-outline mt-1" onclick="addFormaPagamento()">+ Outra forma de pagamento</button>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-success btn-lg" id="btnFinalizar" onclick="finalizarVenda()">Finalizar Venda</button>');
  calcTroco();
  setTimeout(function() { var el = document.getElementById('pagValor0'); if (el) { el.select(); el.focus(); } }, 200);
}

function addFormaPagamento() {
  var idx = pagFormaCount++;
  var total = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0) - pdvDescontoVal;
  var jaPago = 0;
  document.querySelectorAll('#pagamentoFormas .form-row').forEach(function(row) {
    var inp = row.querySelector('input[type="number"]'); if (inp) jaPago += Number(inp.value) || 0;
  });
  var restante = Math.max(0, total - jaPago);
  var div = document.createElement('div'); div.className = 'form-row';
  div.innerHTML = '<div class="form-group"><label>Forma</label><select class="form-control" name="forma_' + idx + '" onchange="calcTroco()"><option value="dinheiro">Dinheiro</option><option value="cartao_debito">Cartao Debito</option><option value="cartao_credito">Cartao Credito</option><option value="pix">PIX</option><option value="nfc">NFC</option></select></div><div class="form-group"><label>Valor</label><input class="form-control" name="valor_' + idx + '" type="number" step="0.01" value="' + restante.toFixed(2) + '" oninput="calcTroco()"></div>';
  document.getElementById('pagamentoFormas').appendChild(div);
  calcTroco();
}

function calcTroco() {
  var total = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0) - pdvDescontoVal;
  if (total < 0) total = 0;
  var totalPago = 0; var temDinheiro = false;
  document.querySelectorAll('#pagamentoFormas .form-row').forEach(function(row) {
    var sel = row.querySelector('select'); var inp = row.querySelector('input[type="number"]');
    if (sel && inp) { totalPago += Number(inp.value) || 0; if (sel.value === 'dinheiro') temDinheiro = true; }
  });
  var troco = totalPago - total;
  var elTroco = document.getElementById('trocoContainer');
  var elFalta = document.getElementById('trocoFalta');
  var elBtn = document.getElementById('btnFinalizar');
  if (troco >= 0) {
    elFalta.style.display = 'none';
    if (troco > 0 && temDinheiro) {
      elTroco.style.display = '';
      document.getElementById('trocoValor').textContent = formatMoney(troco);
    } else { elTroco.style.display = 'none'; }
    elBtn.disabled = false;
  } else {
    elTroco.style.display = 'none';
    elFalta.style.display = '';
    elFalta.textContent = 'Falta: ' + formatMoney(Math.abs(troco));
    elBtn.disabled = true;
  }
}

async function finalizarVenda() {
  var total = pdvItens.reduce(function(acc, i) { return acc + i.subtotal; }, 0) - pdvDescontoVal;
  if (total < 0) total = 0;
  var pagamentos = [];
  document.querySelectorAll('#pagamentoFormas .form-row').forEach(function(row) {
    var sel = row.querySelector('select'); var inp = row.querySelector('input[type="number"]');
    if (sel && inp && Number(inp.value) > 0) {
      var valor = Number(inp.value);
      pagamentos.push({ forma_pagamento: sel.value, valor: valor, troco: sel.value === 'dinheiro' ? Math.max(0, valor - total) : 0 });
    }
  });
  var totalPago = pagamentos.reduce(function(acc, p) { return acc + p.valor; }, 0);
  if (totalPago < total) return toast('Valor insuficiente', 'error');
  try {
    var result = await api('/api/vendas', { method: 'POST', body: { itens: pdvItens, pagamentos: pagamentos, cliente_cpf: pdvCpfVal || null, cliente_id: pdvClienteId || null, desconto: pdvDescontoVal } });
    try {
      var nfce = await api('/api/nfce/emitir', { method: 'POST', body: { venda_id: result.venda_id } });
      toast('Venda #' + result.numero_venda + ' finalizada! NFC-e n' + nfce.numero);
      fecharModal();
      imprimirCupom(nfce.id);
    } catch(e2) { toast('Venda #' + result.numero_venda + ' finalizada!', 'warning'); fecharModal(); }
    pdvItens = []; pdvDescontoVal = 0; pdvCpfVal = ''; pdvClienteId = null; pdvClienteNomeVal = ''; pagFormaCount = 1;
    document.getElementById('pdvClienteBar').style.display = 'none';
    atualizarPdv();
    document.getElementById('pdvBuscaInput').focus();
  } catch(e) {}
}

function pdvSangria() {
  abrirModal('Sangria', '<div class="form-group"><label>Valor</label><input class="form-control" id="sangriaValor" type="number" step="0.01"></div><div class="form-group"><label>Motivo</label><input class="form-control" id="sangriaMotivo"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-warning" onclick="salvarSangria()">Registrar</button>');
}
async function salvarSangria() { try { await api('/api/caixa/sangria', { method: 'POST', body: { valor: Number(document.getElementById('sangriaValor').value), motivo: document.getElementById('sangriaMotivo').value || null } }); toast('Sangria registrada'); fecharModal(); } catch(e) {} }

function pdvSuprimento() {
  abrirModal('Suprimento', '<div class="form-group"><label>Valor</label><input class="form-control" id="suprimentoValor" type="number" step="0.01"></div><div class="form-group"><label>Motivo</label><input class="form-control" id="suprimentoMotivo"></div>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarSuprimento()">Registrar</button>');
}
async function salvarSuprimento() { try { await api('/api/caixa/suprimento', { method: 'POST', body: { valor: Number(document.getElementById('suprimentoValor').value), motivo: document.getElementById('suprimentoMotivo').value || null } }); toast('Suprimento registrado'); fecharModal(); } catch(e) {} }

// ============ RELATORIOS ============
async function relatorioVendas() {
  document.getElementById('relatorioContent').innerHTML = '<div class="card mt-2"><h3>Relatorio de Vendas</h3><div class="form-row mt-1"><div class="form-group"><label>Data Inicio</label><input class="form-control" id="relVendasDi" type="date"></div><div class="form-group"><label>Data Fim</label><input class="form-control" id="relVendasDf" type="date"></div><div class="form-group"><label>Agrupamento</label><select class="form-control" id="relVendasAgrup"><option value="dia">Por Dia</option><option value="mes">Por Mes</option></select></div><div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="gerarRelVendas()">Gerar</button></div></div><div id="relVendasResult"></div></div>';
}
async function gerarRelVendas() {
  try {
    var data = await api('/api/relatorios/vendas?data_inicio=' + document.getElementById('relVendasDi').value + '&data_fim=' + document.getElementById('relVendasDf').value + '&agrupamento=' + document.getElementById('relVendasAgrup').value);
    var totalV = data.reduce(function(a,d){return a+d.total_vendas;},0);
    document.getElementById('relVendasResult').innerHTML = '<div class="flex-between mt-2 mb-2"><strong>Total: ' + formatMoney(totalV) + '</strong></div><table><thead><tr><th>Periodo</th><th>Qtd</th><th>Total</th><th>Descontos</th><th>Ticket Medio</th></tr></thead><tbody>' + data.map(function(d){return '<tr><td>' + d.periodo + '</td><td>' + d.qtd_vendas + '</td><td><strong>' + formatMoney(d.total_vendas) + '</strong></td><td>' + formatMoney(d.total_descontos) + '</td><td>' + formatMoney(d.ticket_medio) + '</td></tr>';}).join('') + '</tbody></table>';
  } catch(e) {}
}
async function relatorioEstoque() {
  try {
    var data = await api('/api/relatorios/estoque');
    document.getElementById('relatorioContent').innerHTML = '<div class="card mt-2"><div class="flex-between mb-2"><h3>Posicao de Estoque</h3></div><div class="cards-grid"><div class="card card-stat primary"><div class="stat-value">' + data.produtos.length + '</div><div class="stat-label">Produtos</div></div><div class="card card-stat warning"><div class="stat-value">' + formatMoney(data.total_custo) + '</div><div class="stat-label">Valor Custo</div></div><div class="card card-stat success"><div class="stat-value">' + formatMoney(data.total_venda) + '</div><div class="stat-label">Valor Venda</div></div></div><table><thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Custo</th><th>Valor Custo</th><th>Valor Venda</th></tr></thead><tbody>' + data.produtos.map(function(p){return '<tr><td>' + p.nome + '</td><td>' + (p.categoria_nome||'-') + '</td><td>' + p.estoque_atual + ' ' + p.unidade + '</td><td>' + formatMoney(p.preco_custo) + '</td><td>' + formatMoney(p.valor_estoque_custo) + '</td><td>' + formatMoney(p.valor_estoque_venda) + '</td></tr>';}).join('') + '</tbody></table></div>';
  } catch(e) {}
}
async function relatorioProdutosMaisVendidos() {
  document.getElementById('relatorioContent').innerHTML = '<div class="card mt-2"><h3>Produtos Mais Vendidos</h3><div class="form-row mt-1"><div class="form-group"><label>Data Inicio</label><input class="form-control" id="relTopDi" type="date"></div><div class="form-group"><label>Data Fim</label><input class="form-control" id="relTopDf" type="date"></div><div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="gerarRelTop()">Gerar</button></div></div><div id="relTopResult"></div></div>';
}
async function gerarRelTop() {
  try {
    var data = await api('/api/relatorios/produtos-mais-vendidos?data_inicio=' + document.getElementById('relTopDi').value + '&data_fim=' + document.getElementById('relTopDf').value);
    document.getElementById('relTopResult').innerHTML = '<table class="mt-2"><thead><tr><th>#</th><th>Produto</th><th>Qtd Vendida</th><th>Total</th></tr></thead><tbody>' + data.map(function(p,i){return '<tr><td><strong>' + (i+1) + '</strong></td><td>' + p.nome_produto + '</td><td>' + p.qtd_vendida + '</td><td><strong>' + formatMoney(p.total_vendido) + '</strong></td></tr>';}).join('') + '</tbody></table>';
  } catch(e) {}
}
async function relatorioPerdas() {
  try {
    var data = await api('/api/validade/relatorio-perdas');
    document.getElementById('relatorioContent').innerHTML = '<div class="card mt-2"><div class="flex-between mb-2"><h3>Relatorio de Perdas</h3><div><strong>Total: <span class="text-danger">' + formatMoney(data.total_perda) + '</span></strong></div></div>' + (data.perdas.length ? '<table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>' + data.perdas.map(function(p){return '<tr><td>' + formatDateTime(p.criado_em) + '</td><td>' + p.produto_nome + '</td><td>' + p.quantidade + '</td><td class="text-danger">' + formatMoney(p.valor_perda) + '</td><td>' + p.motivo + '</td></tr>';}).join('') + '</tbody></table>' : '<div class="empty-state"><p>Nenhuma perda registrada</p></div>') + '</div>';
  } catch(e) {}
}

// ============ CONFIGURACOES ============
async function carregarConfiguracoes() {
  try {
    var config = await api('/api/configuracoes');
    var form = document.getElementById('formConfiguracoes');
    Object.keys(config).forEach(function(chave) {
      var input = form.querySelector('[name="' + chave + '"]');
      if (input) input.value = config[chave] || '';
    });
  } catch(e) { console.error(e); }
}

async function salvarConfiguracoes(e) {
  e.preventDefault();
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formConfiguracoes')));
    await api('/api/configuracoes', { method: 'PUT', body: d });
    toast('Configuracoes salvas!');
  } catch(e) {}
}

// ============ USUARIOS ============
async function carregarUsuarios() {
  try {
    var data = await api('/api/auth/usuarios');
    document.getElementById('usuariosBody').innerHTML = data.map(function(u) {
      return '<tr><td>' + u.nome + '</td><td>' + u.login + '</td><td><span class="status ' + (u.perfil==='admin'?'status-danger':u.perfil==='gerente'?'status-warning':'status-primary') + '">' + u.perfil + '</span></td><td><span class="status ' + (u.ativo?'status-success':'status-danger') + '">' + (u.ativo?'Ativo':'Inativo') + '</span></td><td>' + (u.ultimo_acesso ? formatDateTime(u.ultimo_acesso) : 'Nunca') + '</td><td><button class="btn btn-sm btn-outline" onclick="modalUsuario(' + u.id + ',\'' + u.nome.replace(/'/g,"\\'") + '\',\'' + u.login + '\',\'' + u.perfil + '\',' + u.ativo + ')">Editar</button> <button class="btn btn-sm btn-warning" onclick="modalResetSenha(' + u.id + ',\'' + u.nome.replace(/'/g,"\\'") + '\')">Resetar Senha</button></td></tr>';
    }).join('');
  } catch(e) { console.error(e); }
}

function modalUsuario(id, nome, login, perfil, ativo) {
  nome = nome || ''; login = login || ''; perfil = perfil || 'operador'; ativo = ativo !== undefined ? ativo : 1;
  abrirModal(id ? 'Editar Usuario' : 'Novo Usuario',
    '<form id="formUsuario"><div class="form-group"><label>Nome *</label><input class="form-control" name="nome" value="' + nome + '" required></div>' +
    '<div class="form-group"><label>Login *</label><input class="form-control" name="login" value="' + login + '" required></div>' +
    '<div class="form-group"><label>Senha' + (id?' (deixe vazio para manter)':'  *') + '</label><input class="form-control" name="senha" type="password"' + (id?'':' required') + '></div>' +
    '<div class="form-row"><div class="form-group"><label>Perfil</label><select class="form-control" name="perfil"><option value="operador"' + (perfil==='operador'?' selected':'') + '>Operador</option><option value="gerente"' + (perfil==='gerente'?' selected':'') + '>Gerente</option><option value="admin"' + (perfil==='admin'?' selected':'') + '>Administrador</option></select></div>' +
    (id ? '<div class="form-group"><label>Status</label><select class="form-control" name="ativo"><option value="1"' + (ativo?' selected':'') + '>Ativo</option><option value="0"' + (!ativo?' selected':'') + '>Inativo</option></select></div>' : '') + '</div></form>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="salvarUsuario(' + (id||'null') + ')">Salvar</button>');
}

async function salvarUsuario(id) {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formUsuario')));
    if (!d.senha) delete d.senha;
    if (d.ativo !== undefined) d.ativo = Number(d.ativo);
    if (id) await api('/api/auth/usuarios/' + id, { method: 'PUT', body: d });
    else await api('/api/auth/usuarios', { method: 'POST', body: d });
    toast(id ? 'Usuario atualizado!' : 'Usuario criado!');
    fecharModal(); carregarUsuarios();
  } catch(e) {}
}

// ============ RESET SENHA ============
function modalResetSenha(id, nome) {
  abrirModal('Resetar Senha - ' + nome,
    '<form id="formResetSenha"><div class="form-group"><label>Nova Senha *</label><input class="form-control" name="nova_senha" type="password" minlength="4" required></div><div class="form-group"><label>Confirmar Nova Senha *</label><input class="form-control" name="confirmar" type="password" minlength="4" required></div></form>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-warning" onclick="resetarSenha(' + id + ')">Resetar Senha</button>');
}

async function resetarSenha(id) {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formResetSenha')));
    if (d.nova_senha !== d.confirmar) return toast('Senhas nao conferem', 'error');
    if (d.nova_senha.length < 4) return toast('Senha deve ter no minimo 4 caracteres', 'error');
    await api('/api/auth/usuarios/' + id + '/reset-senha', { method: 'POST', body: { nova_senha: d.nova_senha } });
    toast('Senha resetada com sucesso!');
    fecharModal();
  } catch(e) {}
}

// ============ ALTERAR PROPRIA SENHA ============
function modalAlterarSenha() {
  abrirModal('Alterar Minha Senha',
    '<form id="formAlterarSenha"><div class="form-group"><label>Senha Atual *</label><input class="form-control" name="senha_atual" type="password" required></div><div class="form-group"><label>Nova Senha *</label><input class="form-control" name="nova_senha" type="password" minlength="4" required></div><div class="form-group"><label>Confirmar Nova Senha *</label><input class="form-control" name="confirmar" type="password" minlength="4" required></div></form>',
    '<button class="btn btn-outline" onclick="fecharModal()">Cancelar</button> <button class="btn btn-primary" onclick="alterarSenha()">Alterar Senha</button>');
}

async function alterarSenha() {
  try {
    var d = Object.fromEntries(new FormData(document.getElementById('formAlterarSenha')));
    if (d.nova_senha !== d.confirmar) return toast('Senhas nao conferem', 'error');
    if (d.nova_senha.length < 4) return toast('Senha deve ter no minimo 4 caracteres', 'error');
    await api('/api/auth/alterar-senha', { method: 'POST', body: { usuario_id: currentUser.id, senha_atual: d.senha_atual, nova_senha: d.nova_senha } });
    toast('Senha alterada com sucesso!');
    fecharModal();
  } catch(e) {}
}

// ============ LOGS ============
async function carregarLogs() {
  try {
    var modulo = document.getElementById('logFiltroModulo') ? document.getElementById('logFiltroModulo').value : '';
    var url = '/api/auth/logs?limit=200';
    if (modulo) url += '&modulo=' + modulo;
    var data = await api(url);
    var acaoLabels = {
      login: 'Login', login_falhou: 'Login Falhou', login_bloqueado: 'Bloqueado',
      nova_venda: 'Nova Venda', cancelar_venda: 'Cancelar Venda',
      abrir_caixa: 'Abrir Caixa', fechar_caixa: 'Fechar Caixa', sangria: 'Sangria', suprimento: 'Suprimento',
      entrada_estoque: 'Entrada', saida_estoque: 'Saida', inventario: 'Inventario', perda: 'Perda',
      criar_usuario: 'Criar Usuario', editar_usuario: 'Editar Usuario', reset_senha: 'Reset Senha',
      alterar_senha: 'Alterar Senha', alterar_senha_falhou: 'Alterar Senha Falhou',
      backup_manual: 'Backup Manual',
      pedido_compra: 'Pedido Compra', gerar_codigo_barras: 'Gerar Cod. Barras',
      gerar_codigo_barras_lote: 'Gerar Cod. Barras Lote', cadastrar_lote: 'Cadastrar Lote'
    };
    var moduloLabels = { auth: 'Login', vendas: 'Vendas', caixa: 'Caixa', estoque: 'Estoque', usuarios: 'Usuarios', sistema: 'Sistema' };
    document.getElementById('logsBody').innerHTML = data.logs.length
      ? data.logs.map(function(l) {
        var acaoClass = l.acao.includes('falhou') || l.acao.includes('bloqueado') || l.acao.includes('cancelar') || l.acao === 'perda' ? 'text-danger' : '';
        return '<tr><td>' + formatDateTime(l.criado_em) + '</td><td>' + (l.usuario_nome || '-') + '</td><td class="' + acaoClass + '"><strong>' + (acaoLabels[l.acao] || l.acao) + '</strong></td><td><span class="status status-primary">' + (moduloLabels[l.modulo] || l.modulo) + '</span></td><td>' + (l.detalhes || '-') + '</td><td class="font-mono" style="font-size:11px">' + (l.ip || '-') + '</td></tr>';
      }).join('')
      : '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">Nenhum log encontrado</td></tr>';
  } catch(e) { console.error(e); }
}

// ============ BACKUPS ============
async function carregarBackups() {
  try {
    var data = await api('/api/auth/backups');
    document.getElementById('backupsBody').innerHTML = data.length
      ? data.map(function(b) {
        return '<tr><td class="font-mono">' + b.arquivo + '</td><td>' + (b.tamanho / 1024).toFixed(1) + ' KB</td><td>' + formatDateTime(b.criado_em) + '</td></tr>';
      }).join('')
      : '<tr><td colspan="3" class="text-center text-muted" style="padding:30px">Nenhum backup encontrado</td></tr>';
  } catch(e) { console.error(e); }
}

async function fazerBackup() {
  try {
    await api('/api/auth/backups', { method: 'POST' });
    toast('Backup realizado com sucesso!');
    carregarBackups();
  } catch(e) {}
}

// ============ ATALHOS ============
document.addEventListener('keydown', function(e) {
  // Atalhos globais
  if (e.key === 'Escape') {
    var modal = document.getElementById('modalOverlay');
    if (modal && modal.classList.contains('show')) { fecharModal(); return; }
    if (currentPage === 'pdv') { pdvCancelarVenda(); return; }
  }

  // Atalhos do PDV
  if (currentPage === 'pdv') {
    if (e.key === 'F1') { e.preventDefault(); document.getElementById('pdvBuscaInput').focus(); document.getElementById('pdvBuscaInput').select(); }
    if (e.key === 'F2') { e.preventDefault(); pdvPagamento(); }
    if (e.key === 'F4') {
      e.preventDefault();
      if (pdvItens.length) pdvRemoverItem(pdvItens.length - 1);
    }
    if (e.key === 'F6') { e.preventDefault(); pdvDesconto(); }
    if (e.key === 'F7') { e.preventDefault(); pdvCliente(); }
    if (e.key === 'F8') {
      e.preventDefault();
      var caixaAberto = document.getElementById('pdvCaixaAberto').style.display !== 'none';
      if (caixaAberto) fecharCaixaModal();
      else abrirCaixaModal();
    }
    if (e.key === 'F9') { e.preventDefault(); pdvSangria(); }
  }
});

// ============ INICIALIZACAO ============
checkLogin();
