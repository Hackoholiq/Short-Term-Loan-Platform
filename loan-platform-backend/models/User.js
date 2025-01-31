const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  date_of_birth: { type: Date, required: true },
  user_type: { type: String, enum: ["borrower", "admin"], default: "borrower" },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
