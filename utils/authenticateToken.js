const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    //console.log('Authorization Header:', authHeader || 'None provided');

    if (!authHeader) {
        console.warn('Authorization header is missing');
        return res.status(401).json({ message: 'Authorization token is missing' });
    }

    const token = authHeader.split(' ')[1];
    //console.log('Extracted Token:', token || 'None extracted');

    if (!token) {
        console.warn('Token is missing in the authorization header');
        return res.status(401).json({ message: 'Token is missing' });
    }

    // Check if the token is malformed
    if (token.split('.').length !== 3) {
        console.warn('Malformed token:', token);
        return res.status(400).json({ message: 'Malformed token' });
    }

    const secretKey = process.env.JWT_SECRET_KEY;
    //console.log(secretKey)
    if (!secretKey) {
        console.error('JWT secret key is not set');
        return res.status(500).json({ message: 'Internal server error' });
    }

    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err.message, 'Token:', token);
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Token has expired' });
            }
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        req.user = user; // Attach the decoded user information to the request
        next();
    });
};

module.exports = { authenticateToken };
