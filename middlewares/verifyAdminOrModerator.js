const { getDB } = require('../config/db');

const verifyAdminOrModerator = async (req, res, next) => {
    const email = req.decoded?.email;
    if (!email) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    try {
        const usersCollection = getDB().collection('users');
        const user = await usersCollection.findOne({ email });

        if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
            return res.status(403).send({ message: 'Forbidden: admin or moderator access required' });
        }

        next();
    } catch (error) {
        res.status(500).send({ message: 'Could not verify access' });
    }
};

module.exports = verifyAdminOrModerator;
