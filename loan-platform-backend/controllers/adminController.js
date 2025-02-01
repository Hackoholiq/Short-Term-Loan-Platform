const Loan = require('../models/Loan');
const User = require('../models/User');

// Get all loans
exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find();
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Approve or reject a loan
exports.approveLoan = async (req, res) => {
  try {
    const { status } = req.body;
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ msg: 'Loan not found' });
    }

    loan.status = status;
    await loan.save();

    res.json(loan);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Promote user to Admin
exports.promoteToAdmin = async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
  
      user.user_type = 'admin';
      await user.save();
  
      res.json(user);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  };