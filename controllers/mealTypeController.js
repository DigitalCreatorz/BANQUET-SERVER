// const pool = require('../db');

// // Add a meal type
// const addMealType = async (req, res) => {
//     console.log('Request Body:', req.body); 
//     // const { meal_type_name, user_id, company_id } = req.body;
//     const { meal_type_name, user_id, company_id } = req.body;
//     if (!user_id || !company_id) {
//         return res.status(400).json({ error: 'User ID and Company ID are required' });
//       }
  
//     try {
//       const result = await pool.query(
//         'INSERT INTO meal_types (meal_type_name, user_id, company_id) VALUES ($1, $2, $3) RETURNING *',
//         [meal_type_name, user_id, company_id]
//       );
//       res.status(200).json({ mealType: result.rows[0] });
//     } catch (error) {
//       res.status(500).json({ error: 'Failed to add meal type: ' + error.message });
//     }
//   };
  

// // Get meal types for a specific user
// const getUserMealTypes = async (req, res) => {
//   const { userId } = req.params;

//   try {
//     const result = await pool.query(
//       'SELECT * FROM meal_types WHERE user_id = $1',
//       [userId]
//     );
//     res.status(200).json({ mealTypes: result.rows });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to get meal types: ' + error.message });
//   }
// };

// module.exports = { addMealType, getUserMealTypes };
require('dotenv').config();
const pool = require('../db');

// Add a meal type
const addMealType = async (req, res) => {
  const { meal_type_name, user_id, company_id } = req.body;
  
  if (!user_id || !company_id) {
    return res.status(400).json({ error: 'User ID and Company ID are required' });
  }
  
  try {
    // Check if meal type already exists for this user
    const existingMeal = await pool.query(
      'SELECT * FROM meal_types WHERE LOWER(meal_type_name) = LOWER($1) AND user_id = $2',
      [meal_type_name, user_id]
    );
    
    if (existingMeal.rows.length > 0) {
      return res.status(400).json({ error: 'Meal type already exists for this user' });
    }
    
    const result = await pool.query(
      'INSERT INTO meal_types (meal_type_name, user_id, company_id) VALUES ($1, $2, $3) RETURNING *',
      [meal_type_name, user_id, company_id]
    );
    res.status(200).json({ mealType: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add meal type: ' + error.message });
  }
};

// Update a meal type
const updateMealType = async (req, res) => {
  const { id } = req.params;
  const { meal_type_name, user_id } = req.body;
  
  try {
    // Check if new name already exists for this user (excluding current meal type)
    const existingMeal = await pool.query(
      'SELECT * FROM meal_types WHERE LOWER(meal_type_name) = LOWER($1) AND user_id = $2 AND id != $3',
      [meal_type_name, user_id, id]
    );
    
    if (existingMeal.rows.length > 0) {
      return res.status(400).json({ error: 'Meal type name already exists' });
    }
    
    const result = await pool.query(
      'UPDATE meal_types SET meal_type_name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [meal_type_name, id, user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal type not found or unauthorized' });
    }
    
    res.status(200).json({ mealType: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meal type: ' + error.message });
  }
};

// Delete a meal type
const deleteMealType = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;
  
  try {
    const result = await pool.query(
      'DELETE FROM meal_types WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, user_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal type not found or unauthorized' });
    }
    
    res.status(200).json({ message: 'Meal type deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete meal type: ' + error.message });
  }
};

const getUserMealTypes = async (req, res) => {
  const { userId } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM meal_types WHERE user_id = $1',
      [userId]
    );
    res.status(200).json({ mealTypes: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get meal types: ' + error.message });
  }
};

module.exports = {
  addMealType,
  updateMealType,
  deleteMealType,
  getUserMealTypes
};