const { pool } = require("../database");
const nodemailer = require("nodemailer");

const showApplicationLeave = (req, res) => {
  const { fromDate, status, toDate, dateFilterType } = req.query;
  const { id, role, team } = req.body;
  //console.log("Team:", team);

  let query = `
    SELECT la.id, la.name, la.surname, la.status, la.fromDate, la.toDate, la.duration, 
           la.days, la.description, la.history,
           la.created_at, la.update_at
    FROM leaveapplication la
    JOIN user u ON u.name = la.name AND u.surname = la.surname
    JOIN employes e ON e.name = la.name AND e.surname = la.surname
  `;

  // Role-based access control
  let queryParams = [];
  if (role === "Admin") {
    query += `WHERE 1=1`; // No additional filter for admin
  } else if (role === "RO-User") {
    // Split the team string into an array
    const teams = team ? team.split(',') : [];
    if (teams.length > 0) {
      // Construct the LIKE conditions for each team
      const likeConditions = teams.map(() => `e.team LIKE ?`).join(' OR ');
      query += `WHERE ${likeConditions}`; // Use OR to combine the LIKE conditions
      // Prepare query parameters with wildcard characters for LIKE
      queryParams.push(...teams.map(t => `%${t}%`)); // Add the teams to query parameters with wildcards
    }
  }
   else {
    query += `WHERE u.id = ?`; // Filter by user id for regular users
    queryParams.push(id);
  }

  // Filter conditions
  let filterConditions = [];

  // Status filter
  if (status && Array.isArray(status)) {
    const statusConditions = status.map(() => `la.status LIKE ?`);
    filterConditions.push(`(${statusConditions.join(" OR ")})`);
    queryParams.push(...status.map((s) => `%${s}%`));
  } else if (status) {
    filterConditions.push(`la.status LIKE ?`);
    queryParams.push(`%${status}%`);
  }

  // Date filter
  if (dateFilterType && fromDate && toDate) {
    if (dateFilterType === "equal") {
      filterConditions.push(`la.fromDate = ? AND la.toDate = ?`);
      queryParams.push(fromDate, toDate);
    } else if (dateFilterType === "before") {
      filterConditions.push(`la.fromDate < ? AND la.toDate < ?`);
      queryParams.push(fromDate, toDate);
    } else if (dateFilterType === "after") {
      filterConditions.push(`la.fromDate > ? AND la.toDate > ?`);
      queryParams.push(fromDate, toDate);
    } else if (dateFilterType === "between") {
      filterConditions.push(`la.fromDate BETWEEN ? AND ?`);
      queryParams.push(fromDate, toDate);
    }
  }

  // Append filter conditions to the query
  if (filterConditions.length > 0) {
    query += ` AND ${filterConditions.join(" AND ")}`;
  }

  // Order results
  query += ` ORDER BY la.status DESC, la.id DESC`;

  // Execute transaction
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection from pool:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    connection.beginTransaction((err) => {
      if (err) {
        console.error("Error starting transaction:", err);
        res.status(500).json({ error: "Internal Server Error" });
        connection.release();
        return;
      }

      // Run the query with parameterized inputs
      connection.query(query, queryParams, (error, results) => {
        if (error) {
          return connection.rollback(() => {
            console.error("Error executing query:", error);
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        // Commit the transaction if the query is successful
        connection.commit((err) => {
          if (err) {
            return connection.rollback(() => {
              console.error("Error committing transaction:", err);
              res.status(500).json({ error: "Internal Server Error" });
              connection.release();
            });
          }

          res.status(200).json({ dealers: results });
          connection.release();
        });
      });
    });
  });
};

const showOneApplicationLeave = async (req, res) => {
  const dealerQuery = `
  SELECT id, name,surname, status, fromDate, toDate, duration, 
  days, description, history, created_at
  FROM leaveapplication
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

const addApplicationLeave = (req, res) => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Database connection error:', err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    connection.beginTransaction(async (err) => {
      if (err) {
        connection.release();
        console.error('Transaction start error:', err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      const { name, surname, fromDate, toDate, days } = req.body;

      // Check if toDate is greater than or equal to fromDate
      if (new Date(toDate) < new Date(fromDate)) {
        connection.release();
        return res.status(400).json({ error: "Check the Dates." });
      }

      try {
        const userResult = await new Promise((resolve, reject) => {
          connection.query(
            "SELECT holidays_taken FROM user WHERE name = ? AND surname = ?",
            [name, surname],
            (error, results) => {
              if (error) {
                console.error('User query error:', error);
                return reject(error);
              }
              resolve(results);
            }
          );
        });

        if (userResult.length === 0) {
          connection.release();
          return res.status(400).json({ error: "User not found." });
        }

        const holidaysTaken = parseFloat(userResult[0].holidays_taken) || 0;

     // Check if adding the requested days exceeds the 12-day limit
     if (holidaysTaken + days > 12) {
      leaveExceedEmail(days, name, surname);
      connection.release();
      return res.status(400).json({ error: "You cannot exceed the maximum number of holidays (12)." });
    }

        const overlapResult = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT * FROM leaveapplication
             WHERE name = ? AND surname = ?
             AND ((fromDate <= ? AND toDate >= ?) OR (fromDate <= ? AND toDate >= ?) OR (fromDate = ?))`,
             [name, surname, fromDate, fromDate, toDate, toDate, toDate],
            (error, results) => {
              if (error) {
                console.error('Overlap query error:', error);
                return reject(error);
              }
              resolve(results);
            }
          );
        });

        if (overlapResult.length > 0) {
          connection.release();
          return res.status(400).json({ error: "You have already applied for leave on these dates." });
        }

        const result = await new Promise((resolve, reject) => {
          const addDealer = `
            INSERT INTO leaveapplication
            (name, surname, status, fromDate, toDate, duration, days, description,
            history, createdBy, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;
          const values = [
            name,
            surname,
            req.body.status,
            fromDate || null,
            toDate || null,
            req.body.duration,
            days,
            req.body.description,
            req.body.history,
            name,
          ];
          connection.query(addDealer, values, (error, results) => {
            if (error) {
              console.error('Insert query error:', error);
              return reject(error);
            }
            resolve(results);
            console.log(name + " " + surname + " Added The leave Application");
          });
        });

        connection.commit(async (err) => {
          if (err) {
            console.error('Transaction commit error:', err);
            return connection.rollback(() => {
              connection.release();
              return res.status(500).json({ error: "Internal Server Error" });
            });
          }

          try {
            await leaveLog(name, surname);
          } catch (logError) {
            console.error("Failed to log leave event:", logError);
          }

          // Email sending is done outside of the transaction block
          sendEmail(result.insertId, name, surname, fromDate, toDate, days);
          connection.release();
          res.json(result);
        });
      } catch (error) {
        console.error('Application error:', error);
        connection.rollback(() => {
          connection.release();
          res.status(500).json({ error: "Internal Server Error" });
        });
      }
    });
  });
};

const sendEmail = async (leaveId, name, surname, fromDate, toDate, days) => {
  try {
    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) return reject(err);
        resolve(connection);
      });
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMPT_HOST,
      port: process.env.SMPT_PORT,
      secure: true,
      auth: {
        user: process.env.SMPT_MAIL,
        pass: process.env.SMPT_PASSWORD,
      },
    });

    const rows = await new Promise((resolve, reject) => {
      const query = `
        SELECT la.*, uu.email as sender
        FROM leaveapplication la
        JOIN user AS uu ON uu.name = la.name
        WHERE la.id = ?
      `;
      connection.query(query, [leaveId], (error, results) => {
        connection.release(); // Release connection after query execution
        if (error) return reject(error);
        resolve(results);
      });
    });

    if (!rows || rows.length === 0) {
      return;
    }

    const fromDateFormatted = rows[0].fromDate
      ? new Date(rows[0].fromDate).toLocaleDateString("en-GB")
      : null;
    const toDateFormatted = rows[0].toDate
      ? new Date(rows[0].toDate).toLocaleDateString("en-GB")
      : null;

    const mailOptions = {
      from: `"Techsa CRM" <${process.env.SMPT_MAIL}>`,
      to: "mihir.b@techsa.net",
      //to: "ravi.k@techsa.net, sanjiv.s@techsa.net",
      subject: `Leave Application Confirmation - ${rows[0].name} ${rows[0].surname} `,
      text: `Hi Sir,

        I, ${rows[0].name} ${
        rows[0].surname}, am writing to request a leave from 
        Start Date : ${fromDateFormatted || "N/A"} 
        End Date   : ${toDateFormatted || "N/A"} for 
        Total Number of days : ${rows[0].days}
        Leave Type :  ${rows[0].duration}
        Reason for Leave : ${rows[0].description}
        ${process.env.Frontend_url}/leave/view/${leaveId}

        Regards,
        ${rows[0].name} ${rows[0].surname}
        `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

const editApplicationAdmin = (req, res) => {
  const checkStatusQuery = `
    SELECT la.name, la.surname, u.email, la.status, la.history, la.fromDate, la.toDate, la.days, la.description 
    FROM leaveapplication la
    JOIN user AS u ON u.name = la.name
    WHERE la.id = ?;
  `;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to database:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    connection.query(checkStatusQuery, [req.params.id], async (error, rows) => {
      if (error) {
        console.error("Error executing query:", error);
        connection.release();
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (!rows || rows.length === 0) {
        console.error("No rows returned");
        connection.release();
        return res.status(404).json({ error: "Not Found" });
      }

      const currentStatus = rows[0].status;
      const userEmail = rows[0].email;
      const userName = rows[0].name;
      const userSurname = rows[0].surname;
      const currentDays = rows[0].days;
      const currentFromDate = rows[0].fromDate;
      const currentToDate = rows[0].toDate;
      let comment = rows[0].history;

      const fromDateChanged = req.body.fromDate !== currentFromDate;
      const toDateChanged = req.body.toDate !== currentToDate;

      if (fromDateChanged || toDateChanged) {
        comment = `${comment || ""}`;
      }

      //console.log("comment :", comment);

      try {
        const [userResult] = await new Promise((resolve, reject) => {
          connection.query(
            "SELECT holidays_taken FROM user WHERE name = ? AND surname = ?",
            [userName, userSurname],
            (error, results) => {
              if (error) return reject(error);
              resolve(results);
            }
          );
        });

        if (!userResult || userResult.length === 0) {
          console.error("User not found or empty result");
          connection.release();
          return res.status(404).json({ error: "User not found." });
        }

        const { days } = req.body;


        const holidaysTaken = parseFloat(userResult.holidays_taken) || 0;

        // Check if adding the requested days exceeds the 12-day limit
        if (holidaysTaken + days > 12) {
          leaveExceedEmail(days, name, surname);
          connection.release();
          return res.status(400).json({ error: "You cannot exceed the maximum number of holidays (12)." });
        }

        const [overlapResult] = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT * FROM leaveapplication
             WHERE name = ? AND surname = ?
             AND id <> ?
             AND ((fromDate <= ? AND toDate >= ?) OR (fromDate <= ? AND toDate >= ?) OR (fromDate = ?))`,
            [
              userName,
              userSurname,
              req.params.id,
              req.body.fromDate,
              req.body.toDate,
              req.body.fromDate,
              req.body.toDate,
              req.body.fromDate
            ],
            (error, results) => {
              if (error) return reject(error);
              resolve(results);
            }
          );
        });

        if (overlapResult && overlapResult.length > 0) {
          connection.release();
          return res.status(400).json({
            error: "You have already applied for leave on these dates.",
          });
        }

        const updateDatabase = () => {
          const updateDealer = `
            UPDATE leaveapplication 
            SET
            name = ?,
            surname = ?,
            status = ?,
            fromDate = ?,
            toDate = ?, 
            duration = ?,
            days = ?,
            description = ?,
            history = ?,  
            update_at = NOW()
            WHERE id = ?;
          `;

          const values = [
            req.body.name,
            req.body.surname,
            req.body.status,
            req.body.fromDate || null,
            req.body.toDate || null,
            req.body.duration,
            req.body.days,
            req.body.description,
            req.body.history,
            req.params.id,
          ];

          connection.query(updateDealer, values, async (error, results) => {
            if (error) {
              console.error("Error executing update query:", error);
              connection.release();
              return res.status(500).json({ error: "Internal Server Error" });
            }

            // Call editleaveLog after successful update
            try {
              await editleaveLog(userName, userSurname);
            } catch (logError) {
              console.error("Failed to log leave edit event:", logError);
            }

            // Sending emails asynchronously to avoid slowing down the transaction
            if (
              (currentStatus === "approved" || currentStatus === "rejected") &&
              (fromDateChanged || toDateChanged)
            ) {
              req.body.status = "request";
              sendEmail(
                req.params.id,
                req.body.name,
                req.body.surname,
                req.body.fromDate,
                req.body.toDate,
                req.body.days
              );
            } else if (
              req.body.status === "approved" ||
              req.body.status === "rejected"
            ) {
              sendStatusEmail(
                userEmail,
                userName,
                userSurname,
                req.body.status,
                comment,
                req.params.id
              );
            }

            connection.release();
            console.log(
              req.body.name +
                " " +
                req.body.surname +
                " " +
                " edited The leave Application"
            );
            res.json(results);
          });
        };

        if (
          (currentStatus === "approved" || currentStatus === "rejected") &&
          (fromDateChanged || toDateChanged)
        ) {
          req.body.status = "request";
          updateDatabase();
        } else {
          updateDatabase();
        }
      } catch (error) {
        console.error("Error:", error);
        connection.release();
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
  });
};

const sendStatusEmail = (
  userEmail,
  userName,
  userSurname,
  status,
  comment,
  leaveId // Ensure id is passed here
) => {
  const mailOptions = {
    from: `<${process.env.SMPT_MAIL}>`,
    to: userEmail,
    subject: "Leave Application Status Update",
    text: `Hi ${userName} ${userSurname},\n\nYour leave application has been ${status}.\n${comment}\n${process.env.Frontend_url}/leave/view/${leaveId}
    
    \n\nRegards,\nTechsa CRM`,
  };

  console.log("Leave application ID: ", leaveId); // Log to ensure id is passed

  const transporter = nodemailer.createTransport({
    host: process.env.SMPT_HOST,
    port: process.env.SMPT_PORT,
    secure: true,
    auth: {
      user: process.env.SMPT_MAIL,
      pass: process.env.SMPT_PASSWORD,
    },
  });

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending status email:", error);
    } else {
      console.log("Status email sent:", info.response);
    }
  });
};

const leaveConfirm = (req, res) => {
  const dealerQuery = `
    UPDATE leaveapplication
    SET status = ?, history = ?
    WHERE id = ?
  `;

  const values = [req.body.status, req.body.history, req.params.id];

  const userQuery = "SELECT email FROM user WHERE name = ? AND surname = ?";

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    connection.beginTransaction((transactionError) => {
      if (transactionError) {
        console.error("Error starting transaction:", transactionError);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }

      connection.query(dealerQuery, values, (queryError, results) => {
        if (queryError) {
          return connection.rollback(() => {
            console.error("Error executing query:", queryError);
            res.status(500).json({ error: "Internal Server Error" });
            connection.release();
          });
        }

        // Fetch user details
        connection.query(
          userQuery,
          [req.body.name, req.body.surname],
          (userError, userResults) => {
            if (userError) {
              return connection.rollback(() => {
                console.error("Error fetching user details:", userError);
                res.status(500).json({ error: "Internal Server Error" });
                connection.release();
              });
            }

            const user = userResults[0];
            const userEmail = user.email;
            const userName = req.body.name;
            const userSurname = req.body.surname;

            // Commit the transaction
            connection.commit((commitError) => {
              if (commitError) {
                return connection.rollback(() => {
                  console.error("Error committing transaction:", commitError);
                  res.status(500).json({ error: "Internal Server Error" });
                  connection.release();
                });
              }

              console.log("Leave status updated successfully");

              // After transaction commit, send the email
              if (
                req.body.status === "approved" ||
                req.body.status === "rejected"
              ) {
                sendStatusEmail(
                  userEmail,
                  userName,
                  userSurname,
                  req.body.status,
                  req.body.history || "",
                  req.params.id
                );
              }

              res
                .status(200)
                .json({
                  message:
                    "Leave status updated and email sent (if applicable)",
                });
              connection.release();
            });
          }
        );
      });
    });
  });
};

const deleteApplication = async (req, res) => {
  const fetchQuery = `
    SELECT name, surname, fromDate, toDate 
    FROM leaveapplication 
    WHERE id = ?
  `;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to database:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    // Fetching name, surname, fromDate, and toDate using id
    connection.query(fetchQuery, [req.body.id], async (error, results) => {
      if (error) {
        console.error("Error executing fetch query:", error);
        connection.release();
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 0) {
        connection.release();
        return res.status(404).json({ error: "Application not found" });
      }

      const { name, surname, fromDate, toDate } = results[0];

      try {
        // Send email notification about the deletion
        try {
          await sendDeleteEmail(req.body.id, name, surname, fromDate, toDate);
          console.log("Cancellation email sent.");
        } catch (emailError) {
          console.error("Error sending cancellation email:", emailError);
          connection.release();
          return res.status(500).json({ error: "Error sending cancellation email" });
        }

        // Log the delete action
        await deletLeaveLog(name, surname, fromDate, toDate);

        // Proceed with the delete operation
        const deleteQuery = `DELETE FROM leaveapplication WHERE id = ?`;
        connection.query(deleteQuery, [req.body.id], (error, deleteResults) => {
          if (error) {
            console.error("Error executing delete query:", error);
            connection.release();
            return res.status(500).json({ error: "Internal Server Error" });
          }

          console.log(
            `Deleted application for ${name} ${surname} from ${fromDate} to ${toDate}`
          );
          connection.release();

          res.json({
            message: "Application deleted successfully",
            results: deleteResults,
          });
        });
      } catch (logError) {
        console.error("Error logging delete action:", logError);
        connection.release();
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
  });
};

const sendDeleteEmail = async (leaveId, name, surname, fromDate, toDate, days) => {
  try {
    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) return reject(err);
        resolve(connection);
      });
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMPT_HOST,
      port: process.env.SMPT_PORT,
      secure: true,
      auth: {
        user: process.env.SMPT_MAIL,
        pass: process.env.SMPT_PASSWORD,
      },
    });

    const rows = await new Promise((resolve, reject) => {
      const query = `
        SELECT la.*, uu.email as sender
        FROM leaveapplication la
        JOIN user AS uu ON uu.name = la.name
        WHERE la.id = ?
      `;
      connection.query(query, [leaveId], (error, results) => {
        connection.release(); // Release connection after query execution
        if (error) return reject(error);
        resolve(results);
      });
    });

    if (!rows || rows.length === 0) {
      console.error(`No leave application found with id ${leaveId}`);
      return;
    }

    // Format the dates
    const fromDateFormatted = fromDate ? new Date(fromDate).toLocaleDateString("en-GB") : "N/A";
    const toDateFormatted = toDate ? new Date(toDate).toLocaleDateString("en-GB") : "N/A";

    // Construct the email content
    const mailOptions = {
      from: `"Techsa CRM" <${process.env.SMPT_MAIL}>`,
      to: "mihir.b@techsa.net", // Replace with actual recipients or use multiple recipients
      //to: "ravi.k@techsa.net, sanjiv.s@techsa.net",
      subject: `Leave Application Deletion Notification`,
      text: `The following leave application has been cancelled:

Employee: ${name} ${surname}
Leave Dates: From ${fromDateFormatted} to ${toDateFormatted}
Number of Days: ${days || "N/A"}

Please take note of this cancellation.

Best regards,
Techsa CRM
      `,
    };

    // Send the email
    await transporter.sendMail(mailOptions);
    console.log(`Cancellation email sent for leave ID ${leaveId} to ${name} ${surname}`);
  } catch (error) {
    console.error("Error sending cancellation email:", error);
  }
};

const leaveLog = (name, surname) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO leavelogs (EventLog, created_at) 
      VALUES (?, NOW())
    `;
    const value = `${name} ${surname} added a leave`;

    pool.query(query, [value], (error, results) => {
      if (error) return reject(error);
      resolve(results);
    });
  });
};

const editleaveLog = (name, surname) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO leavelogs (EventLog, created_at) 
      VALUES (?, NOW())
    `;
    const value = `${name} ${surname} edited a leave application`;

    pool.query(query, [value], (error, results) => {
      if (error) return reject(error);
      resolve(results);
    });
  });
};

const deletLeaveLog = (name, surname, fromDate, toDate) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO leavelogs (EventLog, created_at) 
      VALUES (?, NOW())
    `;
    const value = `${name} ${surname} Deleted application from ${fromDate} to ${toDate}`;

    pool.query(query, [value], (error, results) => {
      if (error) return reject(error);
      resolve(results);
    });
  });
};

const leaveExceedEmail = (
  days, name, surname
) => {
  const mailOptions = {
    from: `<${process.env.SMPT_MAIL}>`,
  to: "mihir.b@techsa.net",
  //  to: "ravi.k@techsa.net, sanjiv.s@techsa.net",
    subject: "Leave Application Exceeds the Days",
    text: ` ${name} ${surname}, tried to apply for ${days} days, exceeding the limit of 12 days.`,
  };


  const transporter = nodemailer.createTransport({
    host: process.env.SMPT_HOST,
    port: process.env.SMPT_PORT,
    secure: true,
    auth: {
      user: process.env.SMPT_MAIL,
      pass: process.env.SMPT_PASSWORD,
    },
  });

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending status email:", error);
    } else {
      console.log("Status email sent:", info.response);
    }
  });
};

module.exports = {
  showApplicationLeave,
  addApplicationLeave,
  editApplicationAdmin,
  showOneApplicationLeave,
  deleteApplication,
  leaveConfirm,
};
