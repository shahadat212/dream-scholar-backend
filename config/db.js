const { MongoClient, ServerApiVersion } = require('mongodb');
const getMongoUri = require('./mongoUri');

const client = new MongoClient(getMongoUri(), {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db;
let connecting;

const ensureIndexes = async (database) => {
    const indexes = [
        { collection: 'users', keys: { email: 1 }, options: { unique: true, name: 'unique_user_email' } },
        { collection: 'applications', keys: { userEmail: 1, scholarShipId: 1 }, options: { unique: true, name: 'unique_application_per_scholarship' } },
        { collection: 'wishlists', keys: { userEmail: 1, scholarshipId: 1 }, options: { unique: true, name: 'unique_wishlist_entry' } },
        { collection: 'notifications', keys: { userEmail: 1, createdAt: -1 }, options: { name: 'notifications_by_user' } },
        { collection: 'activityLogs', keys: { createdAt: -1 }, options: { name: 'activity_by_date' } },
        { collection: 'payments', keys: { transactionId: 1 }, options: { unique: true, name: 'unique_payment_transaction' } },
    ];

    for (const { collection, keys, options } of indexes) {
        try {
            await database.collection(collection).createIndex(keys, options);
        } catch (error) {
            console.error(`Could not create index ${options.name} on ${collection}. Remove duplicate documents and restart. ${error.message}`);
        }
    }
};

const connectDB = async () => {
    if (db) return db;
    if (!connecting) {
        connecting = (async () => {
            await client.connect();
            const database = client.db('scholarDB');
            console.log('Connected to MongoDB');
            await ensureIndexes(database);
            db = database;
            return db;
        })().catch((error) => {
            connecting = null;
            throw error;
        });
    }
    return connecting;
};

const getDB = () => {
    if (!db) {
        throw new Error('Database not connected yet. Call connectDB() before handling requests.');
    }
    return db;
};

module.exports = { connectDB, getDB };
