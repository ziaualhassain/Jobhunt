const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  // Accept token from Authorization header or ?token= query param (needed for EventSource/SSE)
  const auth = req.headers.authorization;
  const raw = auth?.startsWith('Bearer ') ? auth.slice(7) : (req.query.token ?? null);
  if (!raw) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(raw, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
