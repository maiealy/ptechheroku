const express = require('express')
const pg = require('pg');
const path = require('path')
var bodyParser = require('body-parser');
const PORT = process.env.PORT || 5001

var app = express();

app.use(bodyParser.urlencoded({ extended : true , limit : '50mb' }));
app.use(bodyParser.json( { limit : '50mb' }));

app.use(express.static(path.join(__dirname, 'public')))

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', (req, res) => res.render('pages/index'))

//APIS
app.get('/details', (req, res) => {
  res.send({"message":'Hello, World122222!', "name":"Maie"})})


let dataBaseHostURL = 'postgres://u5o4nov2ff99iq:pe4d776468dedc2307b547bde1bff258958fe1af9036963f2f6b8ebbd4a121767@c724r43q8jp5nk.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/d7si4nnk0mjhno'

// Connect to Heroku Postgres using the DATABASE_URL environment variable
const pool = new pg.Pool({
  connectionString: dataBaseHostURL,
  ssl: {
    rejectUnauthorized: false // Set to true in production
  }
});

// 1- Get Users
app.get('/users', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM public."user"');
    const data = result.rows;
    client.release();
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving data');
  }
});


// 2- Get user Payments
app.get('/payments/:accountID', async (req, res) => {
  try {
    if(req.params.accountID){
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM public."payment" WHERE "senderAccountNumber" = ' + req.params.accountID );
        const data = result.rows;
        client.release();
        res.send(data);
    } else{
      res.send({success: false});
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving data');
  }

});

// 3- Transfer payment

  async function getMaxPaymentID() {
    try {
      await client.connect();
      const result = await client.query('SELECT MAX(paymentID) FROM public."payment" ');
      const maxId = result.rows[0].max;
      return maxId? maxId + 1 : 1000000;

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await client.end();
    }
  }

  async function transferPayment(receiverAccountNumber, senderAccountNumber, paymentDate, paymentAmount, paymentType) {
    try {
      await client.connect();

      //1- check receiverAccountNumber and senderAccountNumber and sender balance

      //2- update receiver and sender balance

      // 3- add transaction to payment table
      const query = `
        INSERT INTO public."payment" (paymentID, receiverAccountNumber, senderAccountNumber, paymentDate, paymentAmount, paymentType)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;

      const paymentID = await getMaxPaymentID()
      const values = [paymentID, receiverAccountNumber, senderAccountNumber, paymentDate, paymentAmount, paymentType];
      const result = await client.query(query, values);
      return result.rows[0]; // Returns the inserted row
      
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await client.end();
    }
  }

  app.post('/payments/transfer', async (req, res) => {
    try {
      if(req.body && req.body.receiverAccountNumber &&  req.body.senderAccountNumber &&  
        req.body.paymentDate && req.body.paymentAmount &&  req.body.paymentType ){

          const bodyData = req.body;
          const result = await transferPayment(bodyData.receiverAccountNumber, bodyData.senderAccountNumber, 
            bodyData.paymentDate, bodyData.paymentAmount, bodyData.paymentType );
          const data = result.rows;
          res.send(data);
      } else{
        res.send({success: false});
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving data');
    }

    });

  // 4- authenticate
  async function queryUsersByColumnValues(column1, value1, column2, value2) {
    try {
      await client.connect();
      const query = `
        SELECT * 
        FROM public."user" 
        WHERE ${column1} = $1 AND ${column2} = $2;
      `;
      const values = [value1, value2];
      const result = await client.query(query, values);
      return result.rows;
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await client.end();
    }
  }
  
  app.post('/user/authenticate', async (req, res) => {
    try {
      if(req.body){
          const bodyData = req.body;
          const result = await queryUsersByColumnValues('username', bodyData.username , 'password', bodyData.password );
          const data = result.rows;
          res.send(data);
      } else{
        res.send({success: false});
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving data');
    }

});

  // 5- register users

  async function getMaxAccountID() {
    try {
    
      const result = await client.query('SELECT MAX(userAccountID) FROM public."user" ');
      const maxId = result.rows[0].max;
      return maxId? maxId + 1 : 100000000;

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await client.end();
    }
  }

  async function registerUser(username, password, firstname, lastname, email, language) {
    try {
      await client.connect();
      const query = `
        INSERT INTO public."user" (accountID, username, password, firstname, lastname, email, language)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;

      const accountID = await getMaxAccountID()
      const values = [accountID, username, password, firstname, lastname, email, language];
      const result = await client.query(query, values);
      return result.rows[0]; // Returns the inserted row
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      await client.end();
    }
  }

  app.post('/user/register', async (req, res) => {
    try {
      if(req.body && req.body.username &&  req.body.password &&  
          req.body.firstname && req.body.lastname &&  req.body.email &&  req.body.language){

          const bodyData = req.body;
          const result = await registerUser(bodyData.username, bodyData.password, 
            bodyData.firstname && bodyData.lastname &&  bodyData.email &&  bodyData.language);
          const data = result.rows;
          res.send(data);
      } else{
        res.send({success: false});
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving data');
    }

});

//Start server
  app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
