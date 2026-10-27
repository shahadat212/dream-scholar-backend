const getMongoUri = () => {
    if (process.env.MONGODB_URI) {
        return process.env.MONGODB_URI;
    }

    const { DB_USER, DB_PASS, DB_HOST } = process.env;
    if (!DB_USER || !DB_PASS || !DB_HOST) {
        throw new Error('Set MONGODB_URI, or DB_USER, DB_PASS and DB_HOST, in your .env file');
    }

    return `mongodb+srv://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${DB_HOST}/?retryWrites=true&w=majority`;
};

module.exports = getMongoUri;
