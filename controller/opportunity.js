const { pool } = require("../database");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const moment = require("moment-timezone");

//To Show all the opportunities
const showOpportunity = (req, res) => {
  const {
    customerEntities,
    type,
    value,
    closureTime,
    status,
    licenseFrom,
    licenseTo,
    licenseType,
    dateFilterType,
    fromDate,
    toDate,
    period
  } = req.query;

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
        connection.release();
        return;
      }

      let query = `
      SELECT id, customer_entity, name, description, type, period, value, closure_time, status, license_from, license_to, License_type, created_at, update_at
      FROM opportunity
      `;

      let query2 = `
      SELECT COUNT(customer_entity) as TotalEntity, SUM(value) as TotalValue, COUNT(License_type) as TotalLicenseType, COUNT(type) as TotalType
      FROM opportunity
      `;

      let filterConditions = [];

      if (customerEntities && customerEntities.length > 0) {
        const customerEntitiesList = customerEntities
          .map((entity) => `'${entity}'`)
          .join(",");
        filterConditions.push(`customer_entity IN (${customerEntitiesList})`);
      }

      if (type && Array.isArray(type)) {
        const TypeConditions = type.map(type => `type LIKE '%${type}%'`);
        if (TypeConditions.length > 0) {
          filterConditions.push(`(${TypeConditions.join(" OR ")})`);
        }
      } else if (type) {
        filterConditions.push(`type LIKE '${type}'`);
      }

      if (licenseType && Array.isArray(licenseType)) {
        const LicenseTypeConditions = licenseType.map(licenseType => `License_type LIKE '${licenseType}'`);
        if (LicenseTypeConditions.length > 0) {
          filterConditions.push(`(${LicenseTypeConditions.join(" OR ")})`);
        }
      } else if (licenseType) {
        filterConditions.push(`License_type LIKE '${licenseType}'`);
      }

      if (value) {
        filterConditions.push(`value LIKE '%${value}%'`);
      }

      if (closureTime) {
        filterConditions.push(`closure_time LIKE '%${closureTime}%'`);
      }

      if (status && Array.isArray(status)) {
        const statusConditions = status.map(status => `status LIKE '%${status}%'`);
        if (statusConditions.length > 0) {
          filterConditions.push(`(${statusConditions.join(" OR ")})`);
        }
      } else if (status) {
        filterConditions.push(`status LIKE '${status}'`);
      }

      if (period) {
        filterConditions.push(`period LIKE '%${period}%'`);
      }

      if (licenseFrom && licenseTo) {
        filterConditions.push(`license_from >= '${licenseFrom}' OR license_to <= '${licenseTo}'`);
      } else if (licenseFrom) {
        filterConditions.push(`license_from >= '${licenseFrom}'`);
      } else if (licenseTo) {
        filterConditions.push(`license_to <= '${licenseTo}'`);
      }

      if (dateFilterType && fromDate && toDate) {
        if (dateFilterType === "equal") {
          filterConditions.push(
            `DATE(license_from) = '${fromDate}' AND DATE(license_to) = '${toDate}'`
          );
        } else if (dateFilterType === "before") {
          filterConditions.push(
            `DATE(license_from) < '${fromDate}' AND DATE(license_to) < '${toDate}'`
          );
        } else if (dateFilterType === "after") {
          filterConditions.push(
            `DATE(license_from) > '${fromDate}' AND DATE(license_to) > '${toDate}'`
          );
        } else if (dateFilterType === "between") {
          filterConditions.push(
            `DATE(license_from) BETWEEN '${fromDate}' AND '${toDate}'`
          );
        }
      }

      if (filterConditions.length > 0) {
        query += ` WHERE ${filterConditions.join(" AND ")}`;
        query2 += ` WHERE ${filterConditions.join(" AND ")}`;
      }

      query += ` ORDER BY id`;

      connection.query(query, (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        connection.query(query2, (error2, results2) => {
          if (error2) {
            console.error("Error executing second query:", error2);
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
            res.status(200).json({ products: results, aggregates: results2[0] });
          });
        });
      });
    });
  });
};

//To Show only the opportunity which was selected
const showOneOpportunity = async (req, res) => {
  const dealerQuery = `
  SELECT 
    o.id, 
    o.customer_entity, 
    o.name, 
    o.description, 
    o.type, 
    o.License_type, 
    o.period, 
    o.value, 
    o.closure_time, 
    o.status, 
    o.license_from, 
    o.license_to, 
    o.pdf,
    c.phone, 
    c.email
FROM 
    opportunity o
LEFT JOIN 
    (
        SELECT 
            customer_entity, 
            name, 
            phone, 
            email
        FROM 
            contact
        GROUP BY 
            customer_entity, 
            name
    ) c 
ON 
    o.customer_entity = c.customer_entity 
    AND o.name = c.name
WHERE 
    o.id = ?
  `;

  pool.query(dealerQuery, [req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    if (results.length > 0) {
      const opportunity = results[0];
      if (opportunity.pdf) {
        opportunity.pdf = opportunity.pdf.toString('base64');
      }
    }
    res.status(200).json(results);
  });
};

//To add New opportyunit
const addOpportunity = async (req, res) => {
  const addOpportunityQuery = `
    INSERT INTO opportunity
    (customer_entity, name, description, type, License_type, value, closure_time, status, period, license_from, license_to, pdf,created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
  `;

  const addLogQuery = `
    INSERT INTO opportunitylog
    (eventLog, created_at)
    VALUES (?, now())
  `;

  // Extract values from the request body
  const {
    customer_entity,
    name,
    description,
    type,
    License_type,
    value,
    closure_time,
    status,
    period,
    license_from,
    license_to,
    pdf,
    user_name,
    user_surname
  } = req.body;

  // Set default values for license_from and license_to if they are not provided
  const licenseFrom = license_from || null;
  const licenseTo = license_to || null;

  // Handle the PDF data if it's provided
  let pdfBuffer = null;
  if (pdf) {
    try {
      pdfBuffer = Buffer.from(pdf.split(',')[1], 'base64');
    } catch (error) {
      console.error("Error decoding PDF data:", error);
      return res.status(400).json({ error: "Invalid PDF data" });
    }
  }

  const opportunityValues = [
    customer_entity,
    name,
    description,
    type,
    License_type,
    value,
    closure_time,
    status,
    period,
    licenseFrom,
    licenseTo,
    pdfBuffer
  ];

  const logEvent = `${user_name} ${user_surname} added Opportunity for ${customer_entity} for ${type} ${License_type} from ${licenseFrom} to  ${licenseTo}`;

  try {
    // Insert into opportunity table
    await new Promise((resolve, reject) => {
      pool.query(addOpportunityQuery, opportunityValues, (error, results) => {
        if (error) {
          console.error("Error executing query:", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Insert into opportunitylog table
    await new Promise((resolve, reject) => {
      pool.query(addLogQuery, [logEvent], (error, results) => {
        if (error) {
          console.error("Error inserting log:", error);
          reject(error);
        } else {
          resolve();
        }
      });
    });

    res.json({ message: "Opportunity added successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//to edit opportunity
const editOpportunity = async (req, res) => {
  const {
    customer_entity,
    name,
    description,
    type,
    License_type,
    value,
    closure_time,
    status,
    period,
    license_from,
    license_to,
    user_name,
    user_surname
  } = req.body;

  const pdf = req.files && req.files.length > 0 ? req.files[0].buffer : null;

  // Convert date fields to ISO format without time if provided
  const closureTime = closure_time ? new Date(closure_time).toISOString().split('T')[0] : null;
  const licenseFrom = license_from ? new Date(license_from).toISOString().split('T')[0] : null;
  const licenseTo = license_to ? new Date(license_to).toISOString().split('T')[0] : null;

  // Update query
  let updateOpportunityQuery = `
    UPDATE opportunity 
    SET
      customer_entity = ?,
      name = ?,
      description = ?,
      type = ?,
      License_type = ?,
      value = ?,
      closure_time = ?,
      status = ?,
      period = ?,  
      license_from = ?,
      license_to = ?,
      update_at = now()
  `;

  const opportunityValues = [
    customer_entity,
    name,
    description,
    type,
    License_type,
    value,
    closureTime,
    status,
    period,
    licenseFrom,
    licenseTo
  ];

  // Log query
  const logEvent = `${user_name} ${user_surname} edited Opportunity for ${customer_entity} for ${type} ${License_type} from ${licenseFrom} to  ${licenseTo}`;
  const addLogQuery = `
    INSERT INTO opportunitylog
    (eventLog, created_at)
    VALUES (?, now())
  `;

  // Add PDF field to the update query if provided
  if (pdf) {
    updateOpportunityQuery += `, pdf = ?`;
    opportunityValues.push(pdf);
  }

  // Add WHERE clause to target specific opportunity by id
  updateOpportunityQuery += ` WHERE id = ?;`;
  opportunityValues.push(req.params.id);

  let connection;

  try {
    // Get a connection from the pool
    connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });

    // Start a transaction
    await new Promise((resolve, reject) => {
      connection.beginTransaction(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Execute the update query
    await new Promise((resolve, reject) => {
      connection.query(updateOpportunityQuery, opportunityValues, (error, results) => {
        if (error) {
          console.error("Error executing update query:", error);
          reject(error);
        } else {
          resolve(results);
        }
      });
    });

    // Log the update action
    await new Promise((resolve, reject) => {
      connection.query(addLogQuery, [logEvent], (error, results) => {
        if (error) {
          console.error("Error inserting log:", error);
          reject(error);
        } else {
          resolve(results);
        }
      });
    });

    // Commit the transaction
    await new Promise((resolve, reject) => {
      connection.commit(err => {
        if (err) {
          console.error("Error committing transaction:", err);
          connection.rollback(() => reject(err));
        } else {
          resolve();
        }
      });
    });

    // Send success response
    res.json({ message: "Opportunity updated successfully" });
  } catch (error) {
    // Rollback transaction in case of error
    if (connection) {
      await new Promise(resolve => {
        connection.rollback(() => resolve());
      });
    }

    console.error("Transaction failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    // Release the connection back to the pool
    if (connection) connection.release();
  }
};

//To Delete Opportunity
const deleteOpportunity = (req, res) => {
  const query = "SELECT customer_entity, description,type, License_type FROM opportunity WHERE id = ?";
  const query1 = "DELETE FROM alert WHERE alert_entity = ? AND alert_description = ? AND alert_type = ? AND License_type = ?";
  const query2 = "DELETE FROM opportunity WHERE id = ?";

  const opportunityId = req.body.id;

  // First, get the required details from the opportunity
  pool.query(query, [opportunityId], (error, results) => {
    if (error) {
      console.error("Error executing SELECT query:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: "Not Found: No matching opportunity found for deletion",
      });
    }

    const { customer_entity, description,type, License_type } = results[0];

    // Execute the DELETE on the alert table
    pool.query(query1, [customer_entity, description,type, License_type], (error) => {
      if (error) {
        console.error("Error executing DELETE query on alert table:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // Execute the DELETE on the opportunity table
      pool.query(query2, [opportunityId], (error) => {
        if (error) {
          console.error("Error executing DELETE query on opportunity table:", error);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        res.json({ message: "Opportunity and related alerts deleted successfully" });
      });
    });
  });
};

//To send all the cudtomer names to frontend for filters
const name = async (req, res) => {
  // Use the promisified pool.query function
  const customerEntity = req.body.customer_entity;
  //console.log(customerEntity);
  const dealerQuery = `
      SELECT  name FROM contact
      where customer_entity = ?
    `;

  pool.query(dealerQuery, [customerEntity], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(results);
  });
};

const transporter = nodemailer.createTransport({
  host: process.env.SMPT_HOST,
  port: process.env.SMPT_PORT,
  service: process.env.SMPT_SERVICE,
  secure: true, 
  auth: {
    user: process.env.SMPT_MAIL,
    pass: process.env.SMPT_PASSWORD,
  },
});

// Function to send email alerts
const sendEmailAlert = (alertDetails) => {
  const mailOptions = {
    from: `${process.env.SMPT_MAIL}`,
    to: "madhu.i@techsa.net",
    cc: "himani.g@techsa.net, sanjiv.s@techsa.net",
    subject: "Opportunity Expiry Alert",
    text: `
    An opportunity has arisen for ${alertDetails.customer_entity} to acquire ${alertDetails.description} in ${alertDetails.type} for the ${alertDetails.License_type} license type. These licenses are set to expire in ${alertDetails.daysLeft} days, on ${alertDetails.license_to}.
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

//Storing the alerts in DB
const storeAlertInDatabase = (alertDetails) => {
  const checkQuery = `
    SELECT COUNT(*) AS count FROM alert 
    WHERE alert_entity = ? AND license_to = ? AND alert_type = ?
  `;

  pool.query(
    checkQuery,
    [alertDetails.customer_entity, alertDetails.license_to, alertDetails.type],
    (error, results) => {
      if (error) {
        console.error("Error checking for existing alert in database:", error);
        return;
      }

      const count = results[0].count;
      if (count > 0) {
        console.log("Alert already exists in database. Skipping insertion.");
        return;
      }

      const insertQuery = `
        INSERT INTO alert (alert_entity, alert_description, license_to, alert_type, License_type, daysLeft, acknowledge, po_lost, reminder)
        VALUES (?, ?, ?, ?, ?, ?, 'No', 'No', 'No')
      `;

      pool.query(
        insertQuery,
        [
          alertDetails.customer_entity,
          alertDetails.description,
          alertDetails.license_to,
          alertDetails.type,
          alertDetails.License_type,
          alertDetails.daysLeft,
        ],
        (error, results) => {
          if (error) {
            console.error("Error storing/updating alert in database:", error);
          } else {
            console.log("Alert stored/updated in database:", results.insertId);
            // Send email alert only if a new alert is stored
            sendEmailAlert(alertDetails);
          }
        }
      );
    }
  );
};

//This check the dates of the license weather it in range of 45,30,15
const checkOpportunities = () => {
  console.log(`Task started`);

  const query = `
    SELECT id, customer_entity, description, license_from, license_to, type, License_type, period
    FROM opportunity
  `;

  pool.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return;
    }

    const today = moment().tz('Asia/Kolkata').startOf('day');

    results.forEach((opportunity) => {
      const licenseTo = moment(opportunity.license_to).tz('Asia/Kolkata').startOf('day');
      const daysLeft = licenseTo.diff(today, 'days');
      const formattedLicenseToDate = licenseTo.format('ddd MMM D YYYY');
      const formattedLicenseFromDate = moment(opportunity.license_from).tz('Asia/Kolkata').format('ddd MMM D YYYY');

      if (daysLeft <= 45 && daysLeft > 0) {
        const alertDetails = {
          customer_entity: opportunity.customer_entity,
          description: opportunity.description,
          license_from: formattedLicenseFromDate,
          license_to: formattedLicenseToDate,
          type: opportunity.type,
          License_type: opportunity.License_type,
          daysLeft: daysLeft,
          period: opportunity.period
        };

        // Store alert details in the database
       //sendEmailAlert(alertDetails)
        storeAlertInDatabase(alertDetails);
        console.log(`Alert stored for opportunity ID ${opportunity.id}:`, alertDetails);
      }
    });

    console.log(`Task completed`);
  });
};

//auto update days left in alert
const updateDaysLeftInAlerts = () => {
  console.log('Updating daysLeft for all alerts...');

  const selectQuery = `
    SELECT id, license_to, alert_entity, alert_description, alert_type, License_type
    FROM alert
    WHERE daysLeft != 0
  `;

  pool.query(selectQuery, (error, results) => {
    if (error) {
      console.error('Error fetching alerts from database:', error);
      return;
    }

    const currentDate = moment().tz('Asia/Kolkata').startOf('day');

    results.forEach(alert => {
      const licenseToDate = moment(alert.license_to, 'ddd MMM D YYYY').tz('Asia/Kolkata').startOf('day');
      if (!licenseToDate.isValid()) {
        console.error(`Invalid date format for alert id ${alert.id}: ${alert.license_to}`);
        return;
      }

      const daysLeft = licenseToDate.diff(currentDate, 'days');

      const updateQuery = `
        UPDATE alert
        SET daysLeft = ?
        WHERE id = ?
      `;

      pool.query(updateQuery, [daysLeft, alert.id], (updateError) => {
        if (updateError) {
          console.error(`Error updating daysLeft for alert id ${alert.id}:`, updateError);
        } else {
          console.log(`Updated daysLeft for alert id ${alert.id}`);

          if (daysLeft === 15 || daysLeft === 30) {
            sendEmailAlert({
              customer_entity: alert.alert_entity,
              description: alert.alert_description,
              type: alert.alert_type,
              License_type: alert.License_type,
              daysLeft: daysLeft,
              license_to: alert.license_to
            });
          }
        }
      });
    });
  });
};

//send alert to frontend
const sendAlert = async (req, res) => {
  const { customerEntity, type, licenseType } = req.query;


  let dealerQuery = `
    SELECT id, alert_entity, alert_description, license_to, alert_type, daysLeft, License_type, acknowledge, po_lost, reminder 
    FROM alert 
    WHERE (
      (acknowledge = "No" AND po_lost = "No" AND reminder = "No") 
      OR (daysLeft = 30 AND acknowledge = "No" AND po_lost = "No")
      OR (daysLeft <= 15 AND acknowledge = "No" AND po_lost = "No")
    )
  `;

  let filterConditions = [];

  if (customerEntity && customerEntity.length > 0) {
    const customerEntities = customerEntity.map((entity) => `'${entity}'`).join(",");
    filterConditions.push(`alert_entity IN (${customerEntities})`);
  }

  if (type && type.length > 0) {
    const typeConditions = type.map(t => `alert_type LIKE '${t}'`).join(" OR ");
    filterConditions.push(`(${typeConditions})`);
  }

  if (licenseType && licenseType.length > 0) {
    const licenseTypeConditions = licenseType.map(l => `License_type LIKE '${l}'`).join(" OR ");
    filterConditions.push(`(${licenseTypeConditions})`);
  }

  if (filterConditions.length > 0) {
    dealerQuery += ` AND (${filterConditions.join(" AND ")})`;
  }

  dealerQuery += ` ORDER BY id desc`;

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }


    res.status(200).json({ products: results });
  });
};

// Schedule the task to run daily at 11:00 AM IST
cron.schedule('00 11 * * *', () => {
  console.log(`[${moment().tz('Asia/Kolkata').format()}] Scheduled task triggered`);
  checkOpportunities();
  updateDaysLeftInAlerts();
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const sendPo = async (req, res) => { 
  const { customerEntity = [], type = [], licenseType = [] } = req.query;
  let dealerQuery = `
  SELECT id, alert_entity, alert_description, license_to, alert_type, License_type, daysLeft, acknowledge, po_lost, edited 
  FROM alert 
  WHERE acknowledge = "Yes" and visible = "Yes"
  `;

  let filterConditions = [];

  if (customerEntity.length > 0) {
    const customerEntities = customerEntity.map((entity) => `'${entity}'`).join(",");
    filterConditions.push(`alert_entity IN (${customerEntities})`);
  }

  if (type.length > 0) {
    const typeConditions = type.map(t => `alert_type LIKE '%${t}%'`).join(" OR ");
    filterConditions.push(`(${typeConditions})`);
  }

  if (licenseType.length > 0) {
    const licenseTypeConditions = licenseType.map(l => `License_type LIKE '%${l}%'`).join(" OR ");
    filterConditions.push(`(${licenseTypeConditions})`);
  }

  if (filterConditions.length > 0) {
    dealerQuery += ` AND (${filterConditions.join(" AND ")})`;
  }

  dealerQuery += ` ORDER BY acknowledgeTime desc`;

  //console.log("Final Query:", dealerQuery);  // Add logging to debug the final query

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json({ products: results });
  });
};

const acknowledge = async (req, res) => {
  const { id } = req.body;

  // First, retrieve the customer_entity using the alert ID
  const getCustomerEntityQuery = `
    SELECT alert_entity 
    FROM alert
    WHERE id = ?
  `;

  const updateAlertQuery = `
    UPDATE alert
    SET acknowledge = 'Yes'
    , acknowledgeTime = Now()
    WHERE id = ?
  `;

  const addLogQuery = `
    INSERT INTO alertlog
    (EventLog, created_at)
    VALUES (?, now())
  `;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to database:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    // First, retrieve the customer_entity from the alert
    connection.query(getCustomerEntityQuery, [id], (error, results) => {
      if (error) {
        console.error("Error retrieving customer entity:", error);
        connection.release();
        return res.status(500).send("Server error");
      }

      if (results.length === 0) {
        connection.release();
        return res.status(404).send("Alert not found");
      }

      const customerEntity = results[0].alert_entity;
      const logEvent = `${customerEntity} PO was won`;

      // Now, update the alert to acknowledge it
      connection.query(updateAlertQuery, [id], (error, results) => {
        if (error) {
          console.error("Error acknowledging alert:", error);
          connection.release();
          return res.status(500).send("Server error");
        }

        // After updating the alert, insert the event log
        connection.query(addLogQuery, [logEvent], (error, results) => {
          if (error) {
            console.error("Error inserting event log:", error);
            connection.release();
            return res.status(500).send("Server error");
          }

          // Finally, release the connection and send a response
          connection.release();
          res.send("Alert acknowledged and log added");
        });
      });
    });
  });
};

const reminder = async (req, res) => {
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET reminder = 'Yes'
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert acknowledged");
    }
  });
};

const PoLost = async (req, res) => {
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET 	po_lost = 'Yes'
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert acknowledged");
    }
  });
};

const customerEntityAlert = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT distinct alert_entity FROM alert
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

const customerPOEntityAlert = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT distinct alert_entity FROM alert
      WHERE acknowledge = "Yes"
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

const product = (req, res) => {
  const dealerQuery = `SELECT DISTINCT(type) AS name FROM opportunity`;

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    // Map results to include an id field
    const types = results.map((row, index) => ({
      id: index,
      name: row.name
    }));

    res.status(200).json(types);
  });
};

const editAlertOpportunity = (req, res) => {
  const { alert_entity, alert_description, alert_type, License_type } = req.body;

  if (!alert_entity || !alert_description || !alert_type || !License_type) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const query = `
    SELECT id
    FROM opportunity
    WHERE customer_entity = ?
    AND description = ?
    AND type = ?
    AND License_type = ?
  `;

  pool.query(
    query,
    [alert_entity, alert_description, alert_type, License_type],
    (error, results) => {
      if (error) {
        console.error("Error querying opportunity:", error);
        return res.status(500).json({ error: "Database query failed" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "Opportunity not found" });
      }

      const { id: opportunityId } = results[0]; // Assuming 'id' is the field name in the database

      return res.status(200).json({ id: opportunityId });
    }
  );
};

const revertPO = (req, res) => {
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET 	acknowledge = 'No',
      acknowledgeTime = null
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert reverted");
    }
  });
}

const editedPOopportunity = (req, res) =>{
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET 	edited = 'Yes'
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert Edited");
    }
  });
}

const noShowPo = (req, res) =>{
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET 	visible = 'No'
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert Edited");
    }
  });
}

const showHiddenPo = (req, res) =>{
  const { customerEntity = [], type = [], licenseType = [] } = req.query;
  let dealerQuery = `
        select *
      from alert 
      where	visible = 'No'
  `;

  let filterConditions = [];

  if (customerEntity.length > 0) {
    const customerEntities = customerEntity.map((entity) => `'${entity}'`).join(",");
    filterConditions.push(`alert_entity IN (${customerEntities})`);
  }

  if (type.length > 0) {
    const typeConditions = type.map(t => `alert_type LIKE '%${t}%'`).join(" OR ");
    filterConditions.push(`(${typeConditions})`);
  }

  if (licenseType.length > 0) {
    const licenseTypeConditions = licenseType.map(l => `License_type LIKE '%${l}%'`).join(" OR ");
    filterConditions.push(`(${licenseTypeConditions})`);
  }

  if (filterConditions.length > 0) {
    dealerQuery += ` AND (${filterConditions.join(" AND ")})`;
  }

  dealerQuery += ` ORDER BY acknowledgeTime desc`;

  //console.log("Final Query:", dealerQuery);  // Add logging to debug the final query

  pool.query(dealerQuery, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json({ products: results });
  });
}

const revertToPO = (req, res) =>{
  const { id } = req.body;
  //console.log(id);
  const query = `
      UPDATE alert
      SET 	visible = 'Yes'
      WHERE id = ?
  `;

  pool.query(query, [id], (error, results) => {
    if (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).send("Server error");
    } else {
      res.send("Alert reverted");
    }
  });
}

module.exports = {
  showOpportunity,
  showOneOpportunity,
  addOpportunity,
  editOpportunity,
  name,
  deleteOpportunity,
  acknowledge,
  sendAlert,
  customerEntityAlert,
  PoLost,
  sendPo,
  reminder,
  product,
  customerPOEntityAlert,
  editAlertOpportunity,
  revertPO,
  editedPOopportunity,
  noShowPo,
  showHiddenPo,
  revertToPO
};