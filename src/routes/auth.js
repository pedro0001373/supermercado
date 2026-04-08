const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Login
router.post('/login', (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({ error: 'Login e senha são obrigatórios' });

    const usuario = db.prepare(`SELECT id, nome, login, perfil, ativo FROM usuarios WHERE login = ? AND senha = ?`).get(login, senha);
    if (!usuario) return res.status(401).json({ error: 'Login ou senha incorretos' });
    if (!usuario.ativo) return res.status(401).json({ error: 'Usuário desativado' });

    res.json({ usuario });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar usuários
router.get('/usuarios', (req, res) => {
  try {
    const usuarios = db.prepare(`SELECT id, nome, login, perfil, ativo, criado_em FROM usuarios ORDER BY nome`).all();
    res.json(usuarios);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Criar usuário
router.post('/usuarios', (req, res) => {
  try {
    const { nome, login, senha, perfil } = req.body;
    if (!nome || !login || !senha) return res.status(400).json({ error: 'Nome, login e senha são obrigatórios' });

    const result = db.prepare(`INSERT INTO usuarios (nome, login, senha, perfil) VALUES (?, ?, ?, ?)`)
      .run(nome, login, senha, perfil || 'operador');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Usuário criado' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Login já existe' });
    res.status(500).json({ error: e.message });
  }
});

// Atualizar usuário
router.put('/usuarios/:id', (req, res) => {
  try {
    const { nome, login, senha, perfil, ativo } = req.body;
    if (senha) {
      db.prepare(`UPDATE usuarios SET nome=?, login=?, senha=?, perfil=?, ativo=? WHERE id=?`)
        .run(nome, login, senha, perfil || 'operador', ativo !== undefined ? ativo : 1, req.params.id);
    } else {
      db.prepare(`UPDATE usuarios SET nome=?, login=?, perfil=?, ativo=? WHERE id=?`)
        .run(nome, login, perfil || 'operador', ativo !== undefined ? ativo : 1, req.params.id);
    }
    res.json({ message: 'Usuário atualizado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
