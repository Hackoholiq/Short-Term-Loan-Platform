const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loan');
const adminRoutes = require('./routes/admin'); // Import admin routes
require('dotenv').config();

const app = express();

// Connect to DB
connectDB();

// Middleware
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/loan', loanRoutes);
app.use('/admin', adminRoutes); // Mount admin routes

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));