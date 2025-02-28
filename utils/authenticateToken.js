const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // Get the token from the cookies
    const token = req.cookies.token;
 //   console.log('Token from cookies:', token || 'None provided');

    // Check if the token is missing
    if (!token) {
        console.warn('Token is missing');
        return res.status(401).json({ message: 'Token is missing' });
    }

    // Check if the token is malformed
    if (token.split('.').length !== 3) {
        console.warn('Malformed token:', token);
        return res.status(400).json({ message: 'Malformed token' });
    }

    // Get the JWT secret key from environment variables
    const secretKey = process.env.JWT_SECRET_KEY;
    if (!secretKey) {
        console.error('JWT secret key is not set');
        return res.status(500).json({ message: 'Internal server error' });
    }

    // Verify the token
    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err.message, 'Token:', token);
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Token has expired' });
            }
            return res.status(403).json({ message: 'Invalid or expired token' });
        }

        // Attach the decoded user information to the request
        req.user = user;
        next();
    });
};

module.exports = { authenticateToken };