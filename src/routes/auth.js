const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { gerarToken, authMiddleware, requirePerfil } = require('../middleware/authMiddleware');
const v = require('../middleware/validators');

const PERFIS = ['operador', 'gerente', 'admin'];

// Registrar log de acao
function registrarLog(usuario_id, usuario_nome, acao, modulo, detalhes, ip) {
  try {
    db.prepare('INSERT INTO logs (usuario_id, usuario_nome, acao, modulo, detalhes, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(usuario_id || null, usuario_nome || null, acao, modulo, detalhes || null, ip || null);
  } catch(e) { console.error('Erro ao registrar log:', e.message); }
}

// Login
router.post('/login', (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha sao obrigatorios' });

    const usuario = db.prepare('SELECT id, nome, login, senha, perfil, ativo FROM usuarios WHERE login = ?').get(login);
    if (!usuario) {
      registrarLog(null, login, 'login_falhou', 'auth', 'Usuario nao encontrado', req.ip);
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }
    if (!usuario.ativo) {
      registrarLog(usuario.id, usuario.nome, 'login_bloqueado', 'auth', 'Usuario desativado', req.ip);
      return res.status(401).json({ error: 'Usuario desativado' });
    }

    // Verificar senha com bcrypt
    const senhaValida = bcrypt.compareSync(senha, usuario.senha);
    if (!senhaValida) {
      registrarLog(usuario.id, usuario.nome, 'login_falhou', 'auth', 'Senha incorreta', req.ip);
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    // Sessao unica: bloquear se ja existe sessao ativa em outro dispositivo
    const cfgSessao = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'sessao_unica'").get();
    if (!cfgSessao || cfgSessao.valor === '1') {
      const atual = db.prepare('SELECT token_sessao, sessao_expira FROM usuarios WHERE id = ?').get(usuario.id);
      const forcar = req.body.forcar_login === true;
      if (atual && atual.token_sessao && atual.sessao_expira) {
        const expirada = new Date(atual.sessao_expira + 'Z').getTime() < Date.now();
        if (!expirada && !forcar) {
          registrarLog(usuario.id, usuario.nome, 'login_bloqueado', 'auth', 'Sessao ativa em outro dispositivo', req.ip);
          return res.status(409).json({
            error: 'Usuario ja logado em outro dispositivo',
            pode_forcar: true,
          });
        }
      }
    }

    const payload = { id: usuario.id, nome: usuario.nome, login: usuario.login, perfil: usuario.perfil, ativo: usuario.ativo };
    const token = gerarToken(payload);

    // Persistir token_sessao + expiracao + ultimo acesso
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP, token_sessao = ?, sessao_expira = ? WHERE id = ?')
      .run(token, expiraEm, usuario.id);
    registrarLog(usuario.id, usuario.nome, 'login', 'auth', 'Login realizado com sucesso', req.ip);

    res.json({ token, usuario: payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout - invalida sessao atual
router.post('/logout', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE usuarios SET token_sessao = NULL, sessao_expira = NULL WHERE id = ?').run(req.user.id);
    registrarLog(req.user.id, req.user.nome, 'logout', 'auth', 'Logout realizado', req.ip);
    res.json({ message: 'Logout realizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar usuarios
router.get('/usuarios', authMiddleware, requirePerfil('admin', 'gerente'), (req, res) => {
  try {
    const usuarios = db.prepare('SELECT id, nome, login, perfil, ativo, ultimo_acesso, criado_em FROM usuarios ORDER BY nome').all();
    res.json(usuarios);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Criar usuario
router.post('/usuarios', authMiddleware, requirePerfil('admin'), (req, res, next) => {
  try {
    const { nome, login, senha, perfil } = req.body;
    v.req(req.body, ['nome', 'login', 'senha']);
    v.strLen(nome, 'nome', 2, 100);
    v.strLen(login, 'login', 3, 50);
    v.strLen(senha, 'senha', 4, 100);
    if (perfil) v.oneOf(perfil, 'perfil', PERFIS);

    const hash = bcrypt.hashSync(senha, 10);
    const result = db.prepare('INSERT INTO usuarios (nome, login, senha, perfil) VALUES (?, ?, ?, ?)')
      .run(nome, login, hash, perfil || 'operador');

    registrarLog(null, null, 'criar_usuario', 'usuarios', 'Criou usuario: ' + login + ' (' + (perfil || 'operador') + ')', req.ip);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Usuario criado' });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Login ja existe' });
    next(e);
  }
});

// Atualizar usuario
router.put('/usuarios/:id', authMiddleware, requirePerfil('admin'), (req, res, next) => {
  try {
    const { nome, login, senha, perfil, ativo } = req.body;
    v.req(req.body, ['nome', 'login']);
    v.strLen(nome, 'nome', 2, 100);
    v.strLen(login, 'login', 3, 50);
    if (perfil) v.oneOf(perfil, 'perfil', PERFIS);

    if (senha) {
      v.strLen(senha, 'senha', 4, 100);
      const hash = bcrypt.hashSync(senha, 10);
      db.prepare('UPDATE usuarios SET nome=?, login=?, senha=?, perfil=?, ativo=? WHERE id=?')
        .run(nome, login, hash, perfil || 'operador', ativo !== undefined ? ativo : 1, req.params.id);
    } else {
      db.prepare('UPDATE usuarios SET nome=?, login=?, perfil=?, ativo=? WHERE id=?')
        .run(nome, login, perfil || 'operador', ativo !== undefined ? ativo : 1, req.params.id);
    }

    registrarLog(null, null, 'editar_usuario', 'usuarios', 'Editou usuario ID ' + req.params.id + ': ' + login, req.ip);
    res.json({ message: 'Usuario atualizado' });
  } catch (e) {
    next(e);
  }
});

// Resetar senha (admin pode resetar senha de qualquer usuario)
router.post('/usuarios/:id/reset-senha', authMiddleware, requirePerfil('admin'), (req, res, next) => {
  try {
    const { nova_senha } = req.body;
    v.req(req.body, ['nova_senha']);
    v.strLen(nova_senha, 'nova_senha', 4, 100);

    const usuario = db.prepare('SELECT id, nome, login FROM usuarios WHERE id = ?').get(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const hash = bcrypt.hashSync(nova_senha, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, req.params.id);

    registrarLog(null, null, 'reset_senha', 'usuarios', 'Senha resetada do usuario: ' + usuario.login, req.ip);
    res.json({ message: 'Senha resetada com sucesso' });
  } catch (e) {
    next(e);
  }
});

// Alterar propria senha
router.post('/alterar-senha', authMiddleware, (req, res, next) => {
  try {
    const { usuario_id, senha_atual, nova_senha } = req.body;
    v.req(req.body, ['usuario_id', 'senha_atual', 'nova_senha']);
    v.strLen(nova_senha, 'nova_senha', 4, 100);

    const usuario = db.prepare('SELECT id, nome, login, senha FROM usuarios WHERE id = ?').get(usuario_id);
    if (!usuario) return res.status(404).json({ error: 'Usuario nao encontrado' });

    if (!bcrypt.compareSync(senha_atual, usuario.senha)) {
      registrarLog(usuario.id, usuario.nome, 'alterar_senha_falhou', 'auth', 'Senha atual incorreta', req.ip);
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = bcrypt.hashSync(nova_senha, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, usuario_id);

    registrarLog(usuario.id, usuario.nome, 'alterar_senha', 'auth', 'Senha alterada com sucesso', req.ip);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (e) {
    next(e);
  }
});

// ============ LOGS DE AUDITORIA ============

// Listar logs
router.get('/logs', authMiddleware, requirePerfil('admin', 'gerente'), (req, res) => {
  try {
    const { modulo, usuario_id, limit, offset } = req.query;
    var sql = 'SELECT * FROM logs WHERE 1=1';
    var params = [];

    if (modulo) { sql += ' AND modulo = ?'; params.push(modulo); }
    if (usuario_id) { sql += ' AND usuario_id = ?'; params.push(usuario_id); }

    sql += ' ORDER BY criado_em DESC LIMIT ? OFFSET ?';
    params.push(Number(limit) || 100);
    params.push(Number(offset) || 0);

    const logs = db.prepare(sql).all.apply(db.prepare(sql), params);
    const total = db.prepare('SELECT COUNT(*) as total FROM logs').get();
    res.json({ logs: logs, total: total.total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ BACKUPS ============

// Listar backups
router.get('/backups', authMiddleware, requirePerfil('admin', 'gerente'), (req, res) => {
  try {
    const backups = db.prepare('SELECT * FROM backups ORDER BY criado_em DESC LIMIT 20').all();
    res.json(backups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fazer backup manual
router.post('/backups', authMiddleware, requirePerfil('admin'), (req, res) => {
  try {
    const { dbWrapper } = require('../models/database');
    dbWrapper.fazerBackup();
    registrarLog(null, null, 'backup_manual', 'sistema', 'Backup manual realizado', req.ip);
    res.json({ message: 'Backup realizado com sucesso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status do backup externo (ultima execucao + alerta se >1 dia sem sucesso)
router.get('/backups/status', authMiddleware, (req, res, next) => {
  try {
    try { db.prepare("SELECT 1 FROM backups_externos LIMIT 1").get(); }
    catch (e) { return res.json({ ultimo: null, dias_sem_backup: null, status: 'nunca', alerta: true }); }

    const ultimo = db.prepare('SELECT arquivo, destino, tamanho, sucesso, mensagem, criado_em FROM backups_externos ORDER BY id DESC LIMIT 1').get();
    const ultimoOk = db.prepare('SELECT criado_em FROM backups_externos WHERE sucesso = 1 ORDER BY id DESC LIMIT 1').get();

    let diasSemBackup = null;
    let status = 'nunca';
    let alerta = true;

    if (ultimoOk && ultimoOk.criado_em) {
      const horas = (Date.now() - new Date(ultimoOk.criado_em + 'Z').getTime()) / (1000 * 60 * 60);
      diasSemBackup = Number((horas / 24).toFixed(2));
      if (horas <= 24) { status = 'ok'; alerta = false; }
      else if (horas <= 48) { status = 'atrasado'; alerta = true; }
      else { status = 'critico'; alerta = true; }
    }

    res.json({
      ultimo: ultimo || null,
      ultimo_sucesso: ultimoOk || null,
      dias_sem_backup: diasSemBackup,
      status: status,
      alerta: alerta,
    });
  } catch (e) { next(e); }
});

// Exportar funcao de log para usar em outras rotas
router.registrarLog = registrarLog;

module.exports = router;
