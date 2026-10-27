const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const wishlistsCollection = () => getDB().collection('wishlists');
const scholarshipsCollection = () => getDB().collection('scholarships');

const getMyWishlist = async (req, res) => {
    const email = req.decoded.email;

    try {
        const entries = await wishlistsCollection().find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
        const ids = entries.filter((entry) => ObjectId.isValid(entry.scholarshipId)).map((entry) => new ObjectId(entry.scholarshipId));
        const scholarships = ids.length
            ? await scholarshipsCollection().find({ _id: { $in: ids } }).toArray()
            : [];
        const byId = new Map(scholarships.map((scholarship) => [String(scholarship._id), scholarship]));

        res.send(entries.map((entry) => ({
            _id: entry._id,
            scholarshipId: entry.scholarshipId,
            createdAt: entry.createdAt,
            scholarship: byId.get(entry.scholarshipId) || null,
        })));
    } catch (error) {
        res.status(500).send({ message: 'Failed to load wishlist' });
    }
};

const addToWishlist = async (req, res) => {
    const scholarshipId = req.body?.scholarshipId;

    if (!ObjectId.isValid(scholarshipId)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    try {
        const scholarship = await scholarshipsCollection().findOne({ _id: new ObjectId(scholarshipId) });
        if (!scholarship) {
            return res.status(404).send({ message: 'Scholarship not found' });
        }

        const result = await wishlistsCollection().updateOne(
            { userEmail: req.decoded.email, scholarshipId: String(scholarshipId) },
            { $setOnInsert: { userEmail: req.decoded.email, scholarshipId: String(scholarshipId), createdAt: new Date().toISOString() } },
            { upsert: true }
        );
        res.send(result);
    } catch (error) {
        if (error?.code === 11000) {
            return res.send({ message: 'Already saved' });
        }
        res.status(500).send({ message: 'Failed to save scholarship' });
    }
};

const removeFromWishlist = async (req, res) => {
    const scholarshipId = req.params.scholarshipId;

    if (!ObjectId.isValid(scholarshipId)) {
        return res.status(400).send({ message: 'Invalid scholarship id' });
    }

    try {
        const result = await wishlistsCollection().deleteOne({ userEmail: req.decoded.email, scholarshipId: String(scholarshipId) });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: 'Failed to remove scholarship' });
    }
};

module.exports = { getMyWishlist, addToWishlist, removeFromWishlist };
