# ContestHub Server 🏆

ContestHub is a robust backend engine designed for a modern contest management platform.It facilitates a secure environment for users to create, discover, and participate in creative contests through role-based access control and integrated payment systems

## 🛠 Tech Stack

- **Environment:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB
- **Authentication:** JSON Web Token (JWT)
- **Payments:** Stripe
- **Deployment:** Vercel

## ✨ Core Features & Logic

- **Role-Based Access Control (RBAC):** Implements specialized middleware to protect routes for three distinct roles: Admin, Contest Creator, and Normal User.
- **Secure Authentication:** Uses JWT to protect private routes and ensures users stay logged in even after a page refresh.
- **Stripe Payment Integration:** Securely handles entry fee transactions; successful payments automatically register users and update participant counts.
- **Dynamic Leaderboard Logic:** Aggregated backend queries calculate and rank users based on their total number of contest wins.
- **Contest Management:** \* **Creators:** Can perform full CRUD operations on contests (Edit/Delete available only before Admin approval).
- **Admins:** High-level control to Confirm, Reject, or Delete any contest on the platform.
- **Data Integrity:** All sensitive information (MongoDB/Firebase secrets) is hidden using environment variables.
