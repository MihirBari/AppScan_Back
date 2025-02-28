const { pool } = require("../database");

//To add contact of a customer
const addContact = async (req, res) => {
  const addDealer = `
    INSERT INTO contact
    (customer_entity, name, designation, phone, email, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

  // Extract customer Entity from the request body
  const { customer_entity } = req.body;

  // Extract contacts array from the request body
  const contacts = req.body.contacts;

  try {
    // Iterate over each contact and insert into the database
    for (const contact of contacts) {
      const { name, designation, phone, email } = contact;
      const values = [customer_entity, name, designation, phone, email];

      await new Promise((resolve, reject) => {
        pool.query(addDealer, values, (error, results) => {
          if (error) {
            console.error("Error executing query:", error);
            reject(error);
          } else {
            //console.log("Contact added successfully:", results);
            resolve();
          }
        });
      });
    }

    res.json({ message: "Contacts added successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//To add new customer
const addCustomer = async (req, res) => {
  const addDealer = `
    INSERT INTO customer
    (customer_entity, email, address, city, state, website)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  // Extract customer Entity from the request body
  const { customer_entity, email, address, city, state, website } = req.body;

  try {

    const values = [customer_entity, email, address, city, state, website];

    await new Promise((resolve, reject) => {
      pool.query(addDealer, values, (error, results) => {
        if (error) {
          console.error("Error executing query:", error);
          reject(error);
        } else {
          //console.log("Contact added successfully:", results);
          resolve();
        }
      });
    });

    res.json({ message: "Customer added successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//To show cantacts of a paticular customer.
const showContact = (req, res) => {
  const { name, designation } = req.query;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

//console.log(req.params.id)

    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return connection.release();
      }

      // Query to get customer_entity
      let query1 = `
        SELECT customer_entity
        FROM customer 
        WHERE id = ?
      `;

      // Query to get contact details
      let query2 = `
        SELECT 
          id, customer_entity, name, designation, phone, email, created_at
        FROM contact 
        WHERE customer_entity = ?
      `;

      // Apply filters if provided
      let filterConditions = [];
      if (name) {
        filterConditions.push(`name LIKE '%${name}%'`);
      }
      if (designation) {
        filterConditions.push(`designation LIKE '%${designation}%'`);
      }
      if (filterConditions.length > 0) {
        query2 += ` AND ${filterConditions.join(" AND ")}`;
      }

      // Execute the first query
      connection.query(query1, [req.params.id], (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        if (results.length === 0) {
          // No matching customer_entity found
          return connection.rollback(() => {
            res.status(404).json({ error: "Customer not found" });
            connection.release();
          });
        }

        // Extract customer_entity
        const customerEntity = results[0].customer_entity;

        // Execute the second query
        connection.query(query2, [customerEntity], (error, contactResults) => {
          if (error) {
            console.error("Error executing second query:", error);
            return connection.rollback(() => {
              res.status(500).json({ error: "Internal Server Error" });
              connection.release();
            });
          }

          // Commit the transaction
          connection.commit((err) => {
            if (err) {
              console.error("Error committing transaction:", err);
              return connection.rollback(() => {
                res.status(500).json({ error: "Internal Server Error" });
                connection.release();
              });
            }

            connection.release();
            res.status(200).json({ products: contactResults });
          });
        });
      });
    });
  });
};

//Show All the customers
const showCustomer = (req, res) => {
  const { customerEntity, city } = req.query;
  //console.log(customerEntity)
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    // Begin transaction
    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        res.status(500).json({ error: "Internal Server Error" });
        return connection.release();
      }
    
      let query = `SELECT 
      id,customer_entity, email, address, city, state, website
          FROM customer`;

      let filterConditions = [];

      if (customerEntity && Array.isArray(customerEntity)) {
        const customerEntityConditions = customerEntity.map(customerEntity => `customer_entity LIKE'%${customerEntity}%'`);
        if (customerEntityConditions.length > 0) {
          filterConditions.push(`(${customerEntityConditions.join(" OR ")})`);
        }
      } else if (customerEntity) {
        filterConditions.push(`customer_entity LIKE '${customerEntity}'`);
      }

      // if (customerentity) {
      //   filterConditions.push(`customer_entity LIKE '%${customerentity}%'`);
      // }

      if (city && Array.isArray(city)) {
        const cityConditions = city.map(city => `city LIKE '%${city}%'`);
        if (cityConditions.length > 0) {
          filterConditions.push(`(${cityConditions.join(" OR ")})`);
        }
      } else if (city) {
        filterConditions.push(`city LIKE '${city}'`);
      }

      // if (city) {
      //   filterConditions.push(`city LIKE '%${city}%'`);
      // }

      if (filterConditions.length > 0) {
        query += ` WHERE ${filterConditions.join(" AND ")}`;
      }

      connection.query(query, (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        // Commit transaction
        connection.commit((err) => {
          if (err) {
            console.error("Error committing transaction:", err);
            return connection.rollback(() => {
              res.status(500).json({ error: "Internal Server Error" });
              connection.release();
            });
          }

          // Release connection and send response
          connection.release();
          res.status(200).json({ products: results });
        });
      });
    });
  });
};

//Show The One Contact
const showOneContact = async (req, res) => {
  const dealerQuery = `
    SELECT  customer_entity, name, designation, phone, email
    FROM contact
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

//Show One customer details
const showOneCustomer = async (req, res) => {
  const dealerQuery = `
    SELECT  customer_entity, email, address, city, state, website
    FROM customer
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

//Edit the contact details
const editContact = (req, res) => {
  const updateDealer = `
    UPDATE contact
    SET
    customer_entity = ?,
    name = ?,
    designation = ?,
    phone = ?,
    email=?,
    updated_at = NOW()
    WHERE
      id = ?;`;

  const values = [
    req.body.customer_entity,
    req.body.name,
    req.body.designation,
    req.body.phone,
    req.body.email,
    req.params.id,
  ];

  pool.query(updateDealer, values, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    //console.log("Updated dealer:", results);
    res.json(results);
  });
};

//Edit the Customer
const editCustomer = (req, res) => {
  const updateDealer = `
    UPDATE customer
    SET
    customer_entity = ?,
    email=?,
    address = ?,
    city = ?, 
    state = ?,
    website = ?
    WHERE
      id = ?;`;

  const values = [
    req.body.customer_entity,
    req.body.email,
    req.body.address,
    req.body.city,
    req.body.state,
    req.body.website,
    req.params.id,
  ];

  pool.query(updateDealer, values, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    //console.log("Updated dealer:", results);
    res.json(results);
  });
};

//Delete the contact.
const deleteContact = (req, res) => {
  const query = `DELETE FROM contact
                    WHERE id = ?`;   
  const debitorName = req.body.id;

  pool.query(query, [debitorName], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        error: "Not Found: No matching debitor_name found for deletion",
      });
    }

    //console.log("Deleted", results);
    res.json({ message: "Debitor deleted successfully" });
  });
};

//Delete the Customer.
const deleteCustomer = (req, res) => {
  const query1 = `DELETE FROM customer WHERE id = ?`;
  const query2 = `DELETE FROM contact WHERE customer_entity = ?`;
  const query3 = `DELETE FROM opportunity WHERE customer_entity = ?`;
  const customerId = req.body.id;
  const customerEntity = req.body.customer_entity;

  if (!customerId || !customerEntity) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  // Execute the first query
  pool.query(query1, [customerId], (error, results1) => {
    if (error) {
      console.error("Error executing first query:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results1.affectedRows === 0) {
      return res.status(404).json({
        error: "Not Found: No matching customer found for deletion",
      });
    }

    // Execute the second query
    pool.query(query2, [customerEntity], (error, results2) => {
      if (error) {
        console.error("Error executing second query:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results2.affectedRows === 0) {
        console.warn("No matching contact found for deletion");
      }

         // Execute the second query
    pool.query(query3, [customerEntity], (error, results3) => {
      if (error) {
        console.error("Error executing second query:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results3.affectedRows === 0) {
        console.warn("No matching contact found for deletion");
      }

      res.json({ message: "Customer and related contacts deleted successfully" });
    });
    });
  });
};

const city = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
      SELECT DISTINCT city FROM customer
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

const designation = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
      SELECT DISTINCT designation FROM contact
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

const customerentity = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT DISTINCT customer_entity FROM customer
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

const name = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT DISTINCT name FROM contact
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

const showCustomerOpportunity = (req, res) => {
  const { id } = req.body;


  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        connection.release();
        return res.status(500).json({ error: "Internal Server Error" });
      }

      let query = `
      SELECT customer_entity
      FROM customer 
      WHERE id = ?
    `;

      const query1 = `
        SELECT id, customer_entity, name, description, type, period, value, closure_time, status, license_from, license_to, License_type
        FROM opportunity 
        WHERE customer_entity = ?
      `;

      const query2 = `
        SELECT SUM(value) as TotalValue, COUNT(License_type) as TotalLicenseType, COUNT(type) as TotalType
        FROM opportunity
        WHERE customer_entity = ?
      `;

      //console.log(customer_entity)
      connection.query(query, [id], (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        //console.log(results)

        const customerEntity = results[0].customer_entity;

      connection.query(query1, [customerEntity], (error, results1) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        connection.query(query2, [customerEntity], (error2, results2) => {
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
            res.status(200).json({ products: results1, aggregates: results2[0] });
          });
        });
      });
    })
    });
  });
};

const showSummaryContact = (req, res) => {
  
  const { name, designation } = req.query;

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

      // Query to get customer_entity
      let query1 = `
        SELECT customer_entity
        FROM opportunity 
        WHERE id = ?
      `;

      // Query to get contact details
      let query2 = `
        SELECT 
          id, customer_entity, name, designation, phone, email, created_at
        FROM contact 
        WHERE customer_entity = ?
      `;

      // Apply filters if provided
      let filterConditions = [];
      if (name) {
        filterConditions.push(`name LIKE '%${name}%'`);
      }
      if (designation) {
        filterConditions.push(`designation LIKE '%${designation}%'`);
      }
      if (filterConditions.length > 0) {
        query2 += ` AND ${filterConditions.join(" AND ")}`;
      }

      // Execute the first query
      connection.query(query1, [req.params.id], (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        if (results.length === 0) {
          // No matching customer_entity found
          return connection.rollback(() => {
            res.status(404).json({ error: "Customer not found" });
            connection.release();
          });
        }

        // Extract customer_entity
        const customerEntity = results[0].customer_entity;

        // Execute the second query
        connection.query(query2, [customerEntity], (error, contactResults) => {
          if (error) {
            console.error("Error executing second query:", error);
            return connection.rollback(() => {
              res.status(500).json({ error: "Internal Server Error" });
              connection.release();
            });
          }

          // Commit the transaction
          connection.commit((err) => {
            if (err) {
              console.error("Error committing transaction:", err);
              return connection.rollback(() => {
                res.status(500).json({ error: "Internal Server Error" });
                connection.release();
              });
            }

            connection.release();
            res.status(200).json({ products: contactResults });
          });
        });
      });
    });
  });
};

const Contactcustomerentity = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT customer_entity FROM customer
    where id = ?
  `;

  pool.query(dealerQuery,[req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(results);
  });
};

const summaryContactCustomerentity = async (req, res) => {
  // Use the promisified pool.query function
  const dealerQuery = `
    SELECT customer_entity FROM opportunity
    where id = ?
  `;

  pool.query(dealerQuery,[req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(results);
  });
};

const showSummaryOpportunity = (req, res) => {
  const { id } = req.body;


  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting database connection:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error beginning transaction:", err);
        connection.release();
        return res.status(500).json({ error: "Internal Server Error" });
      }

      let query = `
      SELECT customer_entity
      FROM opportunity 
      WHERE id = ?
    `;

      const query1 = `
        SELECT id, customer_entity, name, description, type, period, value, closure_time, status, license_from, license_to, License_type
        FROM opportunity 
        WHERE customer_entity = ?
      `;

      const query2 = `
        SELECT SUM(value) as TotalValue, COUNT(License_type) as TotalLicenseType, COUNT(type) as TotalType
        FROM opportunity
        WHERE customer_entity = ?
      `;

      //console.log(customer_entity)
      connection.query(query, [id], (error, results) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        //console.log(results)

        const customerEntity = results[0].customer_entity;

      connection.query(query1, [customerEntity], (error, results1) => {
        if (error) {
          console.error("Error executing first query:", error);
          return connection.rollback(() => {
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        connection.query(query2, [customerEntity], (error2, results2) => {
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
            res.status(200).json({ products: results1, aggregates: results2[0] });
          });
        });
      });
    })
    });
  });
};

module.exports = {
  showContact,
  showOneContact,
  addContact,
  editContact,
  deleteContact,
  designation,
  city,
  customerentity,
  name,
  addCustomer,
  editCustomer,
  showCustomer,
  deleteCustomer,
  showOneCustomer,
  showCustomerOpportunity,
  showSummaryContact,
  Contactcustomerentity,
  summaryContactCustomerentity,
  showSummaryOpportunity
};
