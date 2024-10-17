// const express = require('express');
// const router = express.Router();
// const { addMealType, getUserMealTypes } = require('../controllers/mealTypeController');

// // Route to add a meal type
// router.post('/add', addMealType);

// // Route to get meal types for a specific user
// router.get('/:userId', getUserMealTypes);

// module.exports = router;
const express = require('express');
const router = express.Router();
const {
  addMealType,
  updateMealType,
  deleteMealType,
  getUserMealTypes
} = require('../controllers/mealTypeController');

router.post('/add', addMealType);
router.put('/:id', updateMealType);
router.delete('/:id', deleteMealType);
router.get('/:userId', getUserMealTypes);

module.exports = router;