// const express = require('express');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const { Pool } = require('pg');
// const companyRoutes = require('./routes/companyRoutes');
// const functionRoutes = require('./routes/functions');
// const mealTypeRoutes = require('./routes/mealTypeRoutes');

// const app = express();

// // Configure the pool
// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'banquet',
//   password: 'norvel1',
//   port: 5432,
// });

// app.use(bodyParser.json());
// app.use(cors());

// app.use('/api', companyRoutes);
// app.use('/api/companies', companyRoutes);
// app.use('/api/function', functionRoutes);
// app.use('/api/mealtypes', mealTypeRoutes);

// app.post('/api/banquet-slots', async (req, res) => {
//     const { company_id, user_id, banquet_slots } = req.body;
//     console.log('Received data:', { company_id, user_id, banquet_slots });
  
//     if (!company_id || !user_id || user_id.trim() === '' || !banquet_slots || Object.keys(banquet_slots).length === 0) {
//       return res.status(400).json({ error: 'Company ID, user ID, and banquet slots are required' });
//     }
  
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');
  
//       // First, verify that the company exists and get its banquet halls
//       const companyResult = await client.query(
//         'SELECT banquet_halls FROM companies WHERE id = $1',
//         [company_id]
//       );
  
//       if (companyResult.rows.length === 0) {
//         throw new Error('Company not found');
//       }
  
//       const existingBanquetHalls = companyResult.rows[0].banquet_halls || [];
//       const validBanquetNames = existingBanquetHalls.map(hall => hall.name || '').filter(Boolean);
  
//       console.log('Valid banquet names:', validBanquetNames);
  
//       // Delete existing time slots for this company and user
//       await client.query(
//         'DELETE FROM banquet_time_slots WHERE company_id = $1 AND user_id = $2',
//         [company_id, user_id]
//       );
  
//       // Prepare all values for a single insert
//       const values = [];
//       const valuePlaceholders = [];
//       let valueIndex = 1;
  
//       Object.entries(banquet_slots).forEach(([banquetName, slots]) => {
//         console.log(`Processing ${banquetName}:`, slots);
//         // Only process slots for valid banquet halls
//         if (validBanquetNames.includes(banquetName)) {
//           slots.forEach(slot => {
//             if (slot) { // Only insert non-empty slots
//               values.push(company_id, user_id, JSON.stringify({ name: banquetName }), slot.toString());
//               valuePlaceholders.push(
//                 `($${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}::json, $${valueIndex + 3})`
//               );
//               valueIndex += 4;
//             }
//           });
//         } else {
//           console.log(`Skipping invalid banquet name: ${banquetName}`);
//         }
//       });
  
//       console.log('Prepared values:', values);
//       console.log('Value placeholders:', valuePlaceholders);
  
//       if (values.length > 0) {
//         // Insert all new time slots in a single query
//         const insertQuery = `
//           INSERT INTO banquet_time_slots (company_id, user_id, banquet_halls, time_slot)
//           VALUES ${valuePlaceholders.join(', ')}
//         `;
//         await client.query(insertQuery, values);
//       }
  
//       await client.query('COMMIT');
  
//       res.status(200).json({ message: 'Banquet time slots updated successfully' });
//     } catch (error) {
//       await client.query('ROLLBACK');
//       console.error('Error updating banquet time slots:', error);
//       res.status(500).json({ error: 'An error occurred while updating banquet time slots', details: error.message });
//     } finally {
//       client.release();
//     }
//   });

// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));












// const express = require('express');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const { Pool } = require('pg');
// const companyRoutes = require('./routes/companyRoutes');
// const functionRoutes = require('./routes/functions');
// const mealTypeRoutes = require('./routes/mealTypeRoutes');

// const app = express();

// // Configure the pool
// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'banquet',
//   password: 'norvel1',
//   port: 5432,
// });

// app.use(bodyParser.json());
// app.use(cors());

// app.use('/api', companyRoutes);
// app.use('/api/companies', companyRoutes);
// app.use('/api/function', functionRoutes);
// app.use('/api/mealtypes', mealTypeRoutes);

// app.post('/api/banquet-slots', async (req, res) => {
//   const { company_id, user_id, banquet_slots } = req.body;
  
//   console.log('Received data:', { company_id, user_id, banquet_slots });
  
//   if (!company_id || !user_id || user_id.trim() === '' || !banquet_slots || Object.keys(banquet_slots).length === 0) {
//     return res.status(400).json({ error: 'Company ID, user ID, and banquet slots are required' });
//   }

//   // Check each banquet hall individually for maximum 4 slots
//   for (const [banquetName, slots] of Object.entries(banquet_slots)) {
//     const validSlots = slots.filter(slot => slot && slot.trim() !== '');
//     if (validSlots.length > 4) {
//       return res.status(400).json({ 
//         error: `Banquet hall "${banquetName}" has more than 4 time slots. Maximum 4 slots allowed per hall.` 
//       });
//     }
//   }

  
//     const client = await pool.connect();
//     try {
//       await client.query('BEGIN');
  
//       // Verify company exists and get banquet halls
//       const companyResult = await client.query(
//         'SELECT banquet_halls FROM companies WHERE id = $1',
//         [company_id]
//       );
  
//       if (companyResult.rows.length === 0) {
//         throw new Error('Company not found');
//       }
  
//       const existingBanquetHalls = companyResult.rows[0].banquet_halls || [];
//       const validBanquetNames = existingBanquetHalls.map(hall => hall.name || '').filter(Boolean);
  
//       // Delete existing time slots
//       await client.query(
//         'DELETE FROM banquet_time_slots WHERE company_id = $1 AND user_id = $2',
//         [company_id, user_id]
//       );
  
//       // Prepare values for insert
//       const values = [];
//       const valuePlaceholders = [];
//       let valueIndex = 1;
  
//       Object.entries(banquet_slots).forEach(([banquetName, slots]) => {
//         if (validBanquetNames.includes(banquetName)) {
//           slots.forEach(slot => {
//             if (slot && slot.trim() !== '') {
//               values.push(company_id, user_id, JSON.stringify({ name: banquetName }), slot.toString());
//               valuePlaceholders.push(
//                 `($${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}::json, $${valueIndex + 3})`
//               );
//               valueIndex += 4;
//             }
//           });
//         }
//       });
  
//       if (values.length > 0) {
//         const insertQuery = `
//           INSERT INTO banquet_time_slots (company_id, user_id, banquet_halls, time_slot)
//           VALUES ${valuePlaceholders.join(', ')}
//         `;
//         await client.query(insertQuery, values);
//       }
  
//       await client.query('COMMIT');
//     res.status(200).json({ message: 'Banquet time slots updated successfully' });
//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Error updating banquet time slots:', error);
//     res.status(500).json({ 
//       error: 'An error occurred while updating banquet time slots', 
//       details: error.message 
//     });
//   } finally {
//     client.release();
//   }
// });

// const PORT = process.env.PORT || 3001;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));










const express = require('express');const bodyParser = require('body-parser');const cors = require('cors');
require('dotenv').config();
const { Pool } = require('pg');const companyRoutes = require('./routes/companyRoutes');
const functionRoutes = require('./routes/functions');const mealTypeRoutes = require('./routes/mealTypeRoutes');

const app = express();

// Configure the pool
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,});

app.use(bodyParser.json());
app.use(cors());

app.use('/api', companyRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/function', functionRoutes);
app.use('/api/mealtypes', mealTypeRoutes);

app.post('/api/banquet-slots', async (req, res) => {
  const { company_id, user_id, banquet_slots } = req.body;
  
  console.log('Received data:', { company_id, user_id, banquet_slots });
  
  if (!company_id || !user_id || user_id.trim() === '' || !banquet_slots || Object.keys(banquet_slots).length === 0) {
    return res.status(400).json({ error: 'Company ID, user ID, and banquet slots are required' });}

  // Check each banquet hall individually for maximum 4 slots
  for (const [banquetName, slots] of Object.entries(banquet_slots)) {
    const validSlots = slots.filter(slot => slot && slot.trim() !== '');
    if (validSlots.length > 4) {
      return res.status(400).json({ 
        error: `Banquet hall "${banquetName}" has more than 4 time slots. Maximum 4 slots allowed per hall.` });}}
  
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
  
      // Verify company exists and get banquet halls
      const companyResult = await client.query(
        'SELECT banquet_halls FROM companies WHERE id = $1',
        [company_id]
      );
  
      if (companyResult.rows.length === 0) {
        throw new Error('Company not found');
      }
  
      const existingBanquetHalls = companyResult.rows[0].banquet_halls || [];
      const validBanquetNames = existingBanquetHalls.map(hall => hall.name || '').filter(Boolean);
  
      // Delete existing time slots
      await client.query(
        'DELETE FROM banquet_time_slots WHERE company_id = $1 AND user_id = $2',
        [company_id, user_id]);
  
      // Prepare values for insert
      const values = [];
      const valuePlaceholders = [];
      let valueIndex = 1;
  
      Object.entries(banquet_slots).forEach(([banquetName, slots]) => {
        if (validBanquetNames.includes(banquetName)) {
          slots.forEach(slot => {
            if (slot && slot.trim() !== '') {
              values.push(company_id, user_id, JSON.stringify({ name: banquetName }), slot.toString());
              valuePlaceholders.push(
                `($${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}::json, $${valueIndex + 3})`);
              valueIndex += 4;}});}});
  
      if (values.length > 0) {
        const insertQuery = `
          INSERT INTO banquet_time_slots (company_id, user_id, banquet_halls, time_slot)
          VALUES ${valuePlaceholders.join(', ')}
        `;
        await client.query(insertQuery, values);
      }
  
      await client.query('COMMIT');
    res.status(200).json({ message: 'Banquet time slots updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating banquet time slots:', error);
    res.status(500).json({ 
      error: 'An error occurred while updating banquet time slots', 
      details: error.message });
  } finally {
    client.release();}});
app.get('/api/companies/time-slots', async (req, res) => {
  const { company_id } = req.query;

  if (!company_id) {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  const client = await pool.connect();

  try {
    const query = `
      SELECT bts.banquet_halls->>'name' as banquet_name, bts.time_slot
      FROM banquet_time_slots bts
      WHERE bts.company_id = $1
    `;
    
    const result = await client.query(query, [company_id]);
    
    // Transform the results into a map of banquet names to time slots
    const timeSlots = {};
    result.rows.forEach(row => {
      if (!timeSlots[row.banquet_name]) {
        timeSlots[row.banquet_name] = [];}
      timeSlots[row.banquet_name].push(row.time_slot);});

    res.json(timeSlots);
  } catch (error) {
    console.error('Error fetching time slots:', error);
    res.status(500).json({
      error: 'An error occurred while fetching time slots',
      details: error.message});
  } finally {
    client.release();}});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));