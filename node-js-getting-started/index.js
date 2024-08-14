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


let dataBaseHostURL = 'postgres://u372dltu9u49hr:p3c6becee3fc7aa02f0ef9f20b4abf5aaf701269177dfe12afc91478c0d661425@cav8p52l9arddb.cluster-czz5s0kz4scl.eu-west-1.rds.amazonaws.com:5432/df8qc1hcgkcgc5'

// Connect to Heroku Postgres using the DATABASE_URL environment variable
const client = new pg.Pool({
  connectionString: dataBaseHostURL,
  ssl: {
    rejectUnauthorized: false // Set to true in production
  }
});

// client.connect();


// 1- Get Users
app.get('/users', async (req, res) => {
  try {
    // const client = await pool.connect();
    const result = await client.query('SELECT * FROM public."user"');
    const data = result.rows;
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
        const result = await client.query('SELECT * FROM public."payment" WHERE "senderAccountNumber" = ' + req.params.accountID );
        const data = result.rows;
        // client.release();
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
      // const client = await client.end();
      // client = await pool.connect();
      const result = await client.query('SELECT MAX(payment."paymentID") FROM public."payment" ');
      const maxId = result.rows[0].max;
      // client.release();
      return maxId? +maxId + 1 : 1000000;

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
  }

  async function doesUserExist(userAccountID) {
    try {

      // remove password from query
      const query = `
        SELECT "userAccountID"
        FROM public."user" 
        WHERE "userAccountID" = $1;
      `;
      const values = [userAccountID];
      const result = await client.query(query, values);

      // client.release();

      return result.rows.length>0?true : false;
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
  }

  async function doesSenderHaveEnoughBalance(senderAccountNumber, paymentAmount) {

    const result = await client.query('SELECT "balance" FROM public."user"  WHERE "userAccountID" = ' + senderAccountNumber);
    var balance = result.rows[0];

    var hasBalance = false
    
    if(balance)
    {
      var balanceamount = Number(balance.balance);
      if(balanceamount >=  paymentAmount) hasBalance = true 
    } 

    return hasBalance;
  }

  async function updateReceiverAndSendertBalance(receiverAccountNumber, senderAccountNumber, paymentAmount) {
    const receiverquery = `
      UPDATE public."user"
      SET "balance" = "balance" + $1
      WHERE "userAccountID" = $2;
    `;
    const receivervalues = [paymentAmount, receiverAccountNumber];
    await client.query(receiverquery, receivervalues);

    const senderquery = `
      UPDATE public."user"
      SET "balance" = "balance" - $1
      WHERE "userAccountID" = $2;
    `;
    const sendervalues = [paymentAmount, senderAccountNumber];
    await client.query(senderquery, sendervalues);

    return true;
  }

  async function transferPayment(receiverAccountNumber, senderAccountNumber, paymentDate, paymentAmount, paymentType) {
    try {

      //1- check receiverAccountNumber and senderAccountNumber and sender balance
      const userExists = await doesUserExist(receiverAccountNumber)
      if(userExists == true)
      {
          const senderHaveEnoughBalance = await doesSenderHaveEnoughBalance(senderAccountNumber,paymentAmount )
          if(senderHaveEnoughBalance == true)
          {
                //2- update receiver and sender balance
                await updateReceiverAndSendertBalance(receiverAccountNumber, senderAccountNumber, paymentAmount)

                // 3- add transaction to payment table
                try {
                  const query = `
                      INSERT INTO public."payment" ("paymentID", "receiverAccountNumber", "senderAccountNumber", 
                              "paymentDate", "paymentAmount", "paymentType")
                      VALUES ($1, $2, $3, $4, $5, $6)
                      RETURNING *;
                      `;

                      const paymentID = await getMaxPaymentID()
                      const values = [paymentID, receiverAccountNumber, senderAccountNumber, paymentDate, paymentAmount, paymentType];
                      const result = await client.query(query, values);

                      return result.rows.length>0? result.rows[0] : null;

                } catch (err) {
                  console.error(err);
                  throw err;
                } finally {
                  // await client.end();
                }
          }
          else{
            return null
          }
      }else{
        return null
      }
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
      
  }

  app.post('/payments/transfer', async (req, res) => {
    try {
      if(req.body && req.body.receiverAccountNumber &&  req.body.senderAccountNumber &&  
        req.body.paymentDate && req.body.paymentAmount &&  req.body.paymentType ){

          const bodyData = req.body;
          const result = await transferPayment(bodyData.receiverAccountNumber, bodyData.senderAccountNumber, 
            bodyData.paymentDate, bodyData.paymentAmount, bodyData.paymentType );
          const data = result;
          data? res.send({success: true, data: data}) : res.send({success: false, "message": "Transaction failed. Make sure you have enough balance"})
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

      // remove password from query
      const query = `
        SELECT "userAccountID", "username", "firstName", "lastName", "email", "language"
        FROM public."user" 
        WHERE ${column1} = $1 AND ${column2} = $2;
      `;
      const values = [value1, value2];
      const result = await client.query(query, values);

      // client.release();

      return result.rows.length>0? result.rows[0] : null;
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
  }
  
  app.post('/user/authenticate', async (req, res) => {
    try {
      if(req.body){
          const bodyData = req.body;
          const result = await queryUsersByColumnValues('username', bodyData.username , 'password', bodyData.password );
          const data = result;

          data? res.send({success: true, data: data}) : res.send({success: false})

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
      // const client = await pool.connect();
      const result = await client.query('SELECT MAX("userAccountID") FROM public."user" ');
      const maxId = result.rows[0].max;

      // client.release();

      return maxId? +maxId + 1 : 100000000;

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
  }

  async function registerUser(username, password, firstname, lastname, email, language) {
    try {
      // make sure that username and password do not exist in the tables
      const userexists = await queryUsersByColumnValues('username', username , 'password', password );

      if(userexists)
      {
          return null;
      }
      else {
        // insert
            const query = `
            INSERT INTO public."user" ("userAccountID", "username", "password", "firstName", "lastName", "email", "language", "balance")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
          `;

          const accountID = await getMaxAccountID()
          const values = [accountID, username, password, firstname, lastname, email, language, 10000];
          const result = await client.query(query, values);

          //return the inserted row
          return result.rows.length>0? result.rows[0] : null;
      }

    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      // await client.end();
    }
  }

  app.post('/user/register', async (req, res) => {
    try {
      if(req.body && req.body.username &&  req.body.password &&  
          req.body.firstname && req.body.lastname &&  req.body.email &&  req.body.language){

          const bodyData = req.body;
          const result = await registerUser(bodyData.username, bodyData.password,  bodyData.firstname && bodyData.lastname &&  bodyData.email &&  bodyData.language);
          const data = result;
          if(data) delete data.password;  //remove password
          data? res.send({success: true, data: data}) : res.send({success: false, message: "An error occured or user already exists"})
      } else{
        res.send({success: false});
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving data');
    }

});

   // 6- Delete user
   app.delete('/user/:accountID', async (req, res) => {

    try {

      if(req.params.accountID){
        const result = await client.query('DELETE FROM  public."user" WHERE "userAccountID" = ' + req.params.accountID);
        const data = result.row[0];
        result.rows.length>0?  res.send({success: true, message: "User deleted "}) : res.send({success: false, message: "Failed delting user "});
      } else{
        res.send({success: false, message: "Failed delting user "})
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error deleting data');
    }

  });

  // 7- Delete payment
  app.delete('/payment/:accountID', async (req, res) => {

    try {

      if(req.params.accountID){
        const result = await client.query('DELETE FROM  public."payment" WHERE "paymentID" = ' + req.params.accountID);
        const data = result.row[0];
        result.rows.length>0?  res.send({success: true, message: "Payment deleted "}) : res.send({success: false, message: "Failed delting payment "});
      } else{
        res.send({success: false, message: "Failed delting payment "})
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Error deleting data');
    }

  });

  // app.get('/stopservice', async (req, res) => {
  //   try {
  //     // const client = await pool.connect();
  //     const result = await client.query( `
  //     SELECT pg_terminate_backend(pid)
  //     FROM pg_stat_activity
  //     WHERE datname = 'd7si4nnk0mjhno'
  //     AND leader_pid IS NULL;

  //   `);
    
  //     res.send(true);
  //   } catch (err) {
  //     console.error(err);
  //     res.status(500).send('Error retrieving data');
  //   }
  // });


//Start server
  app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
