const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  address: { type: String },
  phone: { type: String },
  date_of_birth: { type: Date },
  creditScore: { type: Number, default: 0 }, // Add creditScore field
  user_type: { type: String, enum: ['user', 'admin'], default: 'user' },
});

module.exports = mongoose.model('User', UserSchema);