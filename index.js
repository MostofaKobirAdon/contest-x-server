const express = require("express");
const app = express();
const cors = require("cors");
const port = 3000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("firebase-admin");

const serviceAccount = require("./contest-x-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middlewares

app.use(express.json());
app.use(cors());
// funtion for verifying fb token
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `${process.env.MONGODB_URI}`;

// client
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("contest_x_db");
    const contestsCollection = db.collection("contests");
    const usersCollection = db.collection("users");
    const winnersCollection = db.collection("winners");
    // midllwar for varify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // verifuing creator  middlwaare

    const verifyCreator = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "creator") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // contest api
    app.get("/contests", async (req, res) => {
      // const sortBy = req.query.sortBy;
      // const order = req.query.order;
      const creatorEmail = req.query.creatorEmail;
      const status = req.query.status;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (creatorEmail) {
        query.creatorEmail = creatorEmail;
      }
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/popular-contests", async (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit) : 0;
      const query = {};
      const cursor = contestsCollection
        .find(query)
        .sort({ participantsCount: 1 })
        .limit(limit);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/contests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    });

    app.post("/contests", verifyFBToken, verifyCreator, async (req, res) => {
      const contest = req.body;
      contest.winner = {};
      const deadline = new Date(contest.deadline);
      const now = new Date();
      contest.createdAt = new Date();
      contest.participants = [];
      contest.participantsCount = contest.participants.length;
      contest.submissions = [];
      contest.isEnded = deadline <= now ? true : false;
      contest.status = "pending";
      const result = await contestsCollection.insertOne(contest);
      res.send(result);
    });

    app.patch(
      "/contests/:id/status",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const statusInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: statusInfo.status,
          },
        };
        const result = await contestsCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // user api
    app.get("/users", async (req, res) => {
      const query = {};
      const cursor = usersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email;
      user.role = "user";
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.send({ message: "user exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-

app.get("/", (req, res) => {
  res.send("contest x server is running");
});
app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
