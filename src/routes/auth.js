const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/db');

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

    // Atualizar ultimo acesso
    db.prepare('UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?').run(usuario.id);
    registrarLog(usuario.id, usuario.nome, 'login', 'auth', 'Login realizado com sucesso', req.ip);

    res.json({ usuario: { id: usuario.id, nome: usuario.nome, login: usuario.login, perfil: usuario.perfil, ativo: usuario.ativo } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar usuarios
router.get('/usuarios', (req, res) => {
  try {
    const usuarios = db.prepare('SELECT id, nome, login, perfil, ativo, ultimo_acesso, criado_em FROM usuarios ORDER BY nome').all();
    res.json(usuarios);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Criar usuario
router.post('/usuarios', (req, res) => {
  try {
    const { nome, login, senha, perfil } = req.body;
    if (!nome || !login || !senha) return res.status(400).json({ error: 'Nome, login e senha sao obrigatorios' });
    if (senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no minimo 4 caracteres' });

    const hash = bcrypt.hashSync(senha, 10);
    const result = db.prepare('INSERT INTO usuarios (nome, login, senha, perfil) VALUES (?, ?, ?, ?)')
      .run(nome, login, hash, perfil || 'operador');

    registrarLog(null, null, 'criar_usuario', 'usuarios', 'Criou usuario: ' + login + ' (' + (perfil || 'operador') + ')', req.ip);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Usuario criado' });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Login ja existe' });
    res.status(500).json({ error: e.message });
  }
});

// Atualizar usuario
router.put('/usuarios/:id', (req, res) => {
  try {
    const { nome, login, senha, perfil, ativo } = req.body;
    if (senha) {
      if (senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no minimo 4 caracteres' });
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
    res.status(500).json({ error: e.message });
  }
});

// Resetar senha (admin pode resetar senha de qualquer usuario)
router.post('/usuarios/:id/reset-senha', (req, res) => {
  try {
    const { nova_senha } = req.body;
    if (!nova_senha) return res.status(400).json({ error: 'Nova senha e obrigatoria' });
    if (nova_senha.length < 4) return res.status(400).json({ error: 'Senha deve ter no minimo 4 caracteres' });

    const usuario = db.prepare('SELECT id, nome, login FROM usuarios WHERE id = ?').get(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const hash = bcrypt.hashSync(nova_senha, 10);
    db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').run(hash, req.params.id);

    registrarLog(null, null, 'reset_senha', 'usuarios', 'Senha resetada do usuario: ' + usuario.login, req.ip);
    res.json({ message: 'Senha resetada com sucesso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Alterar propria senha
router.post('/alterar-senha', (req, res) => {
  try {
    const { usuario_id, senha_atual, nova_senha } = req.body;
    if (!usuario_id || !senha_atual || !nova_senha) return res.status(400).json({ error: 'Todos os campos sao obrigatorios' });
    if (nova_senha.length < 4) return res.status(400).json({ error: 'Nova senha deve ter no minimo 4 caracteres' });

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
    res.status(500).json({ error: e.message });
  }
});

// ============ LOGS DE AUDITORIA ============

// Listar logs
router.get('/logs', (req, res) => {
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
router.get('/backups', (req, res) => {
  try {
    const backups = db.prepare('SELECT * FROM backups ORDER BY criado_em DESC LIMIT 20').all();
    res.json(backups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fazer backup manual
router.post('/backups', (req, res) => {
  try {
    const { dbWrapper } = require('../models/database');
    dbWrapper.fazerBackup();
    registrarLog(null, null, 'backup_manual', 'sistema', 'Backup manual realizado', req.ip);
    res.json({ message: 'Backup realizado com sucesso' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exportar funcao de log para usar em outras rotas
router.registrarLog = registrarLog;

module.exports = router;
