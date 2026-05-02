const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

// PostgreSQL Database Connection
dconst pool = new Pool({
    user: 'your_username',
    host: 'localhost',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
});

// Middleware to handle JSON requests
router.use(express.json());

// Create a new battery device
router.post('/battery', async (req, res) => {
    const { name, type, capacity } = req.body;
    try {
        const result = await pool.query('INSERT INTO batteries (name, type, capacity) VALUES ($1, $2, $3) RETURNING *', [name, type, capacity]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all battery devices
router.get('/batteries', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM batteries');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get a specific battery device
router.get('/battery/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM batteries WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Battery device not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update a battery device
router.put('/battery/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, capacity } = req.body;
    try {
        const result = await pool.query('UPDATE batteries SET name = $1, type = $2, capacity = $3 WHERE id = $4 RETURNING *', [name, type, capacity, id]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Battery device not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a battery device
router.delete('/battery/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM batteries WHERE id = $1', [id]);
        if (result.rowCount > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ error: 'Battery device not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;