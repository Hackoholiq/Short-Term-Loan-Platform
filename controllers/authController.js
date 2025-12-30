const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const signToken = (user) => {
  // Put role into token so isAdmin can read it instantly
  return jwt.sign(
    { id: user.id, user_type: user.user_type },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Register User
exports.register = async (req, res) => {
  const { first_name, last_name, email, password, address, phone, date_of_birth } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);

    // IMPORTANT: match your model field name
    const password_hash = await bcrypt.hash(password, salt);

    user = new User({
      first_name,
      last_name,
      email,
      password_hash,
      address,
      phone,
      date_of_birth,
    });

    await user.save();

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Login User
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};