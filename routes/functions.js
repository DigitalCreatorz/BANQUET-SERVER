const express = require('express');
const router = express.Router();
const { addFunction, editFunction, deleteFunction, getUserFunctions } = require('../controllers/functionsController'); // Ensure all functions are imported

// Route to add function
router.post('/functions/add', addFunction);

// Route to edit a function
router.put('/functions/edit/:functionId', editFunction);

// Route to delete a function
router.delete('/functions/delete/:functionId', deleteFunction);

// Route to get functions for a specific user
router.get('/:userId', getUserFunctions);

module.exports = router;
