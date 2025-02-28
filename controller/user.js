const { pool } = require("../database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

const login = (req, res) => {
  const sqlUserQuery = `SELECT u.id, u.name, u.surname, u.email, u.password, u.role, u.login_attempts, u.lockout_time,e.team 
  FROM user u
  JOIN employes e ON e.name = u.name AND e.surname = u.surname
  WHERE email = ?`;

  pool.query(sqlUserQuery, [req.body.email], (err, data) => {
    if (err) {
      console.error("SQL Error:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (data.length > 0) {
      const user = data[0];
      const currentTime = new Date();

      if (user.lockout_time && new Date(user.lockout_time) > currentTime) {
        return res
          .status(403)
          .json({ error: "Account is locked. Please try again later." });
      }

      const sqlEmployeeQuery =
        'SELECT * FROM employes WHERE name = ? AND surname = ? AND status = "Active"';

      pool.query(
        sqlEmployeeQuery,
        [user.name, user.surname],
        (err, empData) => {
          if (err) {
            console.error("Employee Query Error:", err);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          if (empData.length > 0) {
            bcrypt.compare(
              req.body.password.toString(),
              user.password,
              (err, response) => {
                if (err) {
                  console.error("Bcrypt Error:", err);
                  return res
                    .status(500)
                    .json({ error: "Internal Server Error" });
                }

                if (response) {
                  const userInfo = {
                    id: user.id,
                    name: user.name,
                    surname: user.surname,
                    email: user.email,
                    role: user.role,
                    team: user.team,
                  };

                  // Use environment variable for JWT secret
                  const token = jwt.sign(
                    userInfo,
                    process.env.JWT_SECRET_KEY,
                    { expiresIn: "3d" }
                  );

                  // Reset login attempts on successful login
                  pool.query(
                    "UPDATE user SET login_attempts = 0, lockout_time = NULL WHERE id = ?",
                    [user.id],
                    (err) => {
                      if (err) {
                        console.error("Update Login Attempts Error:", err);
                        return res
                          .status(500)
                          .json({ error: "Internal Server Error" });
                      }
                    }
                  );
                  res.cookie("token", token, {
                    httpOnly: true, // Prevents access from JavaScript
                    secure: true, // Ensures secure in production
                    sameSite: "None",
                    path: '/', // Prevents CSRF
                  });

                 // console.log("Response Headers:", res.getHeaders());
                  return res.status(200).json({ user: userInfo });
                } else {
                  // Increment login attempts
                  user.login_attempts += 1;
                  let lockout_time = null;

                  if (user.login_attempts >= 5) {
                    lockout_time = new Date(currentTime.getTime() + 30 * 60000); // 30 minutes lockout
                  }

                  pool.query(
                    "UPDATE user SET login_attempts = ?, lockout_time = ? WHERE id = ?",
                    [user.login_attempts, lockout_time, user.id],
                    (err) => {
                      if (err) {
                        console.error("Update Lockout Error:", err);
                        return res
                          .status(500)
                          .json({ error: "Internal Server Error" });
                      }
                    }
                  );

                  return res.status(401).json({ error: "Invalid credentials" });
                }
              }
            );
          } else {
            return res
              .status(401)
              .json({ error: "User not found or not active in employes" });
          }
        }
      );
    } else {
      return res.status(401).json({ error: "Invalid credentials" });
    }
  });
};

const getUserData = (req, res) => {
  const getAllUsersQuery = `SELECT u.id, u.name, u.surname, u.email,u.holidays_taken,  u.role ,e.team 
  FROM user u
    JOIN employes e ON e.name = u.name AND e.surname = u.surname
  `;

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to database:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    connection.query(getAllUsersQuery, (error, users) => {
      if (error) {
        console.error("Error executing query:", error);
        connection.release();
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // Iterate through each user to update holidays_taken
      const updateUserPromises = users.map((user) => {
        return new Promise((resolve, reject) => {
          updateUserHolidaysTaken(
            user.name,
            user.surname,
            connection,
            (error, results) => {
              if (error) {
                reject(error);
              } else {
                resolve(results);
              }
            }
          );
        });
      });

      // Execute all update promises
      Promise.all(updateUserPromises)
        .then(() => {
          connection.release();
          res.status(200).json(users);
        })
        .catch((error) => {
          console.error("Error updating holidays_taken for users:", error);
          connection.release();
          res.status(500).json({ error: "Internal Server Error" });
        });
    });
  });
};

const getOneUserData = (req, res) => {
  const getOneUserQuery =
    "SELECT id, name,surname, email, password, role FROM user WHERE id = ?";

  pool.query(getOneUserQuery, [req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    //console.log('User data:', results[0]);
    res.status(200).json(results);
  });
};

const addUser = async (req, res) => {
  const { name, surname, email, password, role } = req.body;

  // Check if the email domain is "@techsa.net"
  if (!email.endsWith("@techsa.net")) {
    return res
      .status(400)
      .json({ error: 'Email domain must be "@techsa.net".' });
  }

  try {
    // Check if the email already exists in the user table
    const emailExistsQuery = `
      SELECT * FROM user
      WHERE email = ?
    `;
    const emailExistsValues = [email];

    pool.query(
      emailExistsQuery,
      emailExistsValues,
      async (error, emailResults) => {
        if (error) {
          console.error("Error executing email query:", error);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        if (emailResults.length > 0) {
          return res.status(400).json({ error: "Email already exists." });
        }

        // If email is unique, proceed to insert the user

        // Check if the name and surname combination exists in the employees table
        const userExistsQuery = `
        SELECT * FROM employes
        WHERE name = ? AND surname = ? And status = "Active"
      `;
        const userExistsValues = [name, surname];

        pool.query(
          userExistsQuery,
          userExistsValues,
          async (error, results) => {
            if (error) {
              console.error("Error executing name-surname query:", error);
              return res.status(500).json({ error: "Internal Server Error" });
            }

            if (results.length === 0) {
              return res
                .status(400)
                .json({
                  error: "Name and surname combination does not exist.",
                });
            }

            try {
              const hashedPassword = await bcrypt.hash(password, 10);

              const userQuery = `
            INSERT INTO user
            (name, surname, email, password, role, created_at)
            VALUES (?, ?, ?, ?, ?, NOW()) 
          `;
              const values = [name, surname, email, hashedPassword, role];

              pool.query(userQuery, values, (error, results) => {
                if (error) {
                  console.error("Error executing insert query:", error);
                  return res
                    .status(500)
                    .json({ error: "Internal Server Error" });
                }

                //console.log('Added User:', results);
                return res
                  .status(201)
                  .json({ message: "User added successfully!" });
              });
            } catch (hashError) {
              console.error("Error hashing password:", hashError);
              return res.status(500).json({ error: "Internal Server Error" });
            }
          }
        );
      }
    );
  } catch (error) {
    console.error("Error in addUser function:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const editUser = async (req, res) => {
  const { name, surname, email, password, role } = req.body;

  try {
    let hashedPassword = null;

    // Check if a new password is provided
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Construct query and values array dynamically
    let userQuery = `
      UPDATE user
      SET name = ?,surname=?, email = ?, role = ?
    `;
    const values = [name, surname, email, role];

    if (hashedPassword) {
      userQuery = `
        UPDATE user
        SET name = ?,surname=?, email = ?, password = ?, role = ?
      `;
      values.splice(3, 0, hashedPassword); // Insert hashedPassword at the right position
    }

    userQuery += ` WHERE id = ?`;
    values.push(req.params.id);

    pool.query(userQuery, values, (error, results) => {
      if (error) {
        console.error("Error executing query:", error);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }

      //console.log('Updated User:', results);
      res.status(200).json({ message: "User updated successfully!" });
    });
  } catch (hashError) {
    console.error("Error hashing password:", hashError);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteUser = (req, res) => {
  const query = `DELETE from  user where id =?`;

  const value = [req.body.id];

  pool.query(query, value, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return;
    }

    console.log("Deleted", results);
    res.json(results);
  });
};

const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: True,
    sameSite: "None",
  });
  return res.status(200).json({ message: "Logged out successfully" });
};

const SECRET_KEY = process.env.SECRET_KEY;
const RESET_TOKEN_EXPIRATION = "1h";

const verifyResetToken = async (token) => {
  try {
    const decoded = await promisify(jwt.verify)(token, SECRET_KEY);
    return decoded.email;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

const generateResetToken = (email) => {
  return jwt.sign({ email }, SECRET_KEY, { expiresIn: RESET_TOKEN_EXPIRATION });
};

const requestResetPassword = async (req, res) => {
  const { email } = req.body;
  //console.log(email)
  try {
    const token = generateResetToken(email);
    const resetLink = `${process.env.Frontend_url}/resetPassword/${token}`;

    // Send the email

    const transporter = nodemailer.createTransport({
      host: process.env.SMPT_HOST,
      port: process.env.SMPT_PORT,
      secure: true, // Use true for 465, false for other ports
      auth: {
        user: process.env.SMPT_MAIL,
        pass: process.env.SMPT_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.SMPT_MAIL,
      to: email,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password</p>`,
    });

    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const ResetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const email = await verifyResetToken(token);
    const hashedPassword = await bcrypt.hash(password, 10);

    const userQuery = "UPDATE user SET password = ? WHERE email = ?";
    const values = [hashedPassword, email];

    pool.query(userQuery, values, (error, results) => {
      if (error) {
        console.error("Error executing query:", error);
        res.status(500).json({ error: "Internal Server Error" });
        return;
      }

      res.status(200).json({ message: "Password reset successfully!" });
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(400).json({ error: "Invalid or expired token" });
  }
};

const updateUserHolidaysTaken = (
  userName,
  userSurname,
  connection,
  callback
) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const startDate = new Date(startYear, 3, 1); // April 1st of the current/start year
  const endDate = new Date(startYear + 1, 2, 31, 23, 59, 59); // March 31st of the next year

  const calculateApprovedDaysQuery = `
    SELECT 
      SUM(CASE WHEN duration = 'Full Day' THEN days ELSE 0 END) AS totalFullDays, 
      SUM(CASE WHEN duration = 'Half Day' THEN 0.5 ELSE 0 END) AS totalHalfDays 
    FROM leaveapplication 
    WHERE name = ? AND surname = ? AND status = 'approved' 
  `;

  const updateUserHolidaysQuery = `
    UPDATE user 
    SET holidays_taken = ? 
    WHERE name = ? AND surname = ?;
  `;

  // console.log(`Executing query for ${userName} ${userSurname} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  const params = [userName, userSurname, startDate, endDate];
  //console.log("Query parameters:", params); // Log the parameters for debugging

  connection.query(calculateApprovedDaysQuery, params, (error, results) => {
    if (error) {
      console.error("Error calculating approved days:", error);
      return callback(error);
    }

    //console.log("Query results:", results); // Log the results for debugging

    if (results.length === 0 || !results[0]) {
      console.error(`No results returned for ${userName} ${userSurname}.`);
      return callback(new Error("No results returned from the query."));
    }

    const totalFullDays = parseFloat(results[0].totalFullDays) || 0;
    const totalHalfDays = parseFloat(results[0].totalHalfDays) || 0;

    //console.log(`Total Full Days: ${totalFullDays}, Total Half Days: ${totalHalfDays}`);

    // Calculate holidaysTaken considering fractional days
    const holidaysTaken = totalFullDays + totalHalfDays;

    connection.query(
      updateUserHolidaysQuery,
      [holidaysTaken, userName, userSurname],
      (error, results) => {
        if (error) {
          console.error("Error updating holidays_taken:", error);
          return callback(error);
        }

        callback(null, results);
      }
    );
  });
};

// Function to reset holidays_taken and half_day for all users at the start of a new financial year
const resetUserHolidaysTaken = (connection, callback) => {
  const resetHolidaysQuery = `
    DELETE FROM leaveapplication;
  `;

  connection.query(resetHolidaysQuery, (error, results) => {
    if (error) {
      console.error("Error resetting holidays_taken:", error);
      return callback(error);
    }

    // console.log("Reset user holidays_taken for new financial year:", results);
    callback(null, results);
  });
};

// Function to check and reset holidays_taken if today is April 1st
const checkAndResetHolidays = (connection) => {
  const today = new Date();
  const isAprilFirst = today.getMonth() === 3 && today.getDate() === 1;

  if (isAprilFirst) {
    resetUserHolidaysTaken(connection, (error, results) => {
      if (error) {
        console.error("Error resetting holidays_taken:", error);
      } else {
        console.log("Holidays reset successfully for the new financial year");
      }
    });
  }
};

// Schedule the checkAndResetHolidays function to run at midnight on April 1st
cron.schedule(
  "0 0 1 4 *",
  () => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("Error connecting to database:", err);
        return;
      }

      checkAndResetHolidays(connection);

      connection.release();
    });
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  }
);

console.log("Cron job for resetting holidays_taken is scheduled.");

const RestDetail = async (req, res) => {
  const { name, surname } = req.body;

  const dealerQuery = `
    SELECT e.designation, e.joining_date, e.DOB, u.holidays_taken, e.team
    FROM employes e
    JOIN user u ON u.name = e.name AND u.surname = e.surname
    WHERE u.name = ? AND u.surname = ?
  `;

  pool.query(dealerQuery, [name, surname], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    if (results.length > 0) {
      res.status(200).json(results[0]); // Ensure it sends only the first result
    } else {
      res.status(404).json({ error: "No details found" });
    }
  });
};

module.exports = {
  login,
  getUserData,
  getOneUserData,
  addUser,
  deleteUser,
  logout,
  editUser,
  ResetPassword,
  requestResetPassword,
  RestDetail,
};