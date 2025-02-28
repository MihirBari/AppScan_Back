const { pool } = require("../database");
const XLSX = require("xlsx");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const addEmployes = async (req, res) => {
  const { contacts } = req.body; // Assuming the structure matches what React sends

  const insertQuery = `
      INSERT INTO employes (id, name, surname, designation, joining_date, last_date, status, DOB,team, personal_email)
      VALUES ?
    `;

  const values = contacts.map((contact) => {
    // Check and replace empty dates with null
    const lastDate = contact.last_date === "" ? null : contact.last_date;
    const status = lastDate ? "Inactive" : "Active";
    
    return [
      contact.id,
      contact.name,
      contact.surname,
      contact.designation,
      contact.joining_date === "" ? null : contact.joining_date,
      lastDate,
      status,
      contact.DOB === "" ? null : contact.DOB,
      Array.isArray(contact.team) ? contact.team.join(",") : null, 
      contact.personal_email,
    ];
  });

  try {
    await new Promise((resolve, reject) => {
      pool.query(insertQuery, [values], (error, results) => {
        if (error) {
          console.error("Error executing query:", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    res.json({ message: "Employees added successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const allEmployes = async (req, res) => {
  const { name, surname, status} = req.query;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return connection.release();
      }

      let query = `SELECT * FROM employes`;

      let filterConditions = [];

      if (name && Array.isArray(name)) {
        const nameConditions = name.map((n) => connection.escape(`%${n}%`));
        if (nameConditions.length > 0) {
          filterConditions.push(
            `name LIKE ${nameConditions.join(" OR name LIKE ")}`
          );
        }
      } else if (name) {
        filterConditions.push(`name LIKE ${connection.escape(`%${name}%`)}`);
      }

      if (surname && Array.isArray(surname)) {
        const surnameConditions = surname.map((s) =>
          connection.escape(`%${s}%`)
        );
        if (surnameConditions.length > 0) {
          filterConditions.push(
            `surname LIKE ${surnameConditions.join(" OR surname LIKE ")}`
          );
        }
      } else if (surname) {
        filterConditions.push(
          `surname LIKE ${connection.escape(`%${surname}%`)}`
        );
      }

      if (status) {
        filterConditions.push(
          `status LIKE ${connection.escape(`${status}`)}`
        );
      }

      if (filterConditions.length > 0) {
        query += ` WHERE ${filterConditions.join(" AND ")}`;
      }

      query += ` ORDER BY id`;

      connection.query(query, (error, results) => {
        if (error) {
          console.error("Error executing query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        connection.commit((err) => {
          if (err) {
            console.error("Error committing transaction:", err);
            return connection.rollback(() => {
              res.status(500).json({ error: "Internal Server Error" });
              connection.release();
            });
          }
          connection.release();
          res.status(200).json({ products: results });
        });
      });
    });
  });
};

const editEmployes = async (req, res) => {
  // Set status based on the presence of last_date
  let status;
  if (req.body.last_date !== "") {
    status = "Inactive";
  } else {
    status = "Active";
  }

  const updateDealer = `
    UPDATE employes
    SET
    id = ?,
    name = ?,
    surname = ?,
    designation = ?,
    joining_date = ?,
    last_date = ?,
    status = ?,
    DOB = ?,
    team = ?,
    personal_email = ?
    WHERE
      id = ?;`;

  const values = [
    req.body.id,
    req.body.name,
    req.body.surname,
    req.body.designation,
    req.body.joining_date === "" ? null : req.body.joining_date,
    req.body.last_date === "" ? null : req.body.last_date,
    status,
    req.body.DOB === "" ? null : req.body.DOB,
    Array.isArray(req.body.team) ? req.body.team.join(",") : null, 
    req.body.personal_email,
    req.params.id,
  ];
  pool.query(updateDealer, values, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.json(results);
  });
};

const viewEmployes = async (req, res) => {
  const dealerQuery = `
    SELECT  *
    FROM employes
    WHERE id = ?
  `;

  pool.query(dealerQuery, [req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    //console.log("Dealer details:", results);
    res.status(200).json(results);
  });
};

const name = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
      SELECT distinct name FROM employes
    `;

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(results);
  });
};

const surname = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
      SELECT distinct surname FROM employes
    `;

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(results);
  });
};

const deleteEmployes = (req, res) => {
  const query = "DELETE FROM employes WHERE name = ? AND surname = ?";
  const debitorName = req.body.name;
  const debitorSurname = req.body.surname;

  pool.query(query, [debitorName, debitorSurname], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        error: "Not Found: No matching debitor found for deletion",
      });
    }

    res.json({ message: "Debitor deleted successfully" });
  });
};

const importExcel = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert Excel data to JSON format
    const excelData = XLSX.utils.sheet_to_json(sheet);

    // Map and convert dates from dd-mm-yyyy to yyyy-mm-dd format and set status based on last_date
    const dataToInsert = excelData.map((row) => {
      const joiningDate = formatDate(row.joining_date);
      const lastDate = formatDate(row.last_date);
      const status = lastDate ? "Inactive" : "Active";
      const dob = formatDate(row.DOB);

      return [
        row.id,
        row.name,
        row.surname,
        row.designation,
        joiningDate,
        lastDate,
        status,
        dob,
        row.team,
        row.personal_email,
      ];
    });

    // Function to format date from dd-mm-yyyy to yyyy-mm-dd
    function formatDate(dateString) {
      // Handle undefined or null gracefully
      if (!dateString) return null;

      // Check if dateString is a number (Excel date serial number)
      if (typeof dateString === 'number' && !isNaN(dateString)) {
        const date = new Date(Math.round((dateString - 25569) * 86400 * 1000));
        // Convert to yyyy-mm-dd format
        return date.toISOString().slice(0, 10);
      }

      // If dateString is already in expected format (dd-mm-yyyy), convert it
      if (typeof dateString === 'string') {
        const parts = dateString.split('-');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      return null; // Handle other unexpected formats
    }

    // Insert or update data into the database using a connection from the pool
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting MySQL connection:", err);
        return res.status(500).json({ error: "Database connection error" });
      }

      const sql = `
        INSERT INTO employes (id, name, surname, designation, joining_date, last_date, status, DOB, team, personal_email)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        surname = VALUES(surname),
        designation = VALUES(designation),
        joining_date = VALUES(joining_date),
        last_date = VALUES(last_date),
        status = VALUES(status),
        DOB = VALUES(DOB),
        team = VALUES(team),
        personal_email = VALUES(personal_email)
      `;

      connection.query(sql, [dataToInsert], (err, results) => {
        connection.release(); // Release the connection back to the pool

        if (err) {
          console.error("Error inserting data into MySQL:", err);
          return res.status(500).json({ error: "Database insertion error" });
        }

        res.json({ message: "File uploaded and data inserted/updated successfully" });
      });
    });
  } catch (error) {
    console.error("Error uploading Excel file:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  addEmployes,
  allEmployes,
  editEmployes,
  viewEmployes,
  name,
  surname,
  deleteEmployes,
  importExcel,
};