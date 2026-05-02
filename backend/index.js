import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// POST
app.post("/mediciones", async (req, res) => {
  const { dispositivo_id, voltaje, corriente, temperatura, nivel_bateria } = req.body;

  try {
    await pool.query(
      `INSERT INTO mediciones 
      (dispositivo_id, voltaje, corriente, temperatura, nivel_bateria)
      VALUES ($1,$2,$3,$4,$5)`,
      [dispositivo_id, voltaje, corriente, temperatura, nivel_bateria]
    );

    res.send("ok");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

// GET
app.get("/mediciones", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM mediciones ORDER BY timestamp DESC LIMIT 50"
  );
  res.json(result.rows);
});

// 🔥 ESTO TE FALTABA
app.listen(4000, () => {
  console.log("Backend corriendo en http://localhost:4000");
});
