require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const scholarshipRoutes = require('./routes/scholarship.routes');
const applicationRoutes = require('./routes/application.routes');
const reviewRoutes = require('./routes/review.routes');
const paymentRoutes = require('./routes/payment.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const notificationRoutes = require('./routes/notification.routes');
const activityRoutes = require('./routes/activity.routes');

const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        res.status(503).send({ message: 'The database is not available right now. Please try again shortly.' });
    }
});

app.use('/', authRoutes);
app.use('/users', userRoutes);
app.use('/scholarships', scholarshipRoutes);
app.use('/applications', applicationRoutes);
app.use('/reviews', reviewRoutes);
app.use('/payments', paymentRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/notifications', notificationRoutes);
app.use('/activity', activityRoutes);

app.get('/', (req, res) => {
    res.send('Dream Scholar Hub API');
});

app.use((req, res) => {
    res.status(404).send({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send({ message: 'Something went wrong on the server' });
});

if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(port, () => {
                console.log(`Server running on port: ${port}`);
            });
        })
        .catch((error) => {
            console.error('Failed to connect to the database:', error.message);
            process.exit(1);
        });
}

module.exports = app;
