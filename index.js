const express = require("express");
const app = express();
const cors = require("cors");
const port = 5000;
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(`${process.env.STRIPE_SECRET}`);

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

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
    // await client.connect();
    const db = client.db("contest_x_db");
    const contestsCollection = db.collection("contests");
    const usersCollection = db.collection("users");
    const winnersCollection = db.collection("winners");
    const paymentCollection = db.collection("payments");
    const submissionsCollection = db.collection("submissions");

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

    const verifyCreatorOrAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (!user || (user.role !== "creator" && user.role !== "admin")) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // contet api
    app.get("/contests", async (req, res) => {
      const creatorEmail = req.query.creatorEmail;
      const status = req.query.status;
      const type = req.query.type;
      const searchText = req.query.searchText;
      const query = {};

      if (searchText) {
        query.contest_type = { $regex: searchText, $options: "i" };
        query.status === "approved";
      }

      if (status) {
        query.status = status;
      }
      if (creatorEmail) {
        query.creatorEmail = creatorEmail;
      }
      if (type) {
        query.contest_type = type;
      }
      const cursor = contestsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/popular-contests", async (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit) : 0;
      const status = req.query.status;

      const query = {};
      if (status) {
        query.status = status;
      }

      const cursor = contestsCollection
        .find(query)
        .sort({ participantsCount: -1 })
        .limit(limit);
      const result = await cursor.toArray();
      res.send(result);
    });
    // the api wiht pipline
    app.get("/my-paid-contests", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      const pipeline = [
        {
          $match: { customerEmail: email },
        },
        {
          $addFields: { contestObjectId: { $toObjectId: "$contestId" } },
        },
        {
          $lookup: {
            from: "contests",
            localField: "contestObjectId",
            foreignField: "_id",
            as: "contest",
          },
        },
        {
          $unwind: { path: "$contest" },
        },
        {
          $match: { "contest.status": "approved" },
        },
        {
          $replaceRoot: { newRoot: "$contest" },
        },
        {
          $sort: { deadline: 1 },
        },
      ];
      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get("/contests/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contestsCollection.findOne(query);
      res.send(result);
    });

    app.delete(
      "/contests/:id",
      verifyFBToken,
      verifyCreatorOrAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contestsCollection.deleteOne(query);
        res.send(result);
      }
    );

    app.post("/contests", verifyFBToken, verifyCreator, async (req, res) => {
      const contest = req.body;
      contest.winner = {};
      const deadline = new Date(contest.deadline);
      const now = new Date();
      contest.createdAt = new Date();
      contest.participants = [];
      contest.participantsCount = 0;
      contest.isEnded = deadline <= now ? true : false;
      contest.status = "pending";
      const result = await contestsCollection.insertOne(contest);
      res.send(result);
    });
    app.patch(
      "/contests/:id",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const updatedData = req.body;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            name: updatedData.name,
            prize_money: updatedData.prize_money,
            contest_type: updatedData.contest_type,
            description: updatedData.description,
            image: updatedData.image,
            entry_fee: updatedData.entry_fee,
            instructions: updatedData.instructions,
            deadline: updatedData.deadline,
          },
        };
        const result = await contestsCollection.updateOne(query, update);
        res.send(result);
      }
    );

    app.patch(
      "/contests/:id/winner",
      verifyFBToken,
      verifyCreator,
      async (req, res) => {
        const id = req.params.id;
        const winnerInfo = req.body;

        const contest = await contestsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (contest?.winner?.email) {
          return res
            .status(409)
            .send({ message: "Winner already declared for this contest" });
        }

        const user = await usersCollection.findOne({ email: winnerInfo.email });

        const winnerData = {
          name: winnerInfo.name,
          email: winnerInfo.email,
          photoURL: user?.photoURL,
          contestId: new ObjectId(id),
          contestName: contest.name,
          prize_money: contest.prize_money,
        };
        const update = {
          $set: {
            winner: {
              name: winnerInfo.name,
              email: winnerInfo.email,
              photoURL: user?.photoURL,
            },
          },
        };
        const contestResult = await contestsCollection.updateOne(
          { _id: new ObjectId(id) },
          update
        );

        const winnersResult = await winnersCollection.insertOne(winnerData);

        res.send({
          message: "Winner declared successfully",
          contestResult,
          winnersResult,
        });
      }
    );

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
    app.patch("/contests/:id/isEnded", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const isEndedInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const submissionQuery = { contestId: id };
      const update = {
        $set: {
          isEnded: isEndedInfo.isEnded,
        },
      };
      const SubmissionUpdate = {
        $set: {
          contestIsEnded: isEndedInfo.isEnded,
        },
      };
      const result = await contestsCollection.updateOne(query, update);
      const submissionUpdateResult = await submissionsCollection.updateMany(
        submissionQuery,
        SubmissionUpdate
      );
      res.send({
        message: "contest and submission isened updated",
        result,
        submissionUpdateResult,
      });
    });

    app.get("/win-percentage", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      const pipeline = [
        { $match: { customerEmail: email } },
        { $addFields: { contestObjectId: { $toObjectId: "$contestId" } } },
        {
          $lookup: {
            from: "contests",
            localField: "contestObjectId",
            foreignField: "_id",
            as: "contest",
          },
        },
        { $unwind: "$contest" },
        { $replaceRoot: { newRoot: "$contest" } },
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();

      const participatedCount = result.length;
      const wonCount = result.filter((c) => c.winner?.email === email).length;
      const winPercentage =
        participatedCount === 0 ? 0 : (wonCount / participatedCount) * 100;

      res.send({ participatedCount, wonCount, winPercentage });
    });

    // leaderbord  enpoint

    app.get("/leaderboard", async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: "winners",
            localField: "email",
            foreignField: "email",
            as: "userWins",
          },
        },
        {
          $addFields: {
            totalWins: { $size: "$userWins" },
          },
        },
        {
          $project: {
            _id: 1,
            displayName: 1,
            email: 1,
            photoURL: 1,
            totalWins: 1,
          },
        },
        { $sort: { totalWins: -1 } },
      ];
      const result = await usersCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // winners

    app.get("/winners", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = winnersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // submision

    app.get("/submissions", async (req, res) => {
      const creatorEmail = req.query.creatorEmail;
      const query = {};
      if (creatorEmail) {
        query.creatorEmail = creatorEmail;
      }

      const cursor = submissionsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get(
      "/submissions/:contestId",

      async (req, res) => {
        const contestId = req.params.contestId;
        const query = { contestId: contestId };
        const cursor = submissionsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      }
    );
    app.post("/submissions", verifyFBToken, async (req, res) => {
      const submissionData = req.body;
      const participantPaid = await paymentCollection.findOne({
        contestId: submissionData.contestId,
        customerEmail: submissionData.participantEmail,
      });
      if (!participantPaid) {
        return res.send({ message: "required payment" });
      }
      if (participantPaid) {
        submissionData.isPaid = true;
      }
      const submissionExists = await submissionsCollection.findOne({
        contestId: submissionData.contestId,
        participantEmail: submissionData.participantEmail,
      });
      if (submissionExists) {
        return res
          .status(409)
          .send({ message: "already submitted with users email" });
      }
      const result = await submissionsCollection.insertOne(submissionData);
      res.send(result);
    });

    // user api
    app.get("/users", async (req, res) => {
      const limit = parseInt(req.query.limit);
      const skip = parseInt(req.query.skip);
      const query = {};
      const cursor = usersCollection
        .find(query)
        .limit(limit || 0)
        .skip(skip || 0);
      const result = await cursor.toArray();
      const count = await usersCollection.countDocuments();
      res.send({ result, total: count });
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

    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedData = req.body;
      const query = { email: email };
      const update = {
        $set: {
          photoURL: updatedData.image,
          displayName: updatedData.name,
          bio: updatedData.bio,
        },
      };
      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const userExists = await usersCollection.findOne({
        email: userInfo.email,
      });
      if (userExists) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne({
        ...userInfo,
        role: "user",
        bio: "",
      });
      res.send(result);
    });

    // pament apis here
    app.get("/payments", async (req, res) => {
      const query = {};
      const cursor = paymentCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `please pay for ${paymentInfo.contestName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: { contestId: paymentInfo.contestId },
        customer_email: paymentInfo.participantEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", verifyFBToken, async (req, res) => {
      const session_id = req.query.session_id;
      const participant = req.body;
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === "paid") {
        const contestId = session.metadata.contestId;
        const query = { _id: new ObjectId(contestId) };
        const contest = await contestsCollection.findOne(query);

        const participantExists = contest.participants.find(
          (p) => p.email === participant.email
        );
        if (participantExists) {
          return res.send({ message: "participant already exists" });
        }

        const payment = {
          customerEmail: session.customer_email,
          contestId: session.metadata.contestId,
          currency: session.currency,
          transactionId: session.payment_intent,
          paidAt: new Date(),
        };

        const paymentExists = await paymentCollection.findOne({
          transactionId: payment.transactionId,
        });

        if (paymentExists) {
          res.send({
            message: "payment data already exists in payment collection",
          });
        } else {
          const paymentResult = await paymentCollection.insertOne(payment);
          res.send({ success: true });
        }

        const update = {
          $push: {
            participants: {
              email: participant.email,
              name: participant.name,
              participatedAt: new Date(),
            },
          },
          $inc: {
            participantsCount: 1,
          },
        };
        const result = await contestsCollection.updateOne(query, update);
        return res.send(result);
      }

      res.send({ success: false });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
