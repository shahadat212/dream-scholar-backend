require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const getMongoUri = require('../config/mongoUri');

const client = new MongoClient(getMongoUri(), {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

const scholarships = [
    {
        scholarshipName: "Global Excellence Scholarship",
        universityName: "University of Toronto",
        universityImage: "https://ui-avatars.com/api/?name=UT&background=5B4CFB&color=fff",
        universityCity: "Toronto",
        universityCountry: "Canada",
        universityRank: 21,
        subjectCategory: "Computer Science",
        scholarshipCategory: "Full fund",
        tuitionFees: 12000,
        applicationFees: 50,
        serviceCharge: 10,
        applicationDeadline: "2026-11-15",
        scholarshipPostDate: "2026-06-01",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.8,
    },
    {
        scholarshipName: "STEM Futures Award",
        universityName: "Technical University of Munich",
        universityImage: "https://ui-avatars.com/api/?name=TUM&background=FF6B57&color=fff",
        universityCity: "Munich",
        universityCountry: "Germany",
        universityRank: 37,
        subjectCategory: "Mechanical Engineering",
        scholarshipCategory: "Partial fund",
        tuitionFees: 8000,
        applicationFees: 40,
        serviceCharge: 8,
        applicationDeadline: "2026-10-01",
        scholarshipPostDate: "2026-05-20",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.6,
    },
    {
        scholarshipName: "Business Leaders Grant",
        universityName: "National University of Singapore",
        universityImage: "https://ui-avatars.com/api/?name=NUS&background=FFC145&color=14141F",
        universityCity: "Singapore",
        universityCountry: "Singapore",
        universityRank: 11,
        subjectCategory: "Business Administration",
        scholarshipCategory: "Full fund",
        tuitionFees: 15000,
        applicationFees: 60,
        serviceCharge: 12,
        applicationDeadline: "2026-12-01",
        scholarshipPostDate: "2026-06-10",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.9,
    },
    {
        scholarshipName: "Health Sciences Bursary",
        universityName: "University of Melbourne",
        universityImage: "https://ui-avatars.com/api/?name=UM&background=5B4CFB&color=fff",
        universityCity: "Melbourne",
        universityCountry: "Australia",
        universityRank: 33,
        subjectCategory: "Public Health",
        scholarshipCategory: "Partial fund",
        tuitionFees: 9500,
        applicationFees: 45,
        serviceCharge: 9,
        applicationDeadline: "2026-09-20",
        scholarshipPostDate: "2026-05-05",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.5,
    },
    {
        scholarshipName: "Creative Arts Fellowship",
        universityName: "University of Edinburgh",
        universityImage: "https://ui-avatars.com/api/?name=UE&background=FF6B57&color=fff",
        universityCity: "Edinburgh",
        universityCountry: "United Kingdom",
        universityRank: 27,
        subjectCategory: "Fine Arts",
        scholarshipCategory: "Self-fund",
        tuitionFees: 7000,
        applicationFees: 30,
        serviceCharge: 6,
        applicationDeadline: "2026-11-30",
        scholarshipPostDate: "2026-06-18",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.4,
    },
    {
        scholarshipName: "Environmental Sciences Scholarship",
        universityName: "ETH Zurich",
        universityImage: "https://ui-avatars.com/api/?name=ETH&background=FFC145&color=14141F",
        universityCity: "Zurich",
        universityCountry: "Switzerland",
        universityRank: 8,
        subjectCategory: "Environmental Science",
        scholarshipCategory: "Full fund",
        tuitionFees: 13500,
        applicationFees: 55,
        serviceCharge: 11,
        applicationDeadline: "2026-10-25",
        scholarshipPostDate: "2026-06-02",
        postedEmail: "admin@dreamscholarhub.com",
        rating: 4.7,
    },
];

const users = [
    {
        name: "Admin",
        email: "admin@dreamscholarhub.com",
        role: "admin",
        photoURL: "https://ui-avatars.com/api/?name=Admin&background=14141F&color=fff",
    },
    {
        name: "Moderator",
        email: "moderator@dreamscholarhub.com",
        role: "moderator",
        photoURL: "https://ui-avatars.com/api/?name=Moderator&background=5B4CFB&color=fff",
    },
];

const seed = async () => {
    try {
        await client.connect();
        const db = client.db('scholarDB');

        const scholarshipsCollection = db.collection('scholarships');
        const usersCollection = db.collection('users');

        const scholarshipCount = await scholarshipsCollection.countDocuments();
        if (scholarshipCount === 0) {
            await scholarshipsCollection.insertMany(scholarships);
            console.log(`Inserted ${scholarships.length} scholarships.`);
        } else {
            console.log('Scholarships collection already has data - skipped.');
        }

        for (const user of users) {
            const existing = await usersCollection.findOne({ email: user.email });
            if (!existing) {
                await usersCollection.insertOne(user);
                console.log(`Inserted user ${user.email}.`);
            } else {
                console.log(`User ${user.email} already exists - skipped.`);
            }
        }

        console.log('Seeding complete.');
    } catch (error) {
        console.error('Seeding failed:', error.message);
    } finally {
        await client.close();
    }
};

seed();
