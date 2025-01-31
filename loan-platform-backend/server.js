const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
require('dotenv').config();

const app = express();

// Connect to DB
connectDB();

// Middleware
app.use(express.json());

// Routes
app.use('/auth', authRoutes);

// Add loan routes
app.use('/loan', require('./routes/loan')); 

// Add transaction routes
app.use('/transaction', require('./routes/transaction')); 

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
