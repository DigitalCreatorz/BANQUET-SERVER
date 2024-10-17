require('dotenv').config();
const pool = require('../db');

const addFunction = async (req, res) => {
  console.log('Received add function request:', req.body);
  
  const { function_name, user_id, company_id } = req.body;
  
  if (!user_id || !company_id || !function_name) {
    console.log('Missing required fields:', { user_id, company_id, function_name });
    return res.status(400).json({ error: 'User ID, Company ID, and Function Name are required' });
  }

  try {
    // Check for duplicate function name
    const duplicateCheck = await pool.query(
      'SELECT * FROM functions WHERE function_name = $1 AND user_id = $2',
      [function_name, user_id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Function name already exists' });
    }

    const result = await pool.query(
      'INSERT INTO functions (function_name, user_id, company_id) VALUES ($1, $2, $3) RETURNING *',
      [function_name, user_id, company_id]
    );
    console.log('Successfully added function:', result.rows[0]);
    res.status(200).json({ function: result.rows[0] });
  } catch (error) {
    console.error('Error adding function:', error);
    res.status(500).json({ error: 'Failed to add function: ' + error.message });
  }
};

const editFunction = async (req, res) => {
  const { functionId } = req.params;
  const { function_name } = req.body;

  if (!functionId || !function_name) {
    return res.status(400).json({ error: 'Function ID and Function Name are required' });
  }

  try {
    const result = await pool.query(
      'UPDATE functions SET function_name = $1 WHERE id = $2 RETURNING *',
      [function_name, functionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    res.status(200).json({ function: result.rows[0] });
  } catch (error) {
    console.error('Error editing function:', error);
    res.status(500).json({ error: 'Failed to edit function: ' + error.message });
  }
};

const deleteFunction = async (req, res) => {
  const { functionId } = req.params;

  if (!functionId) {
    return res.status(400).json({ error: 'Function ID is required' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM functions WHERE id = $1',
      [functionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Function not found' });
    }

    res.status(204).send(); // No content to send back
  } catch (error) {
    console.error('Error deleting function:', error);
    res.status(500).json({ error: 'Failed to delete function: ' + error.message });
  }
};

const getUserFunctions = async (req, res) => {
  const { userId } = req.params;
  console.log('Fetching functions for user:', userId);
  
  if (!userId) {
    console.log('User ID is missing in request params');
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM functions WHERE user_id = $1',
      [userId]
    );
    console.log(`Found ${result.rows.length} functions for user ${userId}`);
    res.status(200).json({ functions: result.rows });
  } catch (error) {
    console.error('Error fetching functions:', error);
    res.status(500).json({ error: 'Failed to get functions: ' + error.message });
  }
};

module.exports = { addFunction, editFunction, deleteFunction, getUserFunctions };