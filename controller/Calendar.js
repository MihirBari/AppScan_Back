const { pool } = require('../database');
const ical = require('ical.js');
const fs = require('fs');

const holiday = async (req, res) => {
  try {
    // Read the .ics file
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');

    // Parse the .ics file content
    const jcalData = ical.parse(fileContent);
    const comp = new ical.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    // Log the number of events found
    // console.log(`Number of events found: ${vevents.length}`);

    // Store the events in the database
    for (const vevent of vevents) {
      const summary = vevent.getFirstPropertyValue('summary');
      const dtstart = formatDate(vevent.getFirstPropertyValue('dtstart')); // Format date to 'YYYY-MM-DD'
      let dtend = new Date(vevent.getFirstPropertyValue('dtend'));     // Parse dtend

      // Subtract one day from dtend
      dtend.setDate(dtend.getDate() - 1);
      
      // Create events for each day between dtstart and the day before dtend
      let currentDate = new Date(dtstart);
      
      while (currentDate <= dtend) {
        const formattedDate = formatDate(currentDate); // Format date to 'YYYY-MM-DD'

        try {
          const results = await insertEvent(formattedDate, summary);
          // console.log('Inserted event with ID:', results.insertId);
        } catch (err) {
          console.error('Error executing database query:', err);
        }

        // Move to the next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    res.status(200).send('File uploaded and data stored successfully.');
  } catch (error) {
    console.error('Error parsing or storing data:', error);
    res.status(500).send('Internal server error.');
  }
};

const insertEvent = (date, summary) => {
  return new Promise((resolve, reject) => {
    pool.query('INSERT INTO holiday (date, name) VALUES (?, ?)', [date, summary], (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
};

// Utility function to format date to 'YYYY-MM-DD'
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

//to get all the public holidays declared by ravi sir
const getHolidays = (req, res) => {
  pool.query('SELECT * FROM holiday', (err, results) => {
    if (err) {
      console.error('Error fetching holidays:', err);
      res.status(500).send('Internal server error.');
      return;
    }
    res.json(results);
    //console.log(results)
  });
};

//Get Birthdays from the DB and send it frontend
const birthday = (req, res) => {
  pool.query('SELECT DOB, name, surname FROM employes where dob is not null', (err, results) => {
    if (err) {
      console.error('Error fetching birthdays:', err);
      res.status(500).send('Internal server error.');
      return;
    }
    //console.log(results)
    res.json(results); // Adjust based on your database driver
  });
}; 

module.exports = {
  holiday,
  getHolidays,
  birthday
};
