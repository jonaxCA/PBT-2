'use strict';

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL pool configuration
const pool = new Pool({
    user: 'your_username',
    host: 'localhost',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
});

// Route to process battery data
router.post('/mediciones', async (req, res) => {
    const { batteryLevel, timestamp } = req.body;

    // Validate input
    if (typeof batteryLevel !== 'number' || batteryLevel < 0 || batteryLevel > 100) {
        return res.status(400).json({ error: 'Invalid battery level. Must be a number between 0 and 100.' });
    }

    if (!timestamp) {
        return res.status(400).json({ error: 'Timestamp is required.' });
    }

    try {
        // Insert data into PostgreSQL
        const query = 'INSERT INTO battery_data(battery_level, timestamp) VALUES($1, $2) RETURNING *';
        const values = [batteryLevel, timestamp];

        const result = await pool.query(query, values);
        return res.status(201).json({ message: 'Data stored successfully.', data: result.rows[0] });
    } catch (error) {
        console.error('Error storing data:', error);
        return res.status(500).json({ error: 'An error occurred while storing data.' });
    }
});

module.exports = router;
