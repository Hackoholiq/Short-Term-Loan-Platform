const Loan = require('../models/Loan');

// Apply for a loan
exports.applyForLoan = async (req, res) => {
  const { loan_amount, interest_rate, duration, repayment_date } = req.body;

  try {
    const loan = new Loan({
      user_id: req.user.id, // Assuming user is authenticated
      loan_amount,
      interest_rate,
      duration,
      repayment_date
    });

    await loan.save();
    res.status(201).json(loan);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Get all loans for a user
exports.getLoansByUser = async (req, res) => {
  try {
    const loans = await Loan.find({ user_id: req.user.id });
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// Admin functionality to approve/reject loan
exports.updateLoanStatus = async (req, res) => {
  const { loan_id, status } = req.body;

  try {
    const loan = await Loan.findById(loan_id);
    if (!loan) return res.status(404).json({ msg: 'Loan not found' });

    loan.status = status;
    await loan.save();

    res.json(loan);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
