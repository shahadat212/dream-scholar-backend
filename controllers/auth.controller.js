const jwt = require('jsonwebtoken');

const issueToken = (req, res) => {
    const user = req.body;

    if (!user?.email) {
        return res.status(400).send({ message: 'Email is required' });
    }

    const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '2h' });
    res.send({ token });
};

module.exports = { issueToken };
