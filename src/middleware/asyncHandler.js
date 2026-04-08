// Wrapper para capturar erros em rotas Express e retornar JSON
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          console.error('Route error:', err.message);
          res.status(500).json({ error: err.message });
        });
      }
    } catch (err) {
      console.error('Route error:', err.message);
      res.status(500).json({ error: err.message });
    }
  };
};
