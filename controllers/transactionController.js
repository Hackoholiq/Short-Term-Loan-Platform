const Transaction = require('../models/Transaction');

// Record a transaction
exports.recordTransaction = async (req, res) => {
  const { loan_id, amount, transaction_type } = req.body;

  try {
    const transaction = new Transaction({
      loan_id,
      user_id: req.user.id, // assuming user is authenticated
      amount,
      transaction_type
    });

    await transaction.save();

    res.status(201).json(transaction);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get all transactions for a user
exports.getTransactionsByUser = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.user.id });
    res.json(transactions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
