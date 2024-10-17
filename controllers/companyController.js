// // controllers/companyController.js
require('dotenv').config();
const pool = require('../db');
const bcrypt = require('bcrypt');

const createCompany = async (req, res) => {
  const {
    company_name, phone_number, owner_name, email, gst_no, alternate_phone, address,
    plan, user_id, password, city, area, banquet_halls,
  } = req.body;

  // Input validation (remove gst_no from required fields)
  if (!company_name || !phone_number || !owner_name || !email ||
      !address || !plan || !user_id || !password || !city || !area) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get the next company sequence
    const seqResult = await client.query('SELECT nextval(\'companies_company_sequence_seq\')');
    const companySequence = seqResult.rows[0].nextval;

    // Generate company code
    const company_code = `OR/${companySequence}`;

    // Calculate expiration date
    let expirationDate = new Date();
    switch (plan) {
      case '6months':
        expirationDate.setMonth(expirationDate.getMonth() + 6);
        break;
      case '1year':
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        break;
      case 'trial':
        expirationDate.setDate(expirationDate.getDate() + 3);
        break;
      default:
        return res.status(400).json({ error: 'Invalid plan' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Construct the base query and values
    let queryText = `
      INSERT INTO companies
      (company_name, phone_number, owner_name, email, alternate_phone, address, company_code,
       user_id, password, plan, expiration_date, company_sequence, city, area, banquet_halls
      `;
    let values = [
      company_name, phone_number, owner_name, email, alternate_phone,
      address, company_code, user_id, hashedPassword, plan, expirationDate,
      companySequence, city, area, JSON.stringify(banquet_halls),
    ];

    // Append gst_no to query and values if provided
    if (gst_no && gst_no.trim() !== "") {
      queryText += `, gst_no`;
      values.push(gst_no);
    }

    // Close the query
    queryText += `) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;

    const result = await client.query(queryText, values);
    await client.query('COMMIT');

    const { password: _, ...companyData } = result.rows[0];
    res.status(201).json(companyData);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating company:', error);
    res.status(500).json({
      error: 'An error occurred while creating the company',
      details: error.message
    });
  } finally {
    client.release();
  }
};

const loginCompany = async (req, res) => {
  const { user_id, password } = req.body;

  try {
    const queryText = `
      SELECT c.*, cu.user_id as additional_user_id 
      FROM companies c
      LEFT JOIN company_users cu ON c.id = cu.company_id
      WHERE c.user_id = $1 OR cu.user_id = $1`;
    
    const result = await pool.query(queryText, [user_id]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    const company = result.rows[0];
    
    // Check if the account has expired
    if (new Date() > new Date(company.expiration_date)) {
      return res.status(403).json({ error: 'Account has expired' });
    }

    let passwordMatch;
    if (user_id === company.user_id) {
      passwordMatch = await bcrypt.compare(password, company.password);
    } else {
      const userResult = await pool.query(
        'SELECT password FROM company_users WHERE user_id = $1',
        [user_id]
      );
      if (userResult.rows.length > 0) {
        passwordMatch = await bcrypt.compare(password, userResult.rows[0].password);
      }
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid user ID or password' });
    }

    const { password: _, ...companyData } = company;
    
    // Ensure company_id and user_id are included in the response
    companyData.company_id = company.id;
    companyData.user_id = user_id;

    res.json({
      message: 'Login successful',
      company: companyData
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({
      error: 'An error occurred during login',
      details: error.message
    });
  }
};
const addCompanyUser = async (req, res) => {
    const { company_id, user_id, password } = req.body;
  
    try {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      const queryText = `
        INSERT INTO company_users (company_id, user_id, password)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, created_at`;
  
      const result = await pool.query(queryText, [company_id, user_id, hashedPassword]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error adding company user:', error);
      res.status(500).json({
        error: 'An error occurred while adding the company user',
        details: error.message
      });
    }
  };
  
  const createEvent = async (req, res) => {
    const {
      company_id,
      user_id,
      event_name,
      event_date,
      event_time,
      time_slot,
      banquet_hall,
      function_type,
      meal_type,
      person_count,
      phone_number,
      address
    } = req.body;
  
    // Validate required fields
    if (!company_id || !user_id || !event_name || !event_date || !phone_number) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['company_id', 'user_id', 'event_name', 'event_date', 'phone_number']
      });
    }
  
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
  
      // Verify that the user belongs to the company
      const userCheck = await client.query(`
        SELECT 1 FROM companies 
        WHERE id = $1 AND (user_id = $2
          OR EXISTS (
            SELECT 1 FROM company_users
            WHERE company_id = $1 AND user_id = $2
          ))
      `, [company_id, user_id]);
  
      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'User does not have permission to create events for this company'
        });
      }
  
      // Convert person_count to integer or null
      const parsedPersonCount = person_count ? parseInt(person_count, 10) : null;
  
      // Parse banquet_hall JSON if it's a string
      let parsedBanquetHall = banquet_hall;
      if (typeof banquet_hall === 'string') {
        try {
          parsedBanquetHall = JSON.parse(banquet_hall);
        } catch (e) {
          console.error('Error parsing banquet_hall JSON:', e);
        }
      }
  
      // Insert into user_events table
      const eventQueryText = `
        INSERT INTO user_events
        (company_id, user_id, event_name, event_date, event_time, time_slot, banquet_hall,
          function_type, meal_type, person_count, phone_number, address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`;
  
      const eventValues = [
        company_id,
        user_id,
        event_name,
        new Date(event_date),
        event_time || null,  // Use null if event_time is empty or undefined
        time_slot || null,   // Use null if time_slot is empty or undefined
        parsedBanquetHall,
        function_type || null,
        meal_type || null,
        parsedPersonCount,
        phone_number,
        address || null
      ];
  
      const eventResult = await client.query(eventQueryText, eventValues);
  
      // Insert into customer_master table
      const customerQueryText = `
        INSERT INTO customer_master
        (company_id, event_name, phone_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (company_id, phone_number) DO UPDATE
        SET event_name = EXCLUDED.event_name
        RETURNING *`;
  
      const customerValues = [company_id, event_name, phone_number];
  
      const customerResult = await client.query(customerQueryText, customerValues);
  
      await client.query('COMMIT');
  
      // Safely extract and format the response data
      const eventResponse = eventResult.rows[0] ? {
        id: eventResult.rows[0].id,
        company_id: eventResult.rows[0].company_id,
        user_id: eventResult.rows[0].user_id,
        event_name: eventResult.rows[0].event_name,
        event_date: eventResult.rows[0].event_date,
        event_time: eventResult.rows[0].event_time,
        time_slot: eventResult.rows[0].time_slot,
        banquet_hall: eventResult.rows[0].banquet_hall,
        function_type: eventResult.rows[0].function_type,
        meal_type: eventResult.rows[0].meal_type,
        person_count: eventResult.rows[0].person_count,
        phone_number: eventResult.rows[0].phone_number,
        address: eventResult.rows[0].address
      } : null;
  
      const customerResponse = customerResult.rows[0] ? {
        id: customerResult.rows[0].id,
        company_id: customerResult.rows[0].company_id,
        event_name: customerResult.rows[0].event_name,
        phone_number: customerResult.rows[0].phone_number
      } : null;
  
      res.status(201).json({
        event: eventResponse,
        customer: customerResponse
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Database error:', error);
      res.status(500).json({
        error: 'An error occurred while creating the event and customer',
        details: error.message
      });
    } finally {
      client.release();
    }
  };

  // const createEvent = async (req, res) => {
  //   const {
  //     company_id,user_id,event_name,event_date,event_time,function_type,meal_type,person_count,phone_number,address
  //   } = req.body;
  
  //   // Validate required fields
  //   if (!company_id || !user_id || !event_name || !event_date || !phone_number) {
  //     return res.status(400).json({
  //       error: 'Missing required fields',
  //       required: ['company_id', 'user_id', 'event_name', 'event_date', 'phone_number']
  //     });
  //   }
  
  //   const client = await pool.connect();
  
  //   try {
  //     await client.query('BEGIN');
  
  //     // Verify that the user belongs to the company
  //     const userCheck = await client.query(`
  //       SELECT 1 FROM companies 
  //       WHERE id = $1 AND (user_id = $2 
  //         OR EXISTS (
  //           SELECT 1 FROM company_users 
  //           WHERE company_id = $1 AND user_id = $2
  //         ))
  //     `, [company_id, user_id]);
  
  //     if (userCheck.rows.length === 0) {
  //       await client.query('ROLLBACK');
  //       return res.status(403).json({
  //         error: 'User does not have permission to create events for this company'
  //       });
  //     }
  
  //     // Convert person_count to integer or null
  //     const parsedPersonCount = person_count ? parseInt(person_count, 10) : null;
  
  //     // Insert into user_events table
  //     const eventQueryText = `
  //       INSERT INTO user_events
  //       (company_id, user_id, event_name, event_date, event_time, 
  //        function_type, meal_type, person_count, phone_number, address)
  //       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  //       RETURNING *`;
  
  //     const eventValues = [
  //       company_id,user_id,event_name,new Date(event_date),event_time,function_type,meal_type,parsedPersonCount,phone_number,address
  //     ];
  
  //     const eventResult = await client.query(eventQueryText, eventValues);
  
  //     // Insert into customer_master table
  //     const customerQueryText = `
  //       INSERT INTO customer_master
  //       (company_id, event_name, phone_number)
  //       VALUES ($1, $2, $3)
  //       ON CONFLICT (company_id, phone_number) DO UPDATE
  //       SET event_name = EXCLUDED.event_name
  //       RETURNING *`;
  
  //     const customerValues = [company_id, event_name, phone_number];
  
  //     const customerResult = await client.query(customerQueryText, customerValues);
  
  //     await client.query('COMMIT');
  
  //     // Safely extract and format the response data
  //     const eventResponse = eventResult.rows[0] ? {
  //       id: eventResult.rows[0].id,
  //       company_id: eventResult.rows[0].company_id,
  //       user_id: eventResult.rows[0].user_id,
  //       event_name: eventResult.rows[0].event_name,
  //       event_date: eventResult.rows[0].event_date,
  //       event_time: eventResult.rows[0].event_time,
  //       function_type: eventResult.rows[0].function_type,
  //       meal_type: eventResult.rows[0].meal_type,
  //       person_count: eventResult.rows[0].person_count,
  //       phone_number: eventResult.rows[0].phone_number,
  //       address: eventResult.rows[0].address
  //     } : null;
  
  //     const customerResponse = customerResult.rows[0] ? {
  //       id: customerResult.rows[0].id,
  //       company_id: customerResult.rows[0].company_id,
  //       event_name: customerResult.rows[0].event_name,
  //       phone_number: customerResult.rows[0].phone_number
  //     } : null;
  
  //     res.status(201).json({
  //       event: eventResponse,
  //       customer: customerResponse
  //     });
  //   } catch (error) {
  //     await client.query('ROLLBACK');
  //     console.error('Database error:', error);
  //     res.status(500).json({
  //       error: 'An error occurred while creating the event and customer',
  //       details: error.message
  //     });
  //   } finally {
  //     client.release();
  //   }
  // };

  const getUserEvents = async (req, res) => {
    const { user_id, company_id } = req.query;
  
    console.log('Received request for user events:', { user_id, company_id });
  
    if (!user_id || !company_id) {
      return res.status(400).json({
        error: 'Both user_id and company_id are required'
      });
    }
  
    const client = await pool.connect();
  
    try {
      // Verify that the user belongs to the company
      const userCheck = await client.query(`
        SELECT 1 FROM companies 
        WHERE id = $1 AND (user_id = $2 
          OR EXISTS (
            SELECT 1 FROM company_users 
            WHERE company_id = $1 AND user_id = $2
          ))
      `, [company_id, user_id]);
  
      if (userCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'User does not have permission to view events for this company'
        });
      }
  
      const queryText = `
        SELECT * FROM user_events
        WHERE company_id = $1 AND user_id = $2
        ORDER BY event_date ASC`;
  
      const result = await client.query(queryText, [company_id, user_id]);
      console.log('Events fetched:', result.rows.length);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching user events:', error);
      res.status(500).json({
        error: 'An error occurred while fetching events',
        details: error.message,
        stack: error.stack
      });
    } finally {
      client.release();
    }
  };

  const getBanquetDetails = async (req, res) => {
    const { company_id } = req.query;
  
    if (!company_id) {
      return res.status(400).json({
        error: 'Company ID is required'
      });
    }
  
    const client = await pool.connect();
  
    try {
      // Get company details and banquet halls
      const companyQuery = `
        SELECT banquet_halls
        FROM companies
        WHERE id = $1`;
      
      const companyResult = await client.query(companyQuery, [company_id]);
      
      if (companyResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Company not found'
        });
      }
  
      const banquetHalls = companyResult.rows[0].banquet_halls;
  
      // Get time slots for each banquet hall
      const timeSlotsQuery = `
        SELECT banquet_name, time_slot
        FROM banquet_time_slots
        WHERE company_id = $1`;
      
      const timeSlotsResult = await client.query(timeSlotsQuery, [company_id]);
  
      // Process time slots into the required format
      const timeSlots = {};
      timeSlotsResult.rows.forEach(row => {
        if (!timeSlots[row.banquet_name]) {
          timeSlots[row.banquet_name] = [];
        }
        timeSlots[row.banquet_name].push(row.time_slot);
      });
  
      // Prepare the response
      const response = {
        banquet_halls: banquetHalls,
        time_slots: timeSlots
      };
  
      res.json(response);
    } catch (error) {
      console.error('Error fetching banquet details:', error);
      res.status(500).json({
        error: 'An error occurred while fetching banquet details',
        details: error.message
      });
    } finally {
      client.release();
    }
  };
  const getCustomerMaster = async (req, res) => {
    const { company_id } = req.query;
  
    if (!company_id) {
      return res.status(400).json({ error: 'Company ID is required' });
    }
  
    const client = await pool.connect();
  
    try {
      const queryText = `
        SELECT customer_id, event_name, phone_number
        FROM customer_master
        WHERE company_id = $1
        ORDER BY event_name ASC
      `;
  
      const result = await client.query(queryText, [company_id]);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching customer master:', error);
      res.status(500).json({
        error: 'An error occurred while fetching customer master',
        details: error.message,
      });
    } finally {
      client.release();
    }
  };
  const addCustomer = async (req, res) => {
    const { company_id, event_name, phone_number } = req.body;

    if (!company_id || !event_name || !phone_number) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await pool.connect();

    try {
        // Check if the customer name already exists for this company
        const nameCheck = await client.query(
            'SELECT 1 FROM customer_master WHERE company_id = $1 AND event_name = $2',
            [company_id, event_name]
        );

        if (nameCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Customer name already exists' });
        }

        // **Updated Check: Ensure phone number is unique**
        const phoneCheck = await client.query(
            'SELECT 1 FROM customer_master WHERE phone_number = $1',
            [phone_number]
        );

        if (phoneCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Phone number already exists' });
        }

        // Insert the new customer
        const insertQuery = `
            INSERT INTO customer_master (company_id, event_name, phone_number)
            VALUES ($1, $2, $3)
            RETURNING *`;
        const result = await client.query(insertQuery, [company_id, event_name, phone_number]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).json({
            error: 'An error occurred while adding the customer',
            details: error.message,
        });
    } finally {
        client.release();
    }
};

const updateCustomer = async (req, res) => {
  const { customer_id, company_id, event_name, phone_number } = req.body;

  if (!customer_id || !company_id || !event_name || !phone_number) {
      return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();

  try {
      // Check if the new event name already exists for the company (excluding the current customer being edited)
      const nameCheck = await client.query(
          'SELECT 1 FROM customer_master WHERE company_id = $1 AND event_name = $2 AND customer_id != $3',
          [company_id, event_name, customer_id]
      );

      if (nameCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Customer name already exists' });
      }

      // Check if the new phone number already exists (excluding the current customer being edited)
      const phoneCheck = await client.query(
          'SELECT 1 FROM customer_master WHERE phone_number = $1 AND customer_id != $2',
          [phone_number, customer_id]
      );

      if (phoneCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Phone number already exists' });
      }

      // Update the customer
      const updateQuery = `
          UPDATE customer_master
          SET event_name = $1, phone_number = $2
          WHERE customer_id = $3
          RETURNING *`;
      const result = await client.query(updateQuery, [event_name, phone_number, customer_id]);

      res.json(result.rows[0]);
  } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({
          error: 'An error occurred while updating the customer',
          details: error.message,
      });
  } finally {
      client.release();
  }
};

// Delete a customer
const deleteCustomer = async (req, res) => {
  const { customer_id } = req.query;

  if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
  }

  const client = await pool.connect();

  try {
      const deleteQuery = 'DELETE FROM customer_master WHERE customer_id = $1 RETURNING *';
      const result = await client.query(deleteQuery, [customer_id]);

      if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Customer not found' });
      }

      res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({
          error: 'An error occurred while deleting the customer',
          details: error.message,
      });
  } finally {
      client.release();
  }
};

const validateEventDetails = async (req, res) => {
  const { event_name, phone_number, company_id } = req.body;

  if (!event_name || !company_id) {
    return res.status(400).json({ error: 'Event name and company ID are required' });
  }

  const client = await pool.connect();

  try {
    // First check if the name exists
    const nameCheck = await client.query(
      'SELECT phone_number FROM customer_master WHERE company_id = $1 AND event_name = $2',
      [company_id, event_name]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Name already exists',
        existingPhone: nameCheck.rows[0].phone_number
      });
    }

    // If name is unique and phone number is provided, check phone
    if (phone_number) {
      const phoneCheck = await client.query(
        'SELECT event_name FROM customer_master WHERE company_id = $1 AND phone_number = $2',
        [company_id, phone_number]
      );

      if (phoneCheck.rows.length > 0) {
        return res.status(409).json({
          error: 'Phone number already exists',
          existingName: phoneCheck.rows[0].event_name
        });
      }
    }

    // If both checks pass
    res.json({ valid: true });

  } catch (error) {
    console.error('Error validating event details:', error);
    res.status(500).json({
      error: 'An error occurred while validating event details',
      details: error.message
    });
  } finally {
    client.release();
  }
};  

const getBanquetHalls = async (req, res) => {
  console.log('getBanquetHalls function called');
  const { company_id } = req.query;

  if (!company_id) {
    return res.status(400).json({ error: 'Company ID is required' });
  }

  try {
    const result = await pool.query(
      'SELECT banquet_halls FROM companies WHERE id = $1',
      [company_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const banquetHallsData = result.rows[0].banquet_halls || [];
    const banquetNames = banquetHallsData.map(hall => typeof hall === 'string' ? hall : (hall.name || '')).filter(Boolean);

    res.json({
      banquet_halls: banquetNames,
    });
  } catch (error) {
    console.error('Error fetching banquet halls:', error);
    res.status(500).json({
      error: 'An error occurred while fetching banquet halls',
      details: error.message
    });
  }
};

const getEventDetails = async (req, res) => {
  console.log('Received request params:', req.params);
  console.log('Received request query:', req.query);
  
  let { eventId } = req.params;
  let { company_id } = req.query;

  try {
    // Handle potential string 'undefined' or 'null'
    if (eventId === 'undefined' || eventId === 'null') eventId = undefined;
    if (company_id === 'undefined' || company_id === 'null') company_id = undefined;

    // Validate inputs
    if (!eventId) {
      return res.status(400).json({ 
        error: 'Event ID is required',
        providedEventId: eventId
      });
    }

    if (!company_id) {
      return res.status(400).json({ 
        error: 'Company ID is required',
        providedCompanyId: company_id
      });
    }

    // Convert to integers, handling potential strings
    const numericEventId = parseInt(eventId);
    const numericCompanyId = parseInt(company_id);

    if (isNaN(numericEventId)) {
      return res.status(400).json({ 
        error: 'Invalid Event ID format',
        providedEventId: eventId
      });
    }

    if (isNaN(numericCompanyId)) {
      return res.status(400).json({ 
        error: 'Invalid Company ID format',
        providedCompanyId: company_id
      });
    }

    console.log(`Querying for event ID ${numericEventId} and company ID ${numericCompanyId}`);

    const queryText = `
      SELECT * FROM user_events
      WHERE id = $1 AND company_id = $2
    `;
    
    const result = await pool.query(queryText, [numericEventId, numericCompanyId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Event not found',
        eventId: numericEventId,
        company_id: numericCompanyId
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in getEventDetails:', error);
    res.status(500).json({
      error: 'An error occurred while fetching event details',
      details: error.message,
      stack: error.stack
    });
  }
};

const updateEvent = async (req, res) => {
  const { eventId } = req.params;
  const eventData = req.body;

  if (!eventId) {
    return res.status(400).json({ error: 'Event ID is required' });
  }

  const client = await pool.connect();

  try {
    const queryText = `
      UPDATE user_events
      SET 
        event_name = $1,
        event_date = $2,
        event_time = $3,
        time_slot = $4,
        banquet_hall = $5,
        function_type = $6,
        meal_type = $7,
        person_count = $8,
        phone_number = $9,
        address = $10
      WHERE id = $11 AND company_id = $12
      RETURNING *
    `;

    const values = [
      eventData.event_name,
      new Date(eventData.event_date),
      eventData.event_time,
      eventData.time_slot,
      eventData.banquet_hall,
      eventData.function_type,
      eventData.meal_type,
      eventData.person_count,
      eventData.phone_number,
      eventData.address,
      eventId,
      eventData.company_id
    ];

    const result = await client.query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      error: 'An error occurred while updating the event',
      details: error.message
    });
  } finally {
    client.release();
  }
};

const searchCustomers = async (req, res) => {
  const { term, company_id, searchType } = req.query;

  if (!company_id || !term || !searchType) {
    return res.status(400).json({ error: 'Company ID, search term, and search type are required' });
  }

  const client = await pool.connect();

  try {
    let queryText;
    if (searchType === 'name') {
      queryText = `
        SELECT customer_id, event_name, phone_number 
        FROM customer_master 
        WHERE company_id = $1 AND event_name ILIKE $2
        LIMIT 5
      `;
    } else if (searchType === 'phone') {
      queryText = `
        SELECT customer_id, event_name, phone_number 
        FROM customer_master 
        WHERE company_id = $1 AND phone_number ILIKE $2
        LIMIT 5
      `;
    }

    const result = await client.query(queryText, [company_id, `${term}%`]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({
      error: 'An error occurred while searching customers',
      details: error.message,
    });
  } finally {
    client.release();}};

    const updateBanquetTimeSlots = async (req, res) => {
      const { company_id, user_id, banquet_slots } = req.body;
      
      console.log('Received data:', { company_id, user_id, banquet_slots });
      
      if (!company_id || !user_id || !banquet_slots) {
        return res.status(400).json({ error: 'Company ID, user ID, and banquet slots are required' });
      }
    
      // Instead of counting all slots, just check that each banquet has 4 or fewer slots
      for (const [banquetName, slots] of Object.entries(banquet_slots)) {
        const nonEmptySlots = slots.filter(slot => slot && slot.trim() !== '');
        if (nonEmptySlots.length > 4) {
          return res.status(400).json({ 
            error: `Banquet ${banquetName} has more than 4 time slots. Maximum 4 slots allowed per banquet.` 
          });
        }
      }
    
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
        const validBanquetNames = existingBanquetHalls
          .map(hall => hall.name || '')
          .filter(Boolean);
        
        console.log('Valid banquet names:', validBanquetNames);
        
        // Delete existing time slots
        await client.query(
          'DELETE FROM banquet_time_slots WHERE company_id = $1 AND user_id = $2',
          [company_id, user_id]
        );
        
        // Prepare values for insert
        const values = [];
        const valuePlaceholders = [];
        let valueIndex = 1;
        
        Object.entries(banquet_slots).forEach(([banquetName, slots]) => {
          if (validBanquetNames.includes(banquetName)) {
            slots.forEach(slot => {
              if (slot && slot.trim() !== '') {
                values.push(company_id, user_id, banquetName, slot.trim());
                valuePlaceholders.push(
                  `($${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}, $${valueIndex + 3})`
                );
                valueIndex += 4;
              }
            });
          }
        });
        
        if (values.length > 0) {
          const insertQuery = `
            INSERT INTO banquet_time_slots (company_id, user_id, banquet_name, time_slot)
            VALUES ${valuePlaceholders.join(', ')}
          `;
          await client.query(insertQuery, values);
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Time slots updated successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating banquet time slots:', error);
        res.status(500).json({
          error: 'An error occurred while updating banquet time slots',
          details: error.message
        });
      } finally {
        client.release();
      }
    };

    const getTimeSlots = async (req, res) => {
      const { company_id } = req.query;
    
      if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
      }
    
      try {
        // First, get the table structure
        const tableInfoQuery = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'banquet_time_slots'
        `);
        
        const columns = tableInfoQuery.rows.map(row => row.column_name);
        console.log('Table columns:', columns);
    
        // Adjust the query based on the actual column names
        const banquetNameColumn = columns.includes('banquet_name') ? 'banquet_name' : 
                                  (columns.includes('banquet_halls') ? 'banquet_halls->>\'name\'' : 
                                  'banquet_halls');
        const timeSlotColumn = columns.includes('time_slot') ? 'time_slot' : 'time_slots';
    
        const result = await pool.query(
          `SELECT ${banquetNameColumn} as banquet_name, ${timeSlotColumn} as time_slot
           FROM banquet_time_slots
           WHERE company_id = $1
           ORDER BY ${banquetNameColumn}, ${timeSlotColumn}`,
          [company_id]
        );
    
        console.log('Query result:', result.rows);
    
        // Transform the results into the desired format
        const timeSlots = result.rows.reduce((acc, row) => {
          const banquetName = row.banquet_name;
          if (!acc[banquetName]) {
            acc[banquetName] = [];
          }
          acc[banquetName].push(row.time_slot);
          return acc;
        }, {});
    
        console.log('Transformed time slots:', timeSlots);
    
        res.json(timeSlots);
      } catch (error) {
        console.error('Error fetching time slots:', error);
        res.status(500).json({
          error: 'An error occurred while fetching time slots',
          details: error.message,
          stack: error.stack
        });
      }
    };

    const getEventCount = async (req, res) => {
      const { company_id, date } = req.query;
    
      const client = await pool.connect();
      try {
        const countQuery = `
          SELECT COUNT(*) as count
          FROM banquet_bookings
          WHERE company_id = $1 AND booking_date = $2
        `;
        const countResult = await client.query(countQuery, [company_id, date]);
    
        const bookedSlotsQuery = `
          SELECT banquet_hall, time_slot
          FROM banquet_bookings
          WHERE company_id = $1 AND booking_date = $2
        `;
        const bookedSlotsResult = await client.query(bookedSlotsQuery, [company_id, date]);
    
        res.json({
          count: parseInt(countResult.rows[0].count),
          booked_slots: bookedSlotsResult.rows
        });
      } catch (error) {
        console.error('Error getting event count:', error);
        res.status(500).json({
          error: 'An error occurred while getting the event count',
          details: error.message
        });
      } finally {
        client.release();
      }
    };

//     const createBanquetBooking = async (req, res) => {
//       const { banquet_hall, event_name, booking_date, time_slot } = req.body;
//       // These will come from the session/logged in user
//       const company_id = req.body.company_id;
//       const user_id = req.body.user_id;
    
//       if (!company_id || !user_id || !banquet_hall || !event_name || !booking_date || !time_slot) {
//         return res.status(400).json({ error: 'All fields are required' });
//       }
    
//       const client = await pool.connect();
    
//       try {
//         // First, get the event details to get the date and time
//         const eventQuery = `
//           SELECT event_date, event_time
//           FROM user_events
//           WHERE company_id = $1 AND event_name = $2
//         `;
//         const eventResult = await client.query(eventQuery, [company_id, event_name]);
        
//         if (eventResult.rows.length === 0) {
//           return res.status(404).json({ error: 'Event not found' });
//         }
    
//         const booking_date = eventResult.rows[0].event_date;
//         const time_slot = eventResult.rows[0].event_time;
    
//         // Check if the time slot is already booked
//         const checkQuery = `
//       SELECT id FROM banquet_bookings 
//       WHERE company_id = $1 AND banquet_hall = $2 
//       AND booking_date = $3 AND time_slot = $4
//     `;
//     const checkResult = await client.query(checkQuery, [company_id, banquet_hall, booking_date, time_slot]);

//     if (checkResult.rows.length > 0) {
//       return res.status(409).json({ error: 'This time slot is already booked' });
//     }
    
//         // Create the booking
//         const insertQuery = `
//       INSERT INTO banquet_bookings 
//       (company_id, user_id, banquet_hall, booking_date, time_slot, event_name)
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;
//     const values = [company_id, user_id, banquet_hall, booking_date, time_slot, event_name];

//     const result = await client.query(insertQuery, values);
//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error creating banquet booking:', error);
//     res.status(500).json({
//       error: 'An error occurred while creating the booking',
//       details: error.message
//     });
//   } finally {
//     client.release();
//   }
// };
// const createBanquetBooking = async (req, res) => {
//         const { company_id, user_id, banquet_hall, event_name, booking_date, time_slot } = req.body;
//         // const values = [company_id, user_id, banquet_hall, booking_date, time_slot, event_name]; 
//         console.log('Received booking request:', req.body);
      
//         if (!company_id || !user_id || !banquet_hall || !event_name || !booking_date || !time_slot) {
//           return res.status(400).json({ error: 'All fields are required' });
//         }
      
//         const client = await pool.connect();
      
//         try {
//           // Check if the time slot is already booked
//           const checkQuery = `
//             SELECT id FROM banquet_bookings 
//             WHERE company_id = $1 AND banquet_hall = $2 
//             AND booking_date = $3 AND time_slot = $4
//           `;
//           const checkResult = await client.query(checkQuery, [company_id, banquet_hall, booking_date, time_slot]);
      
//           if (checkResult.rows.length > 0) {
//             return res.status(409).json({ error: 'This time slot is already booked' });
//           }
      
//           // Create the booking
//           const insertQuery = `
//             INSERT INTO banquet_bookings 
//             (company_id, user_id, banquet_hall, booking_date, time_slot, event_name)
//             VALUES ($1, $2, $3, $4, $5, $6)
//             RETURNING *
//           `;
//           const values = [company_id, user_id, banquet_hall, booking_date, time_slot, event_name];
      
//           const result = await client.query(insertQuery, values);
//           res.status(201).json(result.rows[0]);
//         } catch (error) {
//           console.error('Error creating banquet booking:', error);
//           res.status(500).json({
//             error: 'An error occurred while creating the booking',
//             details: error.message
//           });
//         } finally {
//           client.release();
//         }
//       };

// const createBanquetBooking = async (req, res) => {
//   console.log('Received booking request:', req.body);
  
//   const { company_id, user_id, banquet_hall, event_name, booking_date, time_slot } = req.body;

//   if (!company_id || !user_id || !banquet_hall || !event_name || !booking_date || !time_slot) {
//     const missingFields = ['company_id', 'user_id', 'banquet_hall', 'event_name', 'booking_date', 'time_slot']
//       .filter(field => !req.body[field]);
//     return res.status(400).json({ error: 'Missing required fields', missingFields });
//   }

//   const client = await pool.connect();

//   try {
//     // Check if the time slot is already booked
//     const checkQuery = `
//       SELECT id FROM banquet_bookings 
//       WHERE company_id = $1 AND banquet_hall = $2 
//       AND booking_date = $3 AND time_slot = $4
//     `;
//     const checkResult = await client.query(checkQuery, [company_id, banquet_hall, booking_date, time_slot]);

//     if (checkResult.rows.length > 0) {
//       return res.status(409).json({ error: 'This time slot is already booked' });
//     }

//     // Create the booking
//     const insertQuery = `
//       INSERT INTO banquet_bookings 
//       (company_id, user_id, banquet_hall, booking_date, time_slot, event_name)
//       VALUES ($1, $2, $3, $4, $5, $6)
//       RETURNING *
//     `;
//     const values = [company_id, user_id, banquet_hall, booking_date, time_slot, event_name];

//     const result = await client.query(insertQuery, values);
//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error creating banquet booking:', error);
//     res.status(500).json({
//       error: 'An error occurred while creating the booking',
//       details: error.message
//     });
//   } finally {
//     client.release();
//   }
// };



const createBanquetBooking = async (req, res) => {
  console.log('Received booking request:', req.body);

  const { 
    company_id, 
    user_id, 
    banquet_hall, 
    event_name, 
    booking_date, 
    time_slot,
    phone_number,
    address,
    function_type,
    meal_type,
    person_count
  } = req.body;

  if (!company_id || !user_id || !banquet_hall || !event_name || !booking_date || !time_slot) {
    const missingFields = ['company_id', 'user_id', 'banquet_hall', 'event_name', 'booking_date', 'time_slot']
      .filter(field => !req.body[field]);
    return res.status(400).json({ error: 'Missing required fields', missingFields });
  }

  const client = await pool.connect();

  try {
    // Check if the time slot is already booked
    const checkQuery = `
      SELECT id FROM banquet_bookings 
      WHERE company_id = $1 AND banquet_hall = $2
      AND booking_date = $3 AND time_slot = $4
    `;
    const checkResult = await client.query(checkQuery, [company_id, banquet_hall, booking_date, time_slot]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }


    // Create the booking
    const insertQuery = `
      INSERT INTO banquet_bookings 
      (company_id, user_id, banquet_hall, booking_date, time_slot, event_name, 
       phone_number, address, function_type, meal_type, person_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [
      company_id, user_id, banquet_hall, booking_date, time_slot, event_name,
      phone_number, address, function_type, meal_type, person_count
    ];

    const result = await client.query(insertQuery, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating banquet booking:', error);
    res.status(500).json({
      error: 'An error occurred while creating the booking',
      details: error.message
    });
  } finally {
    client.release();
  }
};


module.exports = {
  updateBanquetTimeSlots,getTimeSlots,getEventCount,createBanquetBooking,
  updateEvent,searchCustomers,getEventDetails,getBanquetHalls,createCompany,  loginCompany,  addCompanyUser,  getUserEvents,  createEvent,  getBanquetDetails,  getCustomerMaster,  addCustomer,deleteCustomer,updateCustomer,  validateEventDetails
};
























// // // controllers/companyController.js
// const pool = require('../db');
// const bcrypt = require('bcrypt');
  
//   const createEvent = async (req, res) => {
//     const {
//       company_id,user_id,event_name,event_date,event_time,time_slot,banquet_hall,function_type,meal_type,person_count,phone_number,
//       address
//     } = req.body;
  
//     // Validate required fields
//     if (!company_id || !user_id || !event_name || !event_date || !phone_number) {
//       return res.status(400).json({
//         error: 'Missing required fields',
//         required: ['company_id', 'user_id', 'event_name', 'event_date', 'phone_number']
//       });
//     }
  
//     const client = await pool.connect();
  
//     try {
//       await client.query('BEGIN');
  
//       // Verify that the user belongs to the company
//       const userCheck = await client.query(`
//         SELECT 1 FROM companies 
//         WHERE id = $1 AND (user_id = $2
//           OR EXISTS (
//             SELECT 1 FROM company_users
//             WHERE company_id = $1 AND user_id = $2
//           ))
//       `, [company_id, user_id]);
  
//       if (userCheck.rows.length === 0) {
//         await client.query('ROLLBACK');
//         return res.status(403).json({
//           error: 'User does not have permission to create events for this company'
//         });
//       }
  
//       // Convert person_count to integer or null
//       const parsedPersonCount = person_count ? parseInt(person_count, 10) : null;
  
//       // Parse banquet_hall JSON if it's a string
//       let parsedBanquetHall = banquet_hall;
//       if (typeof banquet_hall === 'string') {
//         try {
//           parsedBanquetHall = JSON.parse(banquet_hall);
//         } catch (e) {
//           console.error('Error parsing banquet_hall JSON:', e);
//         }
//       }
  
//       // Insert into user_events table
//       const eventQueryText = `
//         INSERT INTO user_events
//         (company_id, user_id, event_name, event_date, event_time, time_slot, banquet_hall,
//           function_type, meal_type, person_count, phone_number, address)
//         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
//         RETURNING *`;
  
//       const eventValues = [
//         company_id,user_id,event_name,new Date(event_date),
//         event_time || null,  // Use null if event_time is empty or undefined
//         time_slot || null,   // Use null if time_slot is empty or undefined
//         parsedBanquetHall,function_type || null,meal_type || null,parsedPersonCount,phone_number,
//         address || null
//       ];
  
//       const eventResult = await client.query(eventQueryText, eventValues);
  
//       // Insert into customer_master table
//       const customerQueryText = `
//         INSERT INTO customer_master
//         (company_id, event_name, phone_number)
//         VALUES ($1, $2, $3)
//         ON CONFLICT (company_id, phone_number) DO UPDATE
//         SET event_name = EXCLUDED.event_name
//         RETURNING *`;
  
//       const customerValues = [company_id, event_name, phone_number];
  
//       const customerResult = await client.query(customerQueryText, customerValues);
  
//       await client.query('COMMIT');
  
//       // Safely extract and format the response data
//       const eventResponse = eventResult.rows[0] ? {
//         id: eventResult.rows[0].id,
//         company_id: eventResult.rows[0].company_id,
//         user_id: eventResult.rows[0].user_id,
//         event_name: eventResult.rows[0].event_name,
//         event_date: eventResult.rows[0].event_date,
//         event_time: eventResult.rows[0].event_time,
//         time_slot: eventResult.rows[0].time_slot,
//         banquet_hall: eventResult.rows[0].banquet_hall,
//         function_type: eventResult.rows[0].function_type,
//         meal_type: eventResult.rows[0].meal_type,
//         person_count: eventResult.rows[0].person_count,
//         phone_number: eventResult.rows[0].phone_number,
//         address: eventResult.rows[0].address
//       } : null;
  
//       const customerResponse = customerResult.rows[0] ? {
//         id: customerResult.rows[0].id,
//         company_id: customerResult.rows[0].company_id,
//         event_name: customerResult.rows[0].event_name,
//         phone_number: customerResult.rows[0].phone_number
//       } : null;
  
//       res.status(201).json({
//         event: eventResponse,
//         customer: customerResponse
//       });
//     } catch (error) {
//       await client.query('ROLLBACK');
//       console.error('Database error:', error);
//       res.status(500).json({
//         error: 'An error occurred while creating the event and customer',
//         details: error.message
//       });
//     } finally {
//       client.release();
//     }
//   };

//   const getUserEvents = async (req, res) => {
//     const { user_id, company_id } = req.query;
  
//     console.log('Received request for user events:', { user_id, company_id });
  
//     if (!user_id || !company_id) {
//       return res.status(400).json({
//         error: 'Both user_id and company_id are required'
//       });
//     }
  
//     const client = await pool.connect();
  
//     try {
//       // Verify that the user belongs to the company
//       const userCheck = await client.query(`
//         SELECT 1 FROM companies 
//         WHERE id = $1 AND (user_id = $2 
//           OR EXISTS (
//             SELECT 1 FROM company_users 
//             WHERE company_id = $1 AND user_id = $2
//           ))
//       `, [company_id, user_id]);
  
//       if (userCheck.rows.length === 0) {
//         return res.status(403).json({
//           error: 'User does not have permission to view events for this company'
//         });
//       }
  
//       const queryText = `
//         SELECT * FROM user_events
//         WHERE company_id = $1 AND user_id = $2
//         ORDER BY event_date ASC`;
  
//       const result = await client.query(queryText, [company_id, user_id]);
//       console.log('Events fetched:', result.rows.length);
//       res.json(result.rows);
//     } catch (error) {
//       console.error('Error fetching user events:', error);
//       res.status(500).json({
//         error: 'An error occurred while fetching events',
//         details: error.message,
//         stack: error.stack
//       });
//     } finally {
//       client.release();
//     }
//   };

//   const getBanquetDetails = async (req, res) => {
//     const { company_id } = req.query;
  
//     if (!company_id) {
//       return res.status(400).json({
//         error: 'Company ID is required'
//       });
//     }
  
//     const client = await pool.connect();
  
//     try {
//       // Get company details and banquet halls
//       const companyQuery = `
//         SELECT banquet_halls
//         FROM companies
//         WHERE id = $1`;
      
//       const companyResult = await client.query(companyQuery, [company_id]);
      
//       if (companyResult.rows.length === 0) {
//         return res.status(404).json({
//           error: 'Company not found'
//         });
//       }
  
//       const banquetHalls = companyResult.rows[0].banquet_halls;
  
//       // Get time slots for each banquet hall
//       const timeSlotsQuery = `
//         SELECT banquet_name, time_slot
//         FROM banquet_time_slots
//         WHERE company_id = $1`;
      
//       const timeSlotsResult = await client.query(timeSlotsQuery, [company_id]);
  
//       // Process time slots into the required format
//       const timeSlots = {};
//       timeSlotsResult.rows.forEach(row => {
//         if (!timeSlots[row.banquet_name]) {
//           timeSlots[row.banquet_name] = [];
//         }
//         timeSlots[row.banquet_name].push(row.time_slot);
//       });
  
//       // Prepare the response
//       const response = {
//         banquet_halls: banquetHalls,
//         time_slots: timeSlots
//       };
  
//       res.json(response);
//     } catch (error) {
//       console.error('Error fetching banquet details:', error);
//       res.status(500).json({
//         error: 'An error occurred while fetching banquet details',
//         details: error.message
//       });
//     } finally {
//       client.release();
//     }
//   };

// const validateEventDetails = async (req, res) => {
//   const { event_name, phone_number, company_id } = req.body;

//   if (!event_name || !company_id) {
//     return res.status(400).json({ error: 'Event name and company ID are required' });
//   }

//   const client = await pool.connect();

//   try {
//     // First check if the name exists
//     const nameCheck = await client.query(
//       'SELECT phone_number FROM customer_master WHERE company_id = $1 AND event_name = $2',
//       [company_id, event_name]
//     );

//     if (nameCheck.rows.length > 0) {
//       return res.status(409).json({
//         error: 'Name already exists',
//         existingPhone: nameCheck.rows[0].phone_number
//       });
//     }

//     // If name is unique and phone number is provided, check phone
//     if (phone_number) {
//       const phoneCheck = await client.query(
//         'SELECT event_name FROM customer_master WHERE company_id = $1 AND phone_number = $2',
//         [company_id, phone_number]
//       );

//       if (phoneCheck.rows.length > 0) {
//         return res.status(409).json({
//           error: 'Phone number already exists',
//           existingName: phoneCheck.rows[0].event_name});}}

//     // If both checks pass
//     res.json({ valid: true });

//   } catch (error) {
//     console.error('Error validating event details:', error);
//     res.status(500).json({
//       error: 'An error occurred while validating event details',
//       details: error.message
//     });
//   } finally {
//     client.release();
//   }
// };  

// const getBanquetHalls = async (req, res) => {
//   console.log('getBanquetHalls function called');
//   const { company_id } = req.query;

//   if (!company_id) {
//     return res.status(400).json({ error: 'Company ID is required' });
//   }

//   try {
//     const result = await pool.query(
//       'SELECT banquet_halls FROM companies WHERE id = $1',
//       [company_id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Company not found' });
//     }

//     const banquetHallsData = result.rows[0].banquet_halls || [];
//     const banquetNames = banquetHallsData.map(hall => typeof hall === 'string' ? hall : (hall.name || '')).filter(Boolean);

//     res.json({
//       banquet_halls: banquetNames,
//     });
//   } catch (error) {
//     console.error('Error fetching banquet halls:', error);
//     res.status(500).json({
//       error: 'An error occurred while fetching banquet halls',
//       details: error.message});}};

// const getEventDetails = async (req, res) => {
//   console.log('Received request params:', req.params);
//   console.log('Received request query:', req.query);
  
//   let { eventId } = req.params;
//   let { company_id } = req.query;

//   try {
//     // Handle potential string 'undefined' or 'null'
//     if (eventId === 'undefined' || eventId === 'null') eventId = undefined;
//     if (company_id === 'undefined' || company_id === 'null') company_id = undefined;

//     // Validate inputs
//     if (!eventId) {
//       return res.status(400).json({ 
//         error: 'Event ID is required',
//         providedEventId: eventId
//       });
//     }

//     if (!company_id) {
//       return res.status(400).json({ 
//         error: 'Company ID is required',
//         providedCompanyId: company_id
//       });
//     }

//     // Convert to integers, handling potential strings
//     const numericEventId = parseInt(eventId);
//     const numericCompanyId = parseInt(company_id);

//     if (isNaN(numericEventId)) {
//       return res.status(400).json({ 
//         error: 'Invalid Event ID format',
//         providedEventId: eventId
//       });
//     }

//     if (isNaN(numericCompanyId)) {
//       return res.status(400).json({ 
//         error: 'Invalid Company ID format',
//         providedCompanyId: company_id
//       });
//     }

//     console.log(`Querying for event ID ${numericEventId} and company ID ${numericCompanyId}`);

//     const queryText = `
//       SELECT * FROM user_events
//       WHERE id = $1 AND company_id = $2
//     `;
    
//     const result = await pool.query(queryText, [numericEventId, numericCompanyId]);
    
//     if (result.rows.length === 0) {
//       return res.status(404).json({ 
//         error: 'Event not found',
//         eventId: numericEventId,
//         company_id: numericCompanyId
//       });
//     }
    
//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error('Error in getEventDetails:', error);
//     res.status(500).json({
//       error: 'An error occurred while fetching event details',
//       details: error.message,
//       stack: error.stack});}};
// const updateEvent = async (req, res) => {
//   const { eventId } = req.params;
//   const eventData = req.body;

//   if (!eventId) {
//     return res.status(400).json({ error: 'Event ID is required' });
//   }

//   const client = await pool.connect();

//   try {
//     const queryText = `
//       UPDATE user_events
//       SET 
//         event_name = $1,event_date = $2,event_time = $3,time_slot = $4,banquet_hall = $5,function_type = $6,meal_type = $7,person_count = $8,phone_number = $9,address = $10
//       WHERE id = $11 AND company_id = $12
//       RETURNING *
//     `;

//     const values = [
//       eventData.event_name,
//       new Date(eventData.event_date),eventData.event_time,eventData.time_slot,eventData.banquet_hall,eventData.function_type,eventData.meal_type,eventData.person_count,eventData.phone_number,eventData.address,eventId,eventData.company_id
//     ];

//     const result = await client.query(queryText, values);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Event not found' });
//     }

//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error('Error updating event:', error);
//     res.status(500).json({
//       error: 'An error occurred while updating the event',
//       details: error.message
//     });
//   } finally {
//     client.release();
//   }
// };

//     const updateBanquetTimeSlots = async (req, res) => {
//       const { company_id, user_id, banquet_slots } = req.body;
      
//       console.log('Received data:', { company_id, user_id, banquet_slots });
      
//       if (!company_id || !user_id || !banquet_slots) {
//         return res.status(400).json({ error: 'Company ID, user ID, and banquet slots are required' });
//       }
    
//       // Instead of counting all slots, just check that each banquet has 4 or fewer slots
//       for (const [banquetName, slots] of Object.entries(banquet_slots)) {
//         const nonEmptySlots = slots.filter(slot => slot && slot.trim() !== '');
//         if (nonEmptySlots.length > 4) {
//           return res.status(400).json({ 
//             error: `Banquet ${banquetName} has more than 4 time slots. Maximum 4 slots allowed per banquet.` 
//           });}}
    
//       const client = await pool.connect();
      
//       try {
//         await client.query('BEGIN');
        
//         // Verify company exists and get banquet halls
//         const companyResult = await client.query(
//           'SELECT banquet_halls FROM companies WHERE id = $1',
//           [company_id]
//         );
        
//         if (companyResult.rows.length === 0) {
//           throw new Error('Company not found');
//         }
        
//         const existingBanquetHalls = companyResult.rows[0].banquet_halls || [];
//         const validBanquetNames = existingBanquetHalls
//           .map(hall => hall.name || '')
//           .filter(Boolean);
        
//         console.log('Valid banquet names:', validBanquetNames);
        
//         // Delete existing time slots
//         await client.query(
//           'DELETE FROM banquet_time_slots WHERE company_id = $1 AND user_id = $2',
//           [company_id, user_id]
//         );
        
//         // Prepare values for insert
//         const values = [];
//         const valuePlaceholders = [];
//         let valueIndex = 1;
        
//         Object.entries(banquet_slots).forEach(([banquetName, slots]) => {
//           if (validBanquetNames.includes(banquetName)) {
//             slots.forEach(slot => {
//               if (slot && slot.trim() !== '') {
//                 values.push(company_id, user_id, banquetName, slot.trim());
//                 valuePlaceholders.push(
//                   `($${valueIndex}, $${valueIndex + 1}, $${valueIndex + 2}, $${valueIndex + 3})`
//                 );
//                 valueIndex += 4;}});}});
        
//         if (values.length > 0) {
//           const insertQuery = `
//             INSERT INTO banquet_time_slots (company_id, user_id, banquet_name, time_slot)
//             VALUES ${valuePlaceholders.join(', ')}
//           `;
//           await client.query(insertQuery, values);
//         }
        
//         await client.query('COMMIT');
//         res.json({ message: 'Time slots updated successfully' });
//       } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('Error updating banquet time slots:', error);
//         res.status(500).json({
//           error: 'An error occurred while updating banquet time slots',
//           details: error.message
//         });
//       } finally {
//         client.release();
//       }
//     };

//     const getTimeSlots = async (req, res) => {
//       const { company_id } = req.query;
    
//       if (!company_id) {
//         return res.status(400).json({ error: 'Company ID is required' });
//       }
    
//       try {
//         // First, get the table structure
//         const tableInfoQuery = await pool.query(`
//           SELECT column_name 
//           FROM information_schema.columns 
//           WHERE table_name = 'banquet_time_slots'
//         `);
        
//         const columns = tableInfoQuery.rows.map(row => row.column_name);
//         console.log('Table columns:', columns);
    
//         // Adjust the query based on the actual column names
//         const banquetNameColumn = columns.includes('banquet_name') ? 'banquet_name' : 
//                                   (columns.includes('banquet_halls') ? 'banquet_halls->>\'name\'' : 
//                                   'banquet_halls');
//         const timeSlotColumn = columns.includes('time_slot') ? 'time_slot' : 'time_slots';
    
//         const result = await pool.query(
//           `SELECT ${banquetNameColumn} as banquet_name, ${timeSlotColumn} as time_slot
//            FROM banquet_time_slots
//            WHERE company_id = $1
//            ORDER BY ${banquetNameColumn}, ${timeSlotColumn}`,
//           [company_id]
//         );
    
//         console.log('Query result:', result.rows);
    
//         // Transform the results into the desired format
//         const timeSlots = result.rows.reduce((acc, row) => {
//           const banquetName = row.banquet_name;
//           if (!acc[banquetName]) {
//             acc[banquetName] = [];
//           }
//           acc[banquetName].push(row.time_slot);
//           return acc;
//         }, {});
    
//         console.log('Transformed time slots:', timeSlots);
    
//         res.json(timeSlots);
//       } catch (error) {
//         console.error('Error fetching time slots:', error);
//         res.status(500).json({
//           error: 'An error occurred while fetching time slots',
//           details: error.message,
//           stack: error.stack
//         });
//       }
//     };

//     const getEventCount = async (req, res) => {
//       const { company_id, date } = req.query;
    
//       const client = await pool.connect();
//       try {
//         const countQuery = `
//           SELECT COUNT(*) as count
//           FROM banquet_bookings
//           WHERE company_id = $1 AND booking_date = $2
//         `;
//         const countResult = await client.query(countQuery, [company_id, date]);
    
//         const bookedSlotsQuery = `
//           SELECT banquet_hall, time_slot
//           FROM banquet_bookings
//           WHERE company_id = $1 AND booking_date = $2
//         `;
//         const bookedSlotsResult = await client.query(bookedSlotsQuery, [company_id, date]);
    
//         res.json({
//           count: parseInt(countResult.rows[0].count),
//           booked_slots: bookedSlotsResult.rows
//         });
//       } catch (error) {
//         console.error('Error getting event count:', error);
//         res.status(500).json({
//           error: 'An error occurred while getting the event count',
//           details: error.message
//         });
//       } finally {
//         client.release();
//       }
//     };

// const createBanquetBooking = async (req, res) => {
//   console.log('Received booking request:', req.body);

//   const { 
//     company_id, user_id, banquet_hall, event_name, booking_date, time_slot,phone_number,address,function_type,meal_type,person_count
//   } = req.body;

//   if (!company_id || !user_id || !banquet_hall || !event_name || !booking_date || !time_slot) {
//     const missingFields = ['company_id', 'user_id', 'banquet_hall', 'event_name', 'booking_date', 'time_slot']
//       .filter(field => !req.body[field]);
//     return res.status(400).json({ error: 'Missing required fields', missingFields });
//   }

//   const client = await pool.connect();

//   try {
//     // Check if the time slot is already booked
//     const checkQuery = `
//       SELECT id FROM banquet_bookings 
//       WHERE company_id = $1 AND banquet_hall = $2
//       AND booking_date = $3 AND time_slot = $4
//     `;
//     const checkResult = await client.query(checkQuery, [company_id, banquet_hall, booking_date, time_slot]);

//     if (checkResult.rows.length > 0) {
//       return res.status(409).json({ error: 'This time slot is already booked' });
//     }


//     // Create the booking
//     const insertQuery = `
//       INSERT INTO banquet_bookings 
//       (company_id, user_id, banquet_hall, booking_date, time_slot, event_name, 
//        phone_number, address, function_type, meal_type, person_count)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//       RETURNING *
//     `;
//     const values = [
//       company_id, user_id, banquet_hall, booking_date, time_slot, event_name,
//       phone_number, address, function_type, meal_type, person_count
//     ];

//     const result = await client.query(insertQuery, values);
//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error creating banquet booking:', error);
//     res.status(500).json({
//       error: 'An error occurred while creating the booking',
//       details: error.message
//     });
//   } finally {
//     client.release();}};

// module.exports = {
//   updateBanquetTimeSlots,getTimeSlots,getEventCount,createBanquetBooking,
//   updateEvent,getEventDetails,getBanquetHalls,  getUserEvents,  createEvent,  getBanquetDetails,validateEventDetails
// };